import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import ePub from 'epubjs';
import type { Book, RawChunk } from '../../../shared/types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 200;

export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= CHUNK_CHARS) return clean ? [clean] : [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(clean.length, i + CHUNK_CHARS);
    out.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = end - CHUNK_OVERLAP;
  }
  return out;
}

async function extractPdfSources(filePath: string): Promise<RawChunk[]> {
  const url = `book:///${encodeURI(filePath)}`;
  const doc = await pdfjsLib.getDocument({ url }).promise;
  try {
    const out: RawChunk[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const text = content.items
        .map((it: any) => ('str' in it ? it.str : ''))
        .join(' ');
      const sourceLabel = `Page ${p}`;
      for (const chunk of chunkText(text)) {
        out.push({ sourceLabel, text: chunk });
      }
    }
    return out;
  } finally {
    await doc.destroy();
  }
}

async function extractEpubSources(filePath: string): Promise<RawChunk[]> {
  const url = `book:///${encodeURI(filePath)}`;
  const book: any = ePub(url);
  try {
    await book.ready;
    const out: RawChunk[] = [];
    const spineItems: any[] = book.spine?.spineItems ?? [];
    for (const item of spineItems) {
      try {
        const doc = await item.load(book.load.bind(book));
        const body = doc?.body ?? doc?.documentElement;
        const text = body?.textContent ?? '';
        item.unload();
        const sourceLabel = item.href || item.idref || 'section';
        for (const chunk of chunkText(text)) {
          out.push({ sourceLabel, text: chunk });
        }
      } catch (err) {
        console.warn('epub spine item failed', item?.href, err);
      }
    }
    return out;
  } finally {
    book.destroy();
  }
}

export async function extractChunksForIndexing(
  book: Book,
): Promise<RawChunk[]> {
  if (book.format === 'pdf') return extractPdfSources(book.filePath);
  return extractEpubSources(book.filePath);
}
