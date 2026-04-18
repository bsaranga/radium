import OpenAI from 'openai';
import keytar from 'keytar';
import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import {
  getSetting,
  insertMessage,
  listMessages,
  updateMessageContent,
} from './db';
import type { ChatRequest, RetrievedChunk } from '../shared/types';
import { effectivePageKey } from '../shared/types';
import { retrieve } from './embed';

const KEYTAR_SERVICE = 'ReaderAI';
const KEYTAR_ACCOUNT = 'openai-api-key';

export async function getApiKey(): Promise<string | null> {
  return keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
}

export async function setApiKey(key: string): Promise<void> {
  if (key.trim() === '') {
    await keytar.deletePassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
  } else {
    await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, key.trim());
  }
}

const SYSTEM_PROMPT = `You are Radium, an assistant embedded in an ebook reader. The user is reading a non-fiction, technical, or scholarly work and is asking questions about the page currently open in front of them.

Guidelines:
- Ground your answers in the provided page text. If the page alone is insufficient, say so, then answer from general knowledge while being explicit about the distinction.
- When the user asks you to explain, be concrete: pick the most important ideas, define unfamiliar terminology, and link concepts to each other.
- Prefer concise, well-structured answers. Use headings, bullet lists, and code blocks when they genuinely aid clarity — not as decoration.
- Do not repeat the page text back unless asked.
- Never invent page numbers or citations.

Selection:
- If the book context includes a \`<selection>\` block, the user is asking specifically about that passage. Answer about the selection first; use surrounding page text only as context.
- When quoting the book, quote from the selection or page text verbatim; do not paraphrase inside quotes.

Citations:
- When your answer leans on a specific part of the page, cite the location inline as \`(<page_label>)\` — e.g. \`(Page 42)\` — using the \`Current location\` label from the book context. Do not invent labels.
- When retrieved excerpts from \`<retrieved_context>\` are used, cite them using the \`source\` value attached to each excerpt. Use EXACTLY these two formats, and nothing else:
  - PDFs: \`(Page N)\` where N is the page number from the source label.
  - EPUBs: \`(§ <source>)\` where \`<source>\` is the source value verbatim (do not rename or translate it).
- Do not wrap citations in backticks, quotes, or markdown links — the renderer linkifies the raw text. Place each citation immediately after the claim it supports.

Images:
- When the user attaches a page or region image, treat it as authoritative for any diagrams, figures, tables, or equations that don't round-trip through extracted text. Read what's actually drawn.
- For tables, transcribe to GitHub-flavored markdown tables when asked.
- For diagrams, describe the structure (nodes, edges, flow direction) and what it conveys, not just its appearance.

Math formatting:
- The user's chat view renders LaTeX via KaTeX. When math is warranted, you MUST use dollar-sign delimiters: \`$…$\` for inline, \`$$…$$\` for display.
- Do NOT use \`\\( … \\)\` or \`\\[ … \\]\` — those do not render.
- Do NOT wrap math in backticks or code fences — that prevents rendering.
- If the page is plain prose with no math, stay in plain markdown. Do not fabricate equations.
- A hint \`math_likely=true|false\` is provided in the book context based on a lightweight heuristic; treat it as a signal, not a mandate.`;

function detectMathLikely(text: string): boolean {
  if (!text) return false;
  const signals = [
    /[∑∫∂∇∞≈≠≤≥±×÷√∈∉⊂⊆∪∩]/, // math operators
    /[α-ωΑ-Ω]/, // greek letters
    /\\(frac|sum|int|sqrt|alpha|beta|gamma|theta|lambda|mu|sigma|pi|infty)\b/, // LaTeX macros
    /\b[a-zA-Z]\s*=\s*[-+]?\d/, // variable = number
    /\b(equation|theorem|lemma|proof|corollary)\b/i,
    /\^\{[^}]+\}|_\{[^}]+\}/, // ^{…} _{…}
  ];
  let hits = 0;
  for (const re of signals) if (re.test(text)) hits++;
  return hits >= 2;
}

function buildRetrievedBlock(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  const body = chunks
    .map(
      (c, i) =>
        `[${i + 1}] source="${c.sourceLabel}"\n${c.text.trim()}`,
    )
    .join('\n\n');
  return `\n<retrieved_context>\nThese excerpts were pulled from elsewhere in the book and may be relevant:\n\n${body}\n</retrieved_context>\n`;
}

function buildUserText(req: ChatRequest, retrieved: RetrievedChunk[]): string {
  const mathLikely = detectMathLikely(req.pageText);
  const imageNote = req.images?.length
    ? `\nAttached images: ${req.images
        .map((i) => (i.kind === 'region' ? 'selected region' : 'full page'))
        .join(', ')}.`
    : '';
  const selectionBlock = req.selectedText?.trim()
    ? `\n<selection>\n${req.selectedText.trim()}\n</selection>\n`
    : '';
  const retrievedBlock = buildRetrievedBlock(retrieved);

  if (req.scope === 'book') {
    return `<book_context>
Title: ${req.bookTitle}
scope: book
math_likely: ${mathLikely}${imageNote}
${selectionBlock}${retrievedBlock}</book_context>

${req.userMessage}`;
  }

  return `<book_context>
Title: ${req.bookTitle}
Current location: ${req.pageLabel}
scope: page
math_likely: ${mathLikely}${imageNote}
${selectionBlock}
Page text:
${req.pageText.trim() || '(no extractable text on this page)'}
${retrievedBlock}</book_context>

${req.userMessage}`;
}

function buildUserMessage(
  req: ChatRequest,
  retrieved: RetrievedChunk[],
) {
  const text = buildUserText(req, retrieved);
  if (!req.images?.length) return { role: 'user' as const, content: text };
  const parts: any[] = [{ type: 'text', text }];
  for (const img of req.images) {
    parts.push({
      type: 'image_url',
      image_url: { url: img.dataUrl, detail: 'high' },
    });
  }
  return { role: 'user' as const, content: parts };
}

export async function runChat(
  webContents: WebContents,
  req: ChatRequest,
): Promise<void> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    webContents.send('chat:error', {
      requestId: req.requestId,
      message:
        'No OpenAI API key configured. Open Settings (gear icon) to add one.',
    });
    return;
  }

  const model = getSetting('model') ?? 'gpt-4o-mini';

  const threadKey = effectivePageKey(req.scope, req.pageKey);

  insertMessage({
    id: randomUUID(),
    bookId: req.bookId,
    pageKey: threadKey,
    role: 'user',
    content: req.userMessage,
    createdAt: Date.now(),
  });

  const history = listMessages(req.bookId, threadKey);
  const historyMessages = history.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const assistantId = randomUUID();
  insertMessage({
    id: assistantId,
    bookId: req.bookId,
    pageKey: threadKey,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
  });

  const client = new OpenAI({ apiKey });
  let accumulated = '';

  let retrieved: RetrievedChunk[] = [];
  if (req.scope === 'book') {
    try {
      const q = [req.userMessage, req.selectedText].filter(Boolean).join('\n');
      retrieved = await retrieve(req.bookId, q, 6);
    } catch (err) {
      console.warn('retrieval failed', err);
    }
  }

  try {
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historyMessages,
        buildUserMessage(req, retrieved),
      ] as any,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        accumulated += delta;
        webContents.send('chat:chunk', {
          requestId: req.requestId,
          delta,
        });
      }
    }

    updateMessageContent(assistantId, accumulated);
    webContents.send('chat:done', {
      requestId: req.requestId,
      assistantMessageId: assistantId,
    });
  } catch (err: any) {
    updateMessageContent(
      assistantId,
      accumulated || '[request failed — no response]',
    );
    webContents.send('chat:error', {
      requestId: req.requestId,
      message: err?.message ?? String(err),
    });
  }
}
