import { useRef, useState } from 'react';
import type {
  Book,
  ChatImage,
  PageContext,
} from '../../../shared/types';
import { PdfReader } from '../readers/PdfReader';
import { EpubReader } from '../readers/EpubReader';
import { ChatPanel } from '../components/ChatPanel';
import { RegionSelect } from '../components/RegionSelect';
import { ReaderToolbar } from '../components/ReaderToolbar';
import type { ReaderHandle } from '../readers/types';
import type { Rect } from '../lib/capture';

export function Reader({
  book,
  onOpenSettings,
}: {
  book: Book;
  onOpenSettings: () => void;
}) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [regionMode, setRegionMode] = useState(false);
  const [pendingImage, setPendingImage] = useState<ChatImage | null>(null);
  const readerRef = useRef<ReaderHandle>(null);

  const onRegionComplete = async (rect: Rect, displayRect: DOMRect) => {
    setRegionMode(false);
    if (rect.w < 8 || rect.h < 8) return;
    const dataUrl = await readerRef.current?.captureRegion(displayRect, rect);
    if (dataUrl) setPendingImage({ kind: 'region', dataUrl });
  };

  return (
    <div className="reader">
      <ReaderToolbar
        onSelectRegion={() => setRegionMode((v) => !v)}
        regionActive={regionMode}
        disabled={!pageContext}
      />
      <div className="reader-main">
        {book.format === 'pdf' ? (
          <PdfReader
            ref={readerRef}
            book={book}
            onPageChange={setPageContext}
          />
        ) : (
          <EpubReader
            ref={readerRef}
            book={book}
            onPageChange={setPageContext}
          />
        )}
        {regionMode && (
          <RegionSelect
            targetSelector=".reader-content"
            onComplete={onRegionComplete}
            onCancel={() => setRegionMode(false)}
          />
        )}
      </div>
      <ChatPanel
        book={book}
        pageContext={pageContext}
        pendingImage={pendingImage}
        onClearPendingImage={() => setPendingImage(null)}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}
