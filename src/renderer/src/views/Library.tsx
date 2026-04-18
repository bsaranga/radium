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
            const onDelete = async (e: React.MouseEvent) => {
              e.stopPropagation();
              if (
                !confirm(
                  `Remove "${b.title}" from your library?\n\nThis deletes chat history, highlights, index, and the copied file.`,
                )
              )
                return;
              await window.api.deleteBook(b.id);
              refresh();
            };
            return (
              <div
                key={b.id}
                className="book-card"
                onClick={() => onOpen(b.id)}
                title={b.title}
              >
                <button
                  className="book-delete"
                  onClick={onDelete}
                  title="Remove from library"
                  aria-label="Remove from library"
                >
                  ✕
                </button>
                <div className="book-cover">
                  {cover ? (
                    <img src={cover} alt={b.title} />
                  ) : (
                    <span>{b.format.toUpperCase()}</span>
                  )}
                  {b.indexedAt !== null && (
                    <div
                      className="index-ribbon"
                      title="Indexed for whole-book chat"
                      aria-label="Indexed"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        aria-hidden="true"
                      >
                        <path
                          fill="currentColor"
                          d="M12 2l2.39 4.84L20 7.75l-4 3.9.95 5.52L12 14.77 7.05 17.17 8 11.65l-4-3.9 5.61-.91L12 2z"
                        />
                      </svg>
                    </div>
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
