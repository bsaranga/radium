import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import type {
  Book,
  ChatImage,
  ChatMessage,
  PageContext,
} from '../../../shared/types';

type Props = {
  book: Book;
  pageContext: PageContext | null;
  pendingImage: ChatImage | null;
  onClearPendingImage: () => void;
  onOpenSettings: () => void;
};

const TEXT_ACTIONS = [
  { label: 'Explain this page', prompt: 'Explain the key ideas on this page.' },
  { label: 'Summarize', prompt: 'Summarize this page in a few bullet points.' },
  {
    label: 'Define terms',
    prompt:
      'List and define the key technical terms introduced on this page.',
  },
  { label: 'ELI5', prompt: 'Explain this page like I am five.' },
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
  onOpenSettings,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<{
    requestId: string;
    text: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pageKey = pageContext?.pageKey ?? '';

  useEffect(() => {
    if (!pageKey) return;
    window.api.listMessages(book.id, pageKey).then(setMessages);
    setStreaming(null);
    setError(null);
  }, [book.id, pageKey]);

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
      if (pageKey) {
        const m = await window.api.listMessages(book.id, pageKey);
        setMessages(m);
      }
    });
    const offErr = window.api.onChatError(async (e) => {
      setError(e.message);
      setStreaming(null);
      if (pageKey) {
        const m = await window.api.listMessages(book.id, pageKey);
        setMessages(m);
      }
    });
    return () => {
      offChunk();
      offDone();
      offErr();
    };
  }, [book.id, pageKey]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming?.text]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || !pageContext || streaming) return;
      setError(null);

      const images: ChatImage[] = pendingImage ? [pendingImage] : [];

      const requestId = crypto.randomUUID();
      const optimistic: ChatMessage = {
        id: `temp-${requestId}`,
        bookId: book.id,
        pageKey: pageContext.pageKey,
        role: 'user',
        content,
        createdAt: Date.now(),
      };
      setMessages((m) => [...m, optimistic]);
      setStreaming({ requestId, text: '' });
      setInput('');
      onClearPendingImage();

      await window.api.sendChat({
        requestId,
        bookId: book.id,
        bookTitle: book.title,
        pageKey: pageContext.pageKey,
        pageLabel: pageContext.pageLabel,
        pageText: pageContext.text,
        userMessage: content,
        images: images.length ? images : undefined,
      });
    },
    [book, pageContext, streaming, pendingImage, onClearPendingImage],
  );

  const clear = async () => {
    if (!pageKey) return;
    if (!confirm('Clear chat history for this page?')) return;
    await window.api.clearThread(book.id, pageKey);
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
              ? `Scope: ${pageContext.pageLabel}`
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

      <div className="chat-scroll" ref={scrollerRef}>
        {messages.length === 0 && !streaming && (
          <div className="chat-empty">
            Ask about what you're reading. Attach the page or a selected region
            to ask about diagrams and tables.
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} role={m.role} content={m.content} />
        ))}
        {streaming && (
          <Message
            role="assistant"
            content={streaming.text || '…'}
            streaming
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
          : TEXT_ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => send(a.prompt)}
                disabled={disabled}
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

      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            pageContext
              ? 'Ask about this page… (Enter to send, Shift+Enter for newline)'
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

function Message({
  role,
  content,
  streaming,
}: {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}) {
  const copy = () => navigator.clipboard.writeText(content);
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
          >
            {normalizeMathDelimiters(content)}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
