import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import ePub from 'epubjs';
import type { Book } from '../../../shared/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const COVER_WIDTH = 320;

async function canvasToBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

async function pdfCover(filePath: string): Promise<Uint8Array> {
  const url = `book:///${encodeURI(filePath)}`;
  const doc = await pdfjsLib.getDocument({ url }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = COVER_WIDTH / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({
      canvasContext: canvas.getContext('2d')!,
      viewport,
    }).promise;
    return await canvasToBytes(canvas);
  } finally {
    await doc.destroy();
  }
}

async function epubCover(filePath: string): Promise<Uint8Array | null> {
  const url = `book:///${encodeURI(filePath)}`;
  const epub = ePub(url);
  try {
    await epub.ready;
    const coverUrl = await (epub as any).coverUrl?.();
    if (!coverUrl) return null;
    const resp = await fetch(coverUrl);
    const blob = await resp.blob();
    const img = await blobToImage(blob);
    const scale = COVER_WIDTH / img.width;
    const canvas = document.createElement('canvas');
    canvas.width = COVER_WIDTH;
    canvas.height = img.height * scale;
    canvas
      .getContext('2d')!
      .drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToBytes(canvas);
  } finally {
    epub.destroy();
  }
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

export async function ensureCover(book: Book): Promise<string | null> {
  if (book.coverPath) return book.coverPath;
  try {
    const bytes =
      book.format === 'pdf'
        ? await pdfCover(book.filePath)
        : await epubCover(book.filePath);
    if (!bytes) return null;
    return await window.api.saveCover(book.id, bytes);
  } catch (err) {
    console.error('cover generation failed for', book.title, err);
    return null;
  }
}
