import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import type {
  IndexProgress,
  IndexStatus,
  RawChunk,
  RetrievedChunk,
} from '../shared/types';
import { getApiKey } from './chat';
import {
  chunkCount,
  clearChunks,
  insertChunk,
  listChunkEmbeddings,
  setIndexedAt,
  db_raw,
} from './db';

const EMBED_MODEL = 'text-embedding-3-small';
const BATCH = 64;

function f32ToBuffer(f: Float32Array): Buffer {
  return Buffer.from(f.buffer, f.byteOffset, f.byteLength);
}

function bufferToF32(b: Buffer): Float32Array {
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function openai(): Promise<OpenAI | null> {
  const key = await getApiKey();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

async function embedBatch(
  client: OpenAI,
  texts: string[],
): Promise<Float32Array[]> {
  const resp = await client.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  return resp.data.map((d) => new Float32Array(d.embedding as number[]));
}

export async function buildIndex(
  webContents: WebContents,
  bookId: string,
  chunks: RawChunk[],
): Promise<void> {
  const emit = (p: IndexProgress) =>
    webContents.send('index:progress', p);

  const client = await openai();
  if (!client) {
    emit({
      bookId,
      phase: 'error',
      embedded: 0,
      total: chunks.length,
      message: 'No OpenAI API key configured.',
    });
    return;
  }

  try {
    clearChunks(bookId);
    setIndexedAt(bookId, null);

    emit({
      bookId,
      phase: 'embedding',
      embedded: 0,
      total: chunks.length,
    });

    const insertTx = db_raw().transaction(
      (rows: {
        id: string;
        idx: number;
        sourceLabel: string;
        text: string;
        buf: Buffer;
      }[]) => {
        for (const r of rows) {
          insertChunk(r.id, bookId, r.idx, r.sourceLabel, r.text, r.buf);
        }
      },
    );

    let embedded = 0;
    let globalIdx = 0;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const texts = slice.map((c) => c.text);
      const vectors = await embedBatch(client, texts);

      const rows = slice.map((c, j) => ({
        id: randomUUID(),
        idx: globalIdx + j,
        sourceLabel: c.sourceLabel,
        text: c.text,
        buf: f32ToBuffer(vectors[j]),
      }));
      insertTx(rows);

      globalIdx += slice.length;
      embedded += slice.length;
      emit({
        bookId,
        phase: 'embedding',
        embedded,
        total: chunks.length,
      });
    }

    setIndexedAt(bookId, Date.now());
    emit({ bookId, phase: 'done', embedded, total: chunks.length });
  } catch (err: any) {
    emit({
      bookId,
      phase: 'error',
      embedded: 0,
      total: chunks.length,
      message: err?.message ?? String(err),
    });
  }
}

export function indexStatus(bookId: string, indexedAt: number | null): IndexStatus {
  return {
    indexed: indexedAt !== null,
    indexedAt,
    chunkCount: chunkCount(bookId),
  };
}

export async function retrieve(
  bookId: string,
  query: string,
  k: number,
): Promise<RetrievedChunk[]> {
  const client = await openai();
  if (!client) return [];

  const [qvec] = await embedBatch(client, [query]);
  const rows = listChunkEmbeddings(bookId);
  if (rows.length === 0) return [];

  const scored = rows.map((r) => ({
    text: r.text,
    sourceLabel: r.sourceLabel,
    score: cosine(qvec, bufferToF32(r.embedding)),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
