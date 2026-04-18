import type { Rect } from '../lib/capture';

export type ReaderHandle = {
  capturePage: () => Promise<string | null>;
  captureRegion: (displayRect: DOMRect, selection: Rect) => Promise<string | null>;
};
