import { useEffect, useState } from 'react';
import type { Highlight } from '../../../shared/types';

type Props = {
  highlights: Highlight[];
  onAskAbout: (h: Highlight) => void;
  onDelete: (h: Highlight) => void;
};

export function HighlightsCarousel({
  highlights,
  onAskAbout,
  onDelete,
}: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= highlights.length) setIndex(Math.max(0, highlights.length - 1));
  }, [highlights.length, index]);

  if (highlights.length === 0) return null;
  const current = highlights[index];

  const prev = () =>
    setIndex((i) => (i - 1 + highlights.length) % highlights.length);
  const next = () => setIndex((i) => (i + 1) % highlights.length);

  return (
    <div className="highlights-carousel">
      <div className="carousel-header">
        <strong>Highlights</strong>
        <div className="carousel-nav">
          <button
            onClick={prev}
            disabled={highlights.length < 2}
            aria-label="Previous highlight"
          >
            ←
          </button>
          <span className="carousel-counter">
            {index + 1} / {highlights.length}
          </span>
          <button
            onClick={next}
            disabled={highlights.length < 2}
            aria-label="Next highlight"
          >
            →
          </button>
        </div>
      </div>
      <div
        className="carousel-text"
        style={{ borderLeftColor: current.color }}
      >
        {current.text}
      </div>
      <div className="carousel-actions">
        <button onClick={() => onAskAbout(current)}>Ask about this</button>
        <button
          className="link"
          onClick={() => {
            if (confirm('Delete this highlight?')) onDelete(current);
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
