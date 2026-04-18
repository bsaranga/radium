/// <reference types="vite/client" />

import type {
  Book,
  ChatChunk,
  ChatDone,
  ChatError,
  ChatMessage,
  ChatRequest,
  Highlight,
  IndexProgress,
  IndexStatus,
  RawChunk,
  Settings,
} from '../../shared/types';

declare module '*?url' {
  const src: string;
  export default src;
}

declare global {
  interface Window {
    api: {
      listBooks: () => Promise<Book[]>;
      getBook: (id: string) => Promise<Book | null>;
      importBooks: () => Promise<Book[]>;
      openBook: (id: string) => Promise<Book | null>;
      savePosition: (id: string, position: string) => Promise<void>;
      deleteBook: (id: string) => Promise<void>;
      saveCover: (id: string, pngBytes: Uint8Array) => Promise<string>;

      listMessages: (bookId: string, pageKey: string) => Promise<ChatMessage[]>;
      clearThread: (bookId: string, pageKey: string) => Promise<void>;
      sendChat: (req: ChatRequest) => Promise<void>;

      onChatChunk: (cb: (c: ChatChunk) => void) => () => void;
      onChatDone: (cb: (d: ChatDone) => void) => () => void;
      onChatError: (cb: (e: ChatError) => void) => () => void;

      listHighlights: (
        bookId: string,
        pageKey?: string,
      ) => Promise<Highlight[]>;
      addHighlight: (h: Highlight) => Promise<void>;
      deleteHighlight: (id: string) => Promise<void>;

      buildIndex: (bookId: string, chunks: RawChunk[]) => Promise<void>;
      indexStatus: (bookId: string) => Promise<IndexStatus>;
      onIndexProgress: (cb: (p: IndexProgress) => void) => () => void;

      getSettings: () => Promise<Settings>;
      setSettings: (payload: {
        model?: string;
        apiKey?: string;
      }) => Promise<void>;
    };
  }
}

export {};
