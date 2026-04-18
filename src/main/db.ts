import Database from 'better-sqlite3';
import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Book } from '../shared/types';
export type { Book };

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
  `);
}

function row(r: any): Book {
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
    .map(row);
}

export function getBook(id: string): Book | null {
  const r = db.prepare(`SELECT * FROM books WHERE id = ?`).get(id);
  return r ? row(r) : null;
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
}
