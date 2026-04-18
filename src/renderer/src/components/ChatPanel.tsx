import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import type {
  Book,
  ChatMessage,
  PageContext,
} from '../../../shared/types';

type Props = {
  book: Book;
  pageContext: PageContext | null;
  onOpenSettings: () => void;
};

const QUICK_ACTIONS = [
  { label: 'Explain this page', prompt: 'Explain the key ideas on this page.' },
  { label: 'Summarize', prompt: 'Summarize this page in a few bullet points.' },
  {
    label: 'Define terms',
    prompt:
      'List and define the key technical terms introduced on this page.',
  },
  {
    label: 'ELI5',
    prompt: 'Explain this page like I am five.',
  },
];

export function ChatPanel({ book, pageContext, onOpenSettings }: Props) {
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

      await window.api.sendChat({
        requestId,
        bookId: book.id,
        bookTitle: book.title,
        pageKey: pageContext.pageKey,
        pageLabel: pageContext.pageLabel,
        pageText: pageContext.text,
        userMessage: content,
      });
    },
    [book, pageContext, streaming],
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
            Ask about what you're reading. The AI sees the current page text.
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
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => send(a.prompt)}
            disabled={!pageContext || !!streaming}
          >
            {a.label}
          </button>
        ))}
      </div>

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
