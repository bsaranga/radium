import { useEffect, useState } from 'react';
import type { Book } from '../../../shared/types';

export function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const list = await window.api.listBooks();
    setBooks(list);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const onImport = async () => {
    await window.api.importBooks();
    refresh();
  };

  return (
    <div className="library">
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button className="primary" onClick={onImport}>
          + Import book
        </button>
      </div>
      {loading ? null : books.length === 0 ? (
        <div className="empty">
          No books yet. Click <strong>Import book</strong> to add a PDF or EPUB.
        </div>
      ) : (
        <div className="book-grid">
          {books.map((b) => (
            <div
              key={b.id}
              className="book-card"
              onClick={() => onOpen(b.id)}
              title={b.title}
            >
              <div className="book-cover">{b.format.toUpperCase()}</div>
              <div className="book-title">{b.title}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
