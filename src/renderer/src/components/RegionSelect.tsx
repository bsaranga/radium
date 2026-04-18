import { useEffect, useRef, useState } from 'react';
import type { Rect } from '../lib/capture';

type Props = {
  targetSelector: string;
  onComplete: (rect: Rect, displayRect: DOMRect) => void;
  onCancel: () => void;
};

export function RegionSelect({ targetSelector, onComplete, onCancel }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const getTargetRect = (): DOMRect | null => {
    const el = document.querySelector(targetSelector) as HTMLElement | null;
    return el ? el.getBoundingClientRect() : null;
  };

  const toLocal = (
    e: React.MouseEvent,
    targetRect: DOMRect,
  ): { x: number; y: number } => ({
    x: e.clientX - targetRect.left,
    y: e.clientY - targetRect.top,
  });

  const onMouseDown = (e: React.MouseEvent) => {
    const t = getTargetRect();
    if (!t) return;
    const p = toLocal(e, t);
    setStart(p);
    setRect({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!start) return;
    const t = getTargetRect();
    if (!t) return;
    const p = toLocal(e, t);
    setRect({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  };

  const onMouseUp = () => {
    const t = getTargetRect();
    if (!t || !rect) {
      onCancel();
      return;
    }
    onComplete(rect, t);
  };

  const targetRect = getTargetRect();
  const overlayStyle: React.CSSProperties = targetRect
    ? {
        position: 'fixed',
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        zIndex: 50,
        cursor: 'crosshair',
        background: 'rgba(0, 0, 0, 0.15)',
      }
    : {};

  return (
    <div
      ref={overlayRef}
      className="region-overlay"
      style={overlayStyle}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <div className="region-hint">Drag to select a region · Esc to cancel</div>
      {rect && (
        <div
          className="region-rect"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
          }}
        />
      )}
    </div>
  );
}
