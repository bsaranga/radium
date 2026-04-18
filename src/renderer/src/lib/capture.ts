import html2canvas from 'html2canvas';

const MAX_DIM = 1536;

export type Rect = { x: number; y: number; w: number; h: number };

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

export function downscaleCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const longest = Math.max(src.width, src.height);
  if (longest <= MAX_DIM) return src;
  const scale = MAX_DIM / longest;
  const out = document.createElement('canvas');
  out.width = Math.round(src.width * scale);
  out.height = Math.round(src.height * scale);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

export function cropCanvas(src: HTMLCanvasElement, rect: Rect): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(rect.w));
  out.height = Math.max(1, Math.round(rect.h));
  const ctx = out.getContext('2d')!;
  ctx.drawImage(
    src,
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.w),
    Math.round(rect.h),
    0,
    0,
    out.width,
    out.height,
  );
  return out;
}

export function capturePdfCanvas(canvas: HTMLCanvasElement): string {
  return canvasToDataUrl(downscaleCanvas(canvas));
}

export function capturePdfRegion(
  canvas: HTMLCanvasElement,
  displayRect: DOMRect,
  selection: Rect,
): string {
  const scaleX = canvas.width / displayRect.width;
  const scaleY = canvas.height / displayRect.height;
  const srcRect: Rect = {
    x: selection.x * scaleX,
    y: selection.y * scaleY,
    w: selection.w * scaleX,
    h: selection.h * scaleY,
  };
  return canvasToDataUrl(downscaleCanvas(cropCanvas(canvas, srcRect)));
}

export async function captureEpubIframe(
  iframe: HTMLIFrameElement,
): Promise<string | null> {
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return null;
  const canvas = await html2canvas(doc.body, {
    backgroundColor: null,
    scale: Math.min(2, window.devicePixelRatio || 1),
    useCORS: true,
    logging: false,
  });
  return canvasToDataUrl(downscaleCanvas(canvas));
}

export async function captureEpubRegion(
  iframe: HTMLIFrameElement,
  displayRect: DOMRect,
  selection: Rect,
): Promise<string | null> {
  const doc = iframe.contentDocument;
  if (!doc || !doc.body) return null;
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const canvas = await html2canvas(doc.body, {
    backgroundColor: null,
    scale,
    useCORS: true,
    logging: false,
  });
  const scaleX = canvas.width / displayRect.width;
  const scaleY = canvas.height / displayRect.height;
  const srcRect: Rect = {
    x: selection.x * scaleX,
    y: selection.y * scaleY,
    w: selection.w * scaleX,
    h: selection.h * scaleY,
  };
  return canvasToDataUrl(downscaleCanvas(cropCanvas(canvas, srcRect)));
}
