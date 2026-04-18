import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import ePub, { type Rendition, type Book as EpubBook } from 'epubjs';
import type {
  Book,
  Highlight,
  PageContext,
} from '../../../shared/types';
import { isTypingTarget } from '../lib/dom';
import { captureEpubIframe, captureEpubRegion } from '../lib/capture';
import type { ReaderHandle, SelectionEvent } from './types';

type Props = {
  book: Book;
  onPageChange?: (ctx: PageContext) => void;
  onSelection?: (ev: SelectionEvent | null) => void;
  highlights: Highlight[];
};

function findIframe(host: HTMLElement): HTMLIFrameElement | null {
  return host.querySelector('iframe');
}

export const EpubReader = forwardRef<ReaderHandle, Props>(function EpubReader(
  { book, onPageChange, onSelection, highlights },
  ref,
) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const currentPageKeyRef = useRef<string>('');
  const currentPageLabelRef = useRef<string>('');
  const appliedHighlightsRef = useRef<Set<string>>(new Set());

  useImperativeHandle(
    ref,
    () => ({
      capturePage: async () => {
        const host = viewerRef.current;
        if (!host) return null;
        const iframe = findIframe(host);
        return iframe ? captureEpubIframe(iframe) : null;
      },
      captureRegion: async (displayRect, selection) => {
        const host = viewerRef.current;
        if (!host) return null;
        const iframe = findIframe(host);
        if (!iframe) return null;
        const iframeRect = iframe.getBoundingClientRect();
        const localSelection = {
          x: selection.x + (displayRect.left - iframeRect.left),
          y: selection.y + (displayRect.top - iframeRect.top),
          w: selection.w,
          h: selection.h,
        };
        return captureEpubRegion(iframe, iframeRect, localSelection);
      },
      navigate: (target) => {
        if (target.kind !== 'epub-href') return;
        renditionRef.current?.display(target.href);
      },
    }),
    [],
  );

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

      const pageKey = loc?.start?.href
        ? `epub:${loc.start.href}`
        : `epub:${cfi ?? 'unknown'}`;
      const label = loc?.start?.displayed
        ? `Loc ${loc.start.displayed.page}/${loc.start.displayed.total}`
        : 'Current location';
      currentPageKeyRef.current = pageKey;
      currentPageLabelRef.current = label;

      if (onPageChange) {
        const contents: any[] = (rendition as any).getContents?.() ?? [];
        const text = contents
          .map((c) => c?.content?.innerText ?? c?.document?.body?.innerText ?? '')
          .join('\n')
          .replace(/\s+\n/g, '\n')
          .trim();
        onPageChange({ pageKey, pageLabel: label, text });
      }
    });

    rendition.on(
      'selected',
      (cfiRange: string, contents: any) => {
        if (!onSelection) return;
        const text = contents?.window
          ?.getSelection?.()
          ?.toString?.()
          .trim();
        if (!text) return;
        const iframe = findIframe(viewerRef.current!);
        if (!iframe) return;
        const iframeRect = iframe.getBoundingClientRect();
        const sel = contents?.window?.getSelection?.();
        const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
        const box = range?.getBoundingClientRect?.();
        const rect = box
          ? {
              top: iframeRect.top + box.top,
              left: iframeRect.left + box.left,
              width: box.width,
              height: box.height,
            }
          : {
              top: iframeRect.top + 20,
              left: iframeRect.left + iframeRect.width / 2,
              width: 0,
              height: 0,
            };

        onSelection({
          kind: 'epub',
          text,
          pageKey: currentPageKeyRef.current,
          pageLabel: currentPageLabelRef.current,
          anchor: cfiRange,
          rect,
        });
      },
    );

    return () => {
      rendition.destroy();
      epub.destroy();
      renditionRef.current = null;
      appliedHighlightsRef.current.clear();
    };
  }, [book.id, book.filePath]);

  // Apply highlights as annotations
  useEffect(() => {
    const r = renditionRef.current as any;
    if (!r) return;
    const anno = r.annotations;
    if (!anno) return;

    const wantIds = new Set(
      highlights.filter((h) => h.kind === 'epub').map((h) => h.id),
    );
    for (const id of appliedHighlightsRef.current) {
      if (!wantIds.has(id)) {
        try {
          anno.remove(id, 'highlight');
        } catch {
          /* epubjs throws if already gone */
        }
        appliedHighlightsRef.current.delete(id);
      }
    }
    for (const h of highlights) {
      if (h.kind !== 'epub') continue;
      if (appliedHighlightsRef.current.has(h.id)) continue;
      try {
        anno.add(
          'highlight',
          h.anchor,
          { id: h.id },
          undefined,
          'reader-ai-hl',
          { fill: h.color, 'fill-opacity': '0.35' },
        );
        appliedHighlightsRef.current.add(h.id);
      } catch (err) {
        console.warn('highlight add failed', err);
      }
    }
  }, [highlights]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
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
});
