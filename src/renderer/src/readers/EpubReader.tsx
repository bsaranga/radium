import { useEffect, useRef } from 'react';
import ePub, { type Rendition, type Book as EpubBook } from 'epubjs';
import type { Book, PageContext } from '../../../shared/types';

type Props = {
  book: Book;
  onPageChange?: (ctx: PageContext) => void;
};

export function EpubReader({ book, onPageChange }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);

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
      if (cfi) window.api.savePosition(book.id, cfi);

      if (onPageChange) {
        const pageKey = loc?.start?.href
          ? `epub:${loc.start.href}`
          : `epub:${cfi ?? 'unknown'}`;
        const label = loc?.start?.displayed
          ? `Loc ${loc.start.displayed.page}/${loc.start.displayed.total}`
          : 'Current location';

        const contents: any[] = (rendition as any).getContents?.() ?? [];
        const text = contents
          .map((c) => c?.content?.innerText ?? c?.document?.body?.innerText ?? '')
          .join('\n')
          .replace(/\s+\n/g, '\n')
          .trim();

        onPageChange({ pageKey, pageLabel: label, text });
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
