import { contextBridge, ipcRenderer } from 'electron';
import type { Book } from '../shared/types';

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
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
