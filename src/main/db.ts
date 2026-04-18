import Database from 'better-sqlite3';
import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Book, ChatMessage, ChatRole } from '../shared/types';

export type { Book, ChatMessage };

let db: Database.Database;

export function initDb() {
  const userData = app.getPath('userData');
  mkdirSync(join(userData, 'books'), { recursive: true });
  mkdirSync(join(userData, 'covers'), { recursive: true });
  db = new Database(join(userData, 'reader-ai.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      format TEXT NOT NULL,
      file_path TEXT NOT NULL,
      cover_path TEXT,
      added_at INTEGER NOT NULL,
      last_opened_at INTEGER,
      position TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      page_key TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_book_page
      ON messages (book_id, page_key, created_at);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function bookRow(r: any): Book {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    format: r.format,
    filePath: r.file_path,
    coverPath: r.cover_path,
    addedAt: r.added_at,
    lastOpenedAt: r.last_opened_at,
    position: r.position,
  };
}

export function listBooks(): Book[] {
  return db
    .prepare(
      `SELECT * FROM books ORDER BY COALESCE(last_opened_at, added_at) DESC`,
    )
    .all()
    .map(bookRow);
}

export function getBook(id: string): Book | null {
  const r = db.prepare(`SELECT * FROM books WHERE id = ?`).get(id);
  return r ? bookRow(r) : null;
}

export function insertBook(b: Book) {
  db.prepare(
    `INSERT INTO books (id, title, author, format, file_path, cover_path, added_at, last_opened_at, position)
     VALUES (@id, @title, @author, @format, @filePath, @coverPath, @addedAt, @lastOpenedAt, @position)`,
  ).run(b);
}

export function touchBook(id: string) {
  db.prepare(`UPDATE books SET last_opened_at = ? WHERE id = ?`).run(
    Date.now(),
    id,
  );
}

export function savePosition(id: string, position: string) {
  db.prepare(`UPDATE books SET position = ? WHERE id = ?`).run(position, id);
}

export function deleteBook(id: string) {
  db.prepare(`DELETE FROM books WHERE id = ?`).run(id);
  db.prepare(`DELETE FROM messages WHERE book_id = ?`).run(id);
}

function msgRow(r: any): ChatMessage {
  return {
    id: r.id,
    bookId: r.book_id,
    pageKey: r.page_key,
    role: r.role as ChatRole,
    content: r.content,
    createdAt: r.created_at,
  };
}

export function listMessages(bookId: string, pageKey: string): ChatMessage[] {
  return db
    .prepare(
      `SELECT * FROM messages WHERE book_id = ? AND page_key = ? ORDER BY created_at ASC`,
    )
    .all(bookId, pageKey)
    .map(msgRow);
}

export function insertMessage(m: ChatMessage) {
  db.prepare(
    `INSERT INTO messages (id, book_id, page_key, role, content, created_at)
     VALUES (@id, @bookId, @pageKey, @role, @content, @createdAt)`,
  ).run(m);
}

export function updateMessageContent(id: string, content: string) {
  db.prepare(`UPDATE messages SET content = ? WHERE id = ?`).run(content, id);
}

export function clearThread(bookId: string, pageKey: string) {
  db.prepare(
    `DELETE FROM messages WHERE book_id = ? AND page_key = ?`,
  ).run(bookId, pageKey);
}

export function getSetting(key: string): string | null {
  const r = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return r?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
