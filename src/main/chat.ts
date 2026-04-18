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
import type { ChatRequest } from '../shared/types';

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

const SYSTEM_PROMPT = `You are ReaderAI, an assistant embedded in an ebook reader. The user is reading a non-fiction, technical, or scholarly work and is asking questions about the page currently open in front of them.

Guidelines:
- Ground your answers in the provided page text. If the page alone is insufficient, say so, then answer from general knowledge while being explicit about the distinction.
- When the user asks you to explain, be concrete: pick the most important ideas, define unfamiliar terminology, and link concepts to each other.
- Prefer concise, well-structured answers. Use headings, bullet lists, and code blocks when they genuinely aid clarity — not as decoration.
- Do not repeat the page text back unless asked.
- Never invent page numbers or citations.

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

function buildUserContent(req: ChatRequest): string {
  const mathLikely = detectMathLikely(req.pageText);
  return `<book_context>
Title: ${req.bookTitle}
Current location: ${req.pageLabel}
math_likely: ${mathLikely}

Page text:
${req.pageText.trim() || '(no extractable text on this page)'}
</book_context>

${req.userMessage}`;
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

  insertMessage({
    id: randomUUID(),
    bookId: req.bookId,
    pageKey: req.pageKey,
    role: 'user',
    content: req.userMessage,
    createdAt: Date.now(),
  });

  const history = listMessages(req.bookId, req.pageKey);
  const historyMessages = history.slice(0, -1).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const assistantId = randomUUID();
  insertMessage({
    id: assistantId,
    bookId: req.bookId,
    pageKey: req.pageKey,
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
  });

  const client = new OpenAI({ apiKey });
  let accumulated = '';

  try {
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historyMessages,
        { role: 'user', content: buildUserContent(req) },
      ],
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
