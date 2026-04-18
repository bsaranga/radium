import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import { join, basename, extname } from 'node:path';
import { copyFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  initDb,
  listBooks,
  getBook,
  insertBook,
  touchBook,
  savePosition,
  deleteBook,
  type Book,
} from './db';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  initDb();

  protocol.handle('book', (request) => {
    const url = new URL(request.url);
    const filePath = decodeURIComponent(url.pathname);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  ipcMain.handle('books:list', () => listBooks());
  ipcMain.handle('books:get', (_e, id: string) => getBook(id));

  ipcMain.handle('books:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Import book',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Books', extensions: ['pdf', 'epub'] }],
    });
    if (result.canceled) return [];

    const imported: Book[] = [];
    const booksDir = join(app.getPath('userData'), 'books');

    for (const srcPath of result.filePaths) {
      const ext = extname(srcPath).toLowerCase();
      const format = ext === '.pdf' ? 'pdf' : ext === '.epub' ? 'epub' : null;
      if (!format) continue;

      const id = randomUUID();
      const destPath = join(booksDir, `${id}${ext}`);
      copyFileSync(srcPath, destPath);

      const book: Book = {
        id,
        title: basename(srcPath, ext),
        author: null,
        format,
        filePath: destPath,
        coverPath: null,
        addedAt: Date.now(),
        lastOpenedAt: null,
        position: null,
      };
      insertBook(book);
      imported.push(book);
    }
    return imported;
  });

  ipcMain.handle('books:open', (_e, id: string) => {
    touchBook(id);
    return getBook(id);
  });

  ipcMain.handle(
    'books:savePosition',
    (_e, id: string, position: string) => {
      savePosition(id, position);
    },
  );

  ipcMain.handle('books:delete', (_e, id: string) => {
    deleteBook(id);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
