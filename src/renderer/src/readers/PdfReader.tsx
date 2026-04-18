import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {
  Book,
  Highlight,
  PageContext,
} from '../../../shared/types';
import { isTypingTarget } from '../lib/dom';
import { capturePdfCanvas, capturePdfRegion } from '../lib/capture';
import type { ReaderHandle, SelectionEvent } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

type Props = {
  book: Book;
  onPageChange?: (ctx: PageContext) => void;
  onSelection?: (ev: SelectionEvent | null) => void;
  highlights: Highlight[];
};

type RectRatio = { x: number; y: number; w: number; h: number };

function makePdfAnchor(rects: RectRatio[]): string {
  return JSON.stringify(rects);
}

function parsePdfAnchor(anchor: string): RectRatio[] {
  try {
    const parsed = JSON.parse(anchor);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const PdfReader = forwardRef<ReaderHandle, Props>(function PdfReader(
  { book, onPageChange, onSelection, highlights },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState<number>(() => {
    const p = book.position ? parseInt(book.position, 10) : 1;
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [numPages, setNumPages] = useState(0);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const textLayerTaskRef = useRef<any>(null);

  useImperativeHandle(
    ref,
    () => ({
      capturePage: async () => {
        const c = canvasRef.current;
        return c ? capturePdfCanvas(c) : null;
      },
      captureRegion: async (displayRect, selection) => {
        const c = canvasRef.current;
        return c ? capturePdfRegion(c, displayRect, selection) : null;
      },
      navigate: (target) => {
        if (target.kind !== 'pdf-page') return;
        setPage(() => {
          const n = Math.max(1, Math.min(numPages || target.page, target.page));
          return n;
        });
      },
    }),
    [numPages],
  );

  useEffect(() => {
    let cancelled = false;
    const url = `book:///${encodeURI(book.filePath)}`;
    pdfjsLib
      .getDocument({ url })
      .promise.then((pdf) => {
        if (cancelled) return;
        setDoc(pdf);
        setNumPages(pdf.numPages);
      })
      .catch((err) => console.error('pdf load failed', err));
    return () => {
      cancelled = true;
    };
  }, [book.filePath]);

  useEffect(() => {
    if (!doc || !canvasRef.current || !textLayerRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        renderTaskRef.current?.cancel();
        textLayerTaskRef.current?.cancel?.();

        const p = await doc.getPage(page);
        if (cancelled) return;

        const canvas = canvasRef.current!;
        const textLayer = textLayerRef.current!;
        const wrap = pageWrapRef.current!;
        const container = wrap.parentElement!;

        const base = p.getViewport({ scale: 1 });
        const scale = Math.min(
          (container.clientWidth - 40) / base.width,
          (container.clientHeight - 40) / base.height,
        );
        const dpr = window.devicePixelRatio || 1;
        const viewport = p.getViewport({ scale });
        const scaled = p.getViewport({ scale: scale * dpr });

        canvas.width = scaled.width;
        canvas.height = scaled.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        wrap.style.width = `${viewport.width}px`;
        wrap.style.height = `${viewport.height}px`;

        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;
        textLayer.replaceChildren();
        textLayer.style.setProperty('--scale-factor', String(scale));

        const ctx = canvas.getContext('2d')!;
        const task = p.render({ canvasContext: ctx, viewport: scaled });
        renderTaskRef.current = task;
        await task.promise;

        const textContent = await p.getTextContent();
        if (cancelled) return;

        const layer = new (pdfjsLib as any).TextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport,
        });
        textLayerTaskRef.current = layer;
        await layer.render();

        if (onPageChange) {
          const text = textContent.items
            .map((item: any) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (!cancelled) {
            onPageChange({
              pageKey: `pdf:${page}`,
              pageLabel: `Page ${page}`,
              text,
            });
          }
        }
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException')
          console.error('pdf render', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, page]);

  useEffect(() => {
    if (!doc) return;
    window.api.savePosition(book.id, String(page));
  }, [book.id, page, doc]);

  // Render highlights for the current page
  useEffect(() => {
    const layer = highlightLayerRef.current;
    if (!layer) return;
    const wrap = pageWrapRef.current;
    if (!wrap) return;
    layer.replaceChildren();

    const pageKey = `pdf:${page}`;
    const pageHighlights = highlights.filter(
      (h) => h.kind === 'pdf' && h.pageKey === pageKey,
    );
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;

    for (const hl of pageHighlights) {
      for (const r of parsePdfAnchor(hl.anchor)) {
        const el = document.createElement('div');
        el.className = 'pdf-highlight';
        el.style.left = `${r.x * w}px`;
        el.style.top = `${r.y * h}px`;
        el.style.width = `${r.w * w}px`;
        el.style.height = `${r.h * h}px`;
        el.style.background = hl.color;
        el.title = hl.text;
        el.dataset.highlightId = hl.id;
        el.addEventListener('dblclick', async () => {
          if (confirm('Delete this highlight?')) {
            await window.api.deleteHighlight(hl.id);
            window.dispatchEvent(
              new CustomEvent('highlights:changed', {
                detail: { bookId: book.id },
              }),
            );
          }
        });
        layer.appendChild(el);
      }
    }
  }, [highlights, page, book.id]);

  // Selection detection
  useEffect(() => {
    const host = pageWrapRef.current;
    if (!host || !onSelection) return;
    const textLayer = textLayerRef.current;
    if (!textLayer) return;

    const onUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        onSelection(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        onSelection(null);
        return;
      }
      // Ensure selection is inside our text layer
      if (
        !textLayer.contains(sel.anchorNode) &&
        !textLayer.contains(sel.focusNode)
      ) {
        return;
      }

      const range = sel.getRangeAt(0);
      const bounding = range.getBoundingClientRect();
      const wrapRect = host.getBoundingClientRect();
      const rects: RectRatio[] = [];
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        rects.push({
          x: (r.left - wrapRect.left) / wrapRect.width,
          y: (r.top - wrapRect.top) / wrapRect.height,
          w: r.width / wrapRect.width,
          h: r.height / wrapRect.height,
        });
      }

      onSelection({
        kind: 'pdf',
        text,
        pageKey: `pdf:${page}`,
        pageLabel: `Page ${page}`,
        anchor: makePdfAnchor(rects),
        rect: {
          top: bounding.top,
          left: bounding.left,
          width: bounding.width,
          height: bounding.height,
        },
      });
    };

    document.addEventListener('mouseup', onUp);
    document.addEventListener('selectionchange', () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) onSelection(null);
    });
    return () => {
      document.removeEventListener('mouseup', onUp);
    };
  }, [page, onSelection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'ArrowRight' || e.key === 'j' || e.key === ' ')
        setPage((p) => Math.min(numPages, p + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'k')
        setPage((p) => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numPages]);

  return (
    <>
      <div className="reader-content">
        <div className="pdf-page" ref={pageWrapRef}>
          <canvas ref={canvasRef} />
          <div className="pdf-highlight-layer" ref={highlightLayerRef} />
          <div className="textLayer" ref={textLayerRef} />
        </div>
      </div>
      <div className="reader-footer">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          ←
        </button>
        <span>
          Page {page} / {numPages || '…'}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(numPages, p + 1))}
          disabled={page >= numPages}
        >
          →
        </button>
        <div className="spacer" />
        <span>{book.title}</span>
      </div>
    </>
  );
});
