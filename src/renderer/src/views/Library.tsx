import { useEffect, useState } from 'react';
import type { Book } from '../../../shared/types';
import { ensureCover } from '../lib/covers';

export function Library({ onOpen }: { onOpen: (id: string) => void }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [covers, setCovers] = useState<Record<string, string>>({});

  const refresh = async () => {
    const list = await window.api.listBooks();
    setBooks(list);
    setLoading(false);
    setCovers((prev) => {
      const next = { ...prev };
      for (const b of list) {
        if (b.coverPath && !next[b.id])
          next[b.id] = `book:///${encodeURI(b.coverPath)}?t=${b.addedAt}`;
      }
      return next;
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const b of books) {
        if (b.coverPath || covers[b.id]) continue;
        const path = await ensureCover(b);
        if (cancelled || !path) continue;
        setCovers((prev) => ({
          ...prev,
          [b.id]: `book:///${encodeURI(path)}?t=${Date.now()}`,
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [books]);

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
          {books.map((b) => {
            const cover = covers[b.id];
            return (
              <div
                key={b.id}
                className="book-card"
                onClick={() => onOpen(b.id)}
                title={b.title}
              >
                <div className="book-cover">
                  {cover ? (
                    <img src={cover} alt={b.title} />
                  ) : (
                    <span>{b.format.toUpperCase()}</span>
                  )}
                </div>
                <div className="book-title">{b.title}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
