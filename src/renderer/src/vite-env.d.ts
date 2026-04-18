/// <reference types="vite/client" />

import type { Book } from '../../shared/types';

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
    };
  }
}

export {};
