import { contextBridge, ipcRenderer } from 'electron';
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
} from '../shared/types';

export type { Book };

const api = {
  listBooks: (): Promise<Book[]> => ipcRenderer.invoke('books:list'),
  getBook: (id: string): Promise<Book | null> =>
    ipcRenderer.invoke('books:get', id),
  importBooks: (): Promise<Book[]> => ipcRenderer.invoke('books:import'),
  openBook: (id: string): Promise<Book | null> =>
    ipcRenderer.invoke('books:open', id),
  savePosition: (id: string, position: string): Promise<void> =>
    ipcRenderer.invoke('books:savePosition', id, position),
  deleteBook: (id: string): Promise<void> =>
    ipcRenderer.invoke('books:delete', id),
  saveCover: (id: string, pngBytes: Uint8Array): Promise<string> =>
    ipcRenderer.invoke('books:saveCover', id, pngBytes),

  listMessages: (bookId: string, pageKey: string): Promise<ChatMessage[]> =>
    ipcRenderer.invoke('chat:messages', bookId, pageKey),
  clearThread: (bookId: string, pageKey: string): Promise<void> =>
    ipcRenderer.invoke('chat:clear', bookId, pageKey),
  sendChat: (req: ChatRequest): Promise<void> =>
    ipcRenderer.invoke('chat:send', req),

  onChatChunk: (cb: (c: ChatChunk) => void) => {
    const listener = (_e: unknown, c: ChatChunk) => cb(c);
    ipcRenderer.on('chat:chunk', listener);
    return () => ipcRenderer.removeListener('chat:chunk', listener);
  },
  onChatDone: (cb: (d: ChatDone) => void) => {
    const listener = (_e: unknown, d: ChatDone) => cb(d);
    ipcRenderer.on('chat:done', listener);
    return () => ipcRenderer.removeListener('chat:done', listener);
  },
  onChatError: (cb: (e: ChatError) => void) => {
    const listener = (_e: unknown, err: ChatError) => cb(err);
    ipcRenderer.on('chat:error', listener);
    return () => ipcRenderer.removeListener('chat:error', listener);
  },

  listHighlights: (bookId: string, pageKey?: string): Promise<Highlight[]> =>
    ipcRenderer.invoke('highlights:list', bookId, pageKey),
  addHighlight: (h: Highlight): Promise<void> =>
    ipcRenderer.invoke('highlights:add', h),
  deleteHighlight: (id: string): Promise<void> =>
    ipcRenderer.invoke('highlights:delete', id),

  buildIndex: (bookId: string, chunks: RawChunk[]): Promise<void> =>
    ipcRenderer.invoke('index:build', bookId, chunks),
  indexStatus: (bookId: string): Promise<IndexStatus> =>
    ipcRenderer.invoke('index:status', bookId),
  onIndexProgress: (cb: (p: IndexProgress) => void) => {
    const listener = (_e: unknown, p: IndexProgress) => cb(p);
    ipcRenderer.on('index:progress', listener);
    return () => ipcRenderer.removeListener('index:progress', listener);
  },

  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (payload: {
    model?: string;
    apiKey?: string;
  }): Promise<void> => ipcRenderer.invoke('settings:set', payload),
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
