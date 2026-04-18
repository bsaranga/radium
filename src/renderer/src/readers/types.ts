import type { Rect } from '../lib/capture';

export type ReaderHandle = {
  capturePage: () => Promise<string | null>;
  captureRegion: (displayRect: DOMRect, selection: Rect) => Promise<string | null>;
};

export type SelectionEvent = {
  kind: 'pdf' | 'epub';
  text: string;
  pageKey: string;
  pageLabel: string;
  /** Anchor for re-rendering: PDF rect-ratios JSON, EPUB CFI range */
  anchor: string;
  /** Viewport-relative rect for positioning the floating toolbar */
  rect: { top: number; left: number; width: number; height: number };
};
