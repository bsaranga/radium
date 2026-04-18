import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { Book } from '../../../shared/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export function PdfReader({ book }: { book: Book }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [page, setPage] = useState<number>(() => {
    const p = book.position ? parseInt(book.position, 10) : 1;
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [numPages, setNumPages] = useState(0);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

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
    if (!doc || !canvasRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        renderTaskRef.current?.cancel();
        const p = await doc.getPage(page);
        if (cancelled) return;

        const canvas = canvasRef.current!;
        const container = canvas.parentElement!;
        const viewport = p.getViewport({ scale: 1 });
        const scale = Math.min(
          (container.clientWidth - 40) / viewport.width,
          (container.clientHeight - 40) / viewport.height,
        );
        const scaled = p.getViewport({
          scale: scale * (window.devicePixelRatio || 1),
        });

        canvas.width = scaled.width;
        canvas.height = scaled.height;
        canvas.style.width = `${scaled.width / (window.devicePixelRatio || 1)}px`;
        canvas.style.height = `${scaled.height / (window.devicePixelRatio || 1)}px`;

        const ctx = canvas.getContext('2d')!;
        const task = p.render({ canvasContext: ctx, viewport: scaled });
        renderTaskRef.current = task;
        await task.promise;
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
        <canvas ref={canvasRef} />
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
}
