import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import type {
  Book,
  ChatImage,
  ChatMessage,
  ChatScope,
  Highlight,
  IndexProgress,
  IndexStatus,
  PageContext,
} from '../../../shared/types';
import { effectivePageKey } from '../../../shared/types';
import type { SelectionEvent } from '../readers/types';
import { HighlightsCarousel } from './HighlightsCarousel';
import { extractChunksForIndexing } from '../lib/indexing';

type Props = {
  book: Book;
  pageContext: PageContext | null;
  pendingImage: ChatImage | null;
  onClearPendingImage: () => void;
  onCaptureFullPage: () => Promise<ChatImage | null>;
  pendingPrompt: { text: string; selection: SelectionEvent } | null;
  onConsumePendingPrompt: () => void;
  highlights: Highlight[];
  onAskAboutHighlight: (h: Highlight) => void;
  onDeleteHighlight: (h: Highlight) => void;
  onNavigate: (url: string) => void;
  onOpenSettings: () => void;
};

const PAGE_TEXT_FALLBACK_THRESHOLD = 40;

const PAGE_ACTIONS = [
  { label: 'Explain this page', prompt: 'Explain the key ideas on this page.' },
  { label: 'Summarize', prompt: 'Summarize this page in a few bullet points.' },
  {
    label: 'Define terms',
    prompt:
      'List and define the key technical terms introduced on this page.',
  },
  { label: 'ELI5', prompt: 'Explain this page like I am five.' },
];

const BOOK_ACTIONS = [
  {
    label: 'Prerequisites',
    prompt:
      'What prerequisites — topics, skills, or prior reading — does this book assume? Base this on the book itself, not guesses.',
  },
  {
    label: 'Summarize book',
    prompt:
      'Summarize this entire book. Cover: the thesis, the main arguments or topics by section, and the conclusion. Keep it under 400 words.',
  },
  {
    label: 'Key takeaways',
    prompt:
      'What are the key takeaways from this book? Give a short bulleted list of the most important ideas a reader should leave with.',
  },
  {
    label: 'Who is it for?',
    prompt:
      'Who is this book written for? Describe the intended audience and what they get out of it.',
  },
  {
    label: 'Table of contents',
    prompt:
      'Infer a table of contents for this book from the retrieved excerpts. List chapters or major sections with a one-line description each.',
  },
];

const VISION_ACTIONS = [
  {
    label: 'Explain selection',
    prompt:
      'Explain the attached selection: what it depicts, the components, and what the reader should take away.',
  },
  {
    label: 'Extract table',
    prompt:
      'Transcribe the table in the attached selection to a GitHub-flavored markdown table. Preserve column order and values exactly.',
  },
  {
    label: 'Describe figure',
    prompt: 'Describe the figure in the attached selection in detail.',
  },
  {
    label: 'Explain equation',
    prompt:
      'Explain the equation in the attached selection: name the quantities, describe what it says, and why it matters in context.',
  },
];

export function ChatPanel({
  book,
  pageContext,
  pendingImage,
  onClearPendingImage,
  onCaptureFullPage,
  pendingPrompt,
  onConsumePendingPrompt,
  highlights,
  onAskAboutHighlight,
  onDeleteHighlight,
  onNavigate,
  onOpenSettings,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [stagedSelection, setStagedSelection] =
    useState<SelectionEvent | null>(null);
  const [streaming, setStreaming] = useState<{
    requestId: string;
    text: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<ChatScope>('page');
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(
    null,
  );
  const [preparing, setPreparing] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pageKey = pageContext?.pageKey ?? '';
  const threadKey = pageKey ? effectivePageKey(scope, pageKey) : '';

  useEffect(() => {
    if (!threadKey) return;
    window.api.listMessages(book.id, threadKey).then(setMessages);
    setStreaming(null);
    setError(null);
  }, [book.id, threadKey]);

  useEffect(() => {
    window.api.indexStatus(book.id).then(setIndexStatus);
  }, [book.id]);

  useEffect(() => {
    return window.api.onIndexProgress((p) => {
      if (p.bookId !== book.id) return;
      setIndexProgress(p);
      if (p.phase === 'done') {
        window.api.indexStatus(book.id).then(setIndexStatus);
      } else if (p.phase === 'error') {
        setError(p.message ?? 'Indexing failed');
      }
    });
  }, [book.id]);

  const buildIndex = useCallback(async () => {
    setError(null);
    setPreparing(true);
    try {
      const chunks = await extractChunksForIndexing(book);
      if (chunks.length === 0) {
        setError('No extractable text found in this book.');
        return;
      }
      setIndexProgress({
        bookId: book.id,
        phase: 'embedding',
        embedded: 0,
        total: chunks.length,
      });
      await window.api.buildIndex(book.id, chunks);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to prepare index');
    } finally {
      setPreparing(false);
    }
  }, [book]);

  useEffect(() => {
    const offChunk = window.api.onChatChunk((c) => {
      setStreaming((prev) =>
        prev && prev.requestId === c.requestId
          ? { ...prev, text: prev.text + c.delta }
          : prev,
      );
    });
    const offDone = window.api.onChatDone(async () => {
      setStreaming(null);
      if (threadKey) {
        const m = await window.api.listMessages(book.id, threadKey);
        setMessages(m);
      }
    });
    const offErr = window.api.onChatError(async (e) => {
      setError(e.message);
      setStreaming(null);
      if (threadKey) {
        const m = await window.api.listMessages(book.id, threadKey);
        setMessages(m);
      }
    });
    return () => {
      offChunk();
      offDone();
      offErr();
    };
  }, [book.id, threadKey]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming?.text]);

  const send = useCallback(
    async (text: string, selectionOverride?: SelectionEvent | null) => {
      const content = text.trim();
      if (!content || !pageContext || streaming) return;
      setError(null);

      const images: ChatImage[] = pendingImage ? [pendingImage] : [];
      const sel = selectionOverride ?? stagedSelection;

      // Vision fallback: in page scope with no attachment, if the page has
      // no meaningful extractable text, auto-capture it so the model can
      // read from the image (cover pages, scanned PDFs, image-only sections).
      const pageTextLen = pageContext.text.trim().length;
      if (
        scope === 'page' &&
        images.length === 0 &&
        !sel &&
        pageTextLen < PAGE_TEXT_FALLBACK_THRESHOLD
      ) {
        const fallback = await onCaptureFullPage();
        if (fallback) images.push(fallback);
      }

      const requestId = crypto.randomUUID();
      const optimistic: ChatMessage = {
        id: `temp-${requestId}`,
        bookId: book.id,
        pageKey: threadKey,
        role: 'user',
        content,
        createdAt: Date.now(),
      };
      setMessages((m) => [...m, optimistic]);
      setStreaming({ requestId, text: '' });
      setInput('');
      onClearPendingImage();
      setStagedSelection(null);

      await window.api.sendChat({
        requestId,
        bookId: book.id,
        bookTitle: book.title,
        pageKey: sel?.pageKey ?? pageContext.pageKey,
        pageLabel: sel?.pageLabel ?? pageContext.pageLabel,
        pageText: pageContext.text,
        userMessage: content,
        images: images.length ? images : undefined,
        selectedText: sel?.text,
        scope,
      });
    },
    [
      book,
      pageContext,
      streaming,
      pendingImage,
      stagedSelection,
      onClearPendingImage,
      onCaptureFullPage,
      scope,
      threadKey,
    ],
  );

  // Handle pending prompt from selection toolbar
  useEffect(() => {
    if (!pendingPrompt || !pageContext) return;
    const { text, selection } = pendingPrompt;
    if (text) {
      onConsumePendingPrompt();
      send(text, selection);
    } else {
      setStagedSelection(selection);
      setInput('');
      inputRef.current?.focus();
      onConsumePendingPrompt();
    }
  }, [pendingPrompt, pageContext, onConsumePendingPrompt, send]);

  const clear = async () => {
    if (!threadKey) return;
    const scopeLabel = scope === 'book' ? 'whole book' : 'this page';
    if (!confirm(`Clear chat history for ${scopeLabel}?`)) return;
    await window.api.clearThread(book.id, threadKey);
    setMessages([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const disabled = !pageContext || !!streaming;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div>
          <strong>AI Chat</strong>
          <div className="chat-sub">
            {pageContext
              ? scope === 'page'
                ? `Scope: ${pageContext.pageLabel}`
                : `Scope: Whole book${
                    indexStatus?.chunkCount
                      ? ` · ${indexStatus.chunkCount} chunks`
                      : ''
                  }`
              : 'Loading page…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={clear}
            disabled={messages.length === 0}
            title="Clear this page's chat"
          >
            Clear
          </button>
          <button onClick={onOpenSettings} title="Settings">
            ⚙
          </button>
        </div>
      </div>

      <div className="scope-toggle" role="tablist">
        <button
          className={scope === 'page' ? 'active' : ''}
          onClick={() => setScope('page')}
          role="tab"
        >
          Page
        </button>
        <button
          className={scope === 'book' ? 'active' : ''}
          onClick={() => setScope('book')}
          role="tab"
        >
          Whole book
        </button>
      </div>

      {scope === 'book' && (!indexStatus?.indexed || indexProgress) && (
        <IndexBanner
          indexStatus={indexStatus}
          progress={indexProgress}
          preparing={preparing}
          onBuild={buildIndex}
        />
      )}

      {scope === 'page' && (
        <HighlightsCarousel
          highlights={highlights.filter((h) => h.pageKey === pageKey)}
          onAskAbout={onAskAboutHighlight}
          onDelete={onDeleteHighlight}
        />
      )}

      <div className="chat-scroll" ref={scrollerRef}>
        {messages.length === 0 && !streaming && (
          <div className="chat-empty">
            Ask about what you're reading. Attach the page or a selected region
            to ask about diagrams and tables.
          </div>
        )}
        {messages.map((m) => (
          <Message
            key={m.id}
            role={m.role}
            content={m.content}
            bookFormat={book.format}
            linkifyCitations={scope === 'book'}
            onNavigate={onNavigate}
          />
        ))}
        {streaming && (
          <Message
            role="assistant"
            content={streaming.text || '…'}
            streaming
            bookFormat={book.format}
            linkifyCitations={scope === 'book'}
            onNavigate={onNavigate}
          />
        )}
        {error && <div className="chat-error">{error}</div>}
      </div>

      <div className="quick-actions">
        {pendingImage
          ? VISION_ACTIONS.map((a) => (
              <button
                key={a.label}
                className="vision-action"
                onClick={() => send(a.prompt)}
                disabled={disabled}
              >
                📷 {a.label}
              </button>
            ))
          : (scope === 'book' ? BOOK_ACTIONS : PAGE_ACTIONS).map((a) => (
              <button
                key={a.label}
                onClick={() => send(a.prompt)}
                disabled={
                  disabled ||
                  (scope === 'book' && !indexStatus?.indexed)
                }
                title={
                  scope === 'book' && !indexStatus?.indexed
                    ? 'Index the book first'
                    : undefined
                }
              >
                {a.label}
              </button>
            ))}
      </div>

      {pendingImage && (
        <div className="attachment">
          <img src={pendingImage.dataUrl} alt="pending" />
          <div className="attachment-meta">
            <strong>
              {pendingImage.kind === 'region'
                ? 'Selected region'
                : 'Full page'}
            </strong>
            <small>will be sent with your next message</small>
          </div>
          <button onClick={onClearPendingImage} title="Remove">
            ✕
          </button>
        </div>
      )}

      {stagedSelection && (
        <div className="selection-chip">
          <div className="selection-chip-body">
            <strong>Selected · {stagedSelection.pageLabel}</strong>
            <span>"{truncate(stagedSelection.text, 140)}"</span>
          </div>
          <button
            onClick={() => setStagedSelection(null)}
            title="Remove selection"
          >
            ✕
          </button>
        </div>
      )}

      <div className="chat-input">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            pageContext
              ? stagedSelection
                ? 'Ask about the selected passage…'
                : scope === 'book'
                  ? indexStatus?.indexed
                    ? 'Ask about the whole book… (Enter to send)'
                    : 'Index the book to enable whole-book chat.'
                  : 'Ask about this page… (Enter to send, Shift+Enter for newline)'
              : 'Loading page…'
          }
          rows={3}
          disabled={!pageContext}
        />
        <button
          className="primary"
          onClick={() => send(input)}
          disabled={!input.trim() || !!streaming || !pageContext}
        >
          {streaming ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function IndexBanner({
  indexStatus,
  progress,
  preparing,
  onBuild,
}: {
  indexStatus: IndexStatus | null;
  progress: IndexProgress | null;
  preparing: boolean;
  onBuild: () => void;
}) {
  const active =
    preparing ||
    (progress && progress.phase === 'embedding' && progress.total > 0);
  const pct = progress?.total
    ? Math.round((progress.embedded / progress.total) * 100)
    : 0;

  if (active) {
    return (
      <div className="index-banner">
        <div>
          {preparing && !progress
            ? 'Extracting book text…'
            : `Indexing · ${progress?.embedded ?? 0}/${progress?.total ?? 0}`}
        </div>
        <div className="index-bar">
          <div className="index-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  if (indexStatus?.indexed) return null;

  return (
    <div className="index-banner">
      <div>Whole-book chat needs an index. This uses OpenAI embeddings.</div>
      <button className="primary" onClick={onBuild}>
        Index this book
      </button>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

function normalizeMathDelimiters(src: string): string {
  const segments: { text: string; isCode: boolean }[] = [];
  const codeRe = /(```[\s\S]*?```|`[^`\n]*`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(src))) {
    if (m.index > last)
      segments.push({ text: src.slice(last, m.index), isCode: false });
    segments.push({ text: m[0], isCode: true });
    last = m.index + m[0].length;
  }
  if (last < src.length)
    segments.push({ text: src.slice(last), isCode: false });

  return segments
    .map((s) => {
      if (s.isCode) return s.text;
      return s.text
        .replace(/\\\[([\s\S]+?)\\\]/g, (_, body) => `\n$$${body}$$\n`)
        .replace(/\\\(([\s\S]+?)\\\)/g, (_, body) => `$${body}$`);
    })
    .join('');
}

function linkifyCitations(
  src: string,
  format: 'pdf' | 'epub',
): string {
  if (format === 'pdf') {
    // Match any "Page N" / "page N" / "pp. N" / "p. N", whether or not
    // wrapped in parens or part of a range. Each number gets its own link.
    return src.replace(
      /\b(?:Pages?|pp?\.)\s*(\d+)(?:\s*[-–—,]\s*(\d+))?/gi,
      (match, a: string, b?: string) => {
        const first = `[${match.replace(/\s*[-–—,]\s*\d+$/, '').trim()}](reader://page/${a})`;
        if (!b) return first;
        // Rebuild range: keep first chunk linked, link the trailing number.
        const sepMatch = match.match(/\s*([-–—,])\s*\d+$/);
        const sep = sepMatch ? sepMatch[0].replace(/\d+$/, '') : '–';
        return `${first}${sep}[${b}](reader://page/${b})`;
      },
    );
  }
  return src.replace(/\(§\s*([^)]+?)\s*\)/g, (_, raw) => {
    const label = String(raw).trim();
    return `([§ ${label}](reader://href/${encodeURIComponent(label)}))`;
  });
}

function Message({
  role,
  content,
  streaming,
  bookFormat,
  linkifyCitations: shouldLinkify,
  onNavigate,
}: {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  bookFormat: 'pdf' | 'epub';
  linkifyCitations: boolean;
  onNavigate: (url: string) => void;
}) {
  const copy = () => navigator.clipboard.writeText(content);

  let rendered = normalizeMathDelimiters(content);
  if (role === 'assistant' && shouldLinkify) {
    rendered = linkifyCitations(rendered, bookFormat);
  }

  return (
    <div className={`msg msg-${role}`}>
      <div className="msg-role">
        <span>{role === 'user' ? 'You' : 'AI'}</span>
        {!streaming && content && (
          <button className="icon-btn" onClick={copy} title="Copy">
            ⎘
          </button>
        )}
      </div>
      <div className="msg-body">
        {role === 'user' ? (
          <div className="user-text">{content}</div>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeHighlight, rehypeKatex]}
            urlTransform={(url) =>
              url.startsWith('reader://') ? url : defaultUrlTransform(url)
            }
            components={{
              a: ({ href, children, ...rest }) => {
                if (href?.startsWith('reader://')) {
                  return (
                    <button
                      type="button"
                      className="citation-link"
                      onClick={() => onNavigate(href)}
                    >
                      {children}
                    </button>
                  );
                }
                return (
                  <a href={href} {...rest}>
                    {children}
                  </a>
                );
              },
            }}
          >
            {rendered}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
