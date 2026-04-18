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

export type ChatRequest = {
  requestId: string;
  bookId: string;
  bookTitle: string;
  pageKey: string;
  pageLabel: string;
  pageText: string;
  userMessage: string;
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
