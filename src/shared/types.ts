export type Book = {
  id: string;
  title: string;
  author: string | null;
  format: 'pdf' | 'epub';
  filePath: string;
  coverPath: string | null;
  addedAt: number;
  lastOpenedAt: number | null;
  position: string | null;
  indexedAt: number | null;
};

export type ChatScope = 'page' | 'book';

export const BOOK_SCOPE_PAGE_KEY = '__book__';

export function effectivePageKey(scope: ChatScope | undefined, pageKey: string): string {
  return scope === 'book' ? BOOK_SCOPE_PAGE_KEY : pageKey;
}

export type IndexStatus = {
  indexed: boolean;
  indexedAt: number | null;
  chunkCount: number;
};

export type RawChunk = {
  sourceLabel: string;
  text: string;
};

export type RetrievedChunk = {
  text: string;
  sourceLabel: string;
  score: number;
};

export type IndexProgress = {
  bookId: string;
  phase: 'embedding' | 'done' | 'error';
  embedded: number;
  total: number;
  message?: string;
};

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  bookId: string;
  pageKey: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

export type Settings = {
  model: string;
  hasApiKey: boolean;
};

export type PageContext = {
  pageKey: string;
  pageLabel: string;
  text: string;
};

export type ChatImage = {
  kind: 'page' | 'region';
  dataUrl: string;
};

export type ChatRequest = {
  requestId: string;
  bookId: string;
  bookTitle: string;
  pageKey: string;
  pageLabel: string;
  pageText: string;
  userMessage: string;
  images?: ChatImage[];
  selectedText?: string;
  scope?: ChatScope;
};

export type Highlight = {
  id: string;
  bookId: string;
  pageKey: string;
  pageLabel: string;
  text: string;
  /** EPUB: CFI range. PDF: JSON with rects in viewport-unit coords. */
  anchor: string;
  /** For PDF: 'pdf'; for EPUB: 'epub'. Drives render strategy. */
  kind: 'pdf' | 'epub';
  color: string;
  createdAt: number;
};

export type ChatChunk = {
  requestId: string;
  delta: string;
};

export type ChatDone = {
  requestId: string;
  assistantMessageId: string;
};

export type ChatError = {
  requestId: string;
  message: string;
};
