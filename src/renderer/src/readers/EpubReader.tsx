import { useEffect, useRef, useState } from 'react';
import ePub, { type Rendition, type Book as EpubBook } from 'epubjs';
import type { Book } from '../../../shared/types';

export function EpubReader({ book }: { book: Book }) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [location, setLocation] = useState<string>(book.position ?? '');

  useEffect(() => {
    if (!viewerRef.current) return;
    const url = `book:///${encodeURI(book.filePath)}`;
    const epub: EpubBook = ePub(url);
    const rendition = epub.renderTo(viewerRef.current, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'none',
    });
    renditionRef.current = rendition;

    rendition.display(book.position || undefined);

    rendition.on('relocated', (loc: any) => {
      const cfi = loc?.start?.cfi;
      if (cfi) {
        setLocation(cfi);
        window.api.savePosition(book.id, cfi);
      }
    });

    return () => {
      rendition.destroy();
      epub.destroy();
      renditionRef.current = null;
    };
  }, [book.id, book.filePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const r = renditionRef.current;
      if (!r) return;
      if (e.key === 'ArrowRight' || e.key === 'j' || e.key === ' ') r.next();
      else if (e.key === 'ArrowLeft' || e.key === 'k') r.prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div className="reader-content">
        <div ref={viewerRef} className="epub-viewer" />
      </div>
      <div className="reader-footer">
        <button onClick={() => renditionRef.current?.prev()}>←</button>
        <button onClick={() => renditionRef.current?.next()}>→</button>
        <div className="spacer" />
        <span>{book.title}</span>
      </div>
    </>
  );
}
