import { useEffect, useRef, useState, useCallback } from 'react';
import type {
  Book,
  ChatImage,
  Highlight,
  PageContext,
} from '../../../shared/types';
import { PdfReader } from '../readers/PdfReader';
import { EpubReader } from '../readers/EpubReader';
import { ChatPanel } from '../components/ChatPanel';
import { RegionSelect } from '../components/RegionSelect';
import { ReaderToolbar } from '../components/ReaderToolbar';
import {
  SelectionToolbar,
  type SelectionAction,
} from '../components/SelectionToolbar';
import type { ReaderHandle, SelectionEvent } from '../readers/types';
import type { Rect } from '../lib/capture';

const HIGHLIGHT_COLOR = '#fde047';

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
  const [selection, setSelection] = useState<SelectionEvent | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<{
    text: string;
    selection: SelectionEvent;
  } | null>(null);
  const readerRef = useRef<ReaderHandle>(null);

  const refreshHighlights = useCallback(async () => {
    const list = await window.api.listHighlights(book.id);
    setHighlights(list);
  }, [book.id]);

  useEffect(() => {
    refreshHighlights();
  }, [refreshHighlights]);

  useEffect(() => {
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.bookId === book.id) refreshHighlights();
    };
    window.addEventListener('highlights:changed', onChanged);
    return () => window.removeEventListener('highlights:changed', onChanged);
  }, [book.id, refreshHighlights]);

  const onRegionComplete = async (rect: Rect, displayRect: DOMRect) => {
    setRegionMode(false);
    if (rect.w < 8 || rect.h < 8) return;
    const dataUrl = await readerRef.current?.captureRegion(displayRect, rect);
    if (dataUrl) setPendingImage({ kind: 'region', dataUrl });
  };

  const onSelectionAction = async (action: SelectionAction) => {
    if (!selection) return;
    if (action === 'highlight') {
      const id = crypto.randomUUID();
      const highlight: Highlight = {
        id,
        bookId: book.id,
        pageKey: selection.pageKey,
        pageLabel: selection.pageLabel,
        text: selection.text,
        anchor: selection.anchor,
        kind: selection.kind,
        color: HIGHLIGHT_COLOR,
        createdAt: Date.now(),
      };
      await window.api.addHighlight(highlight);
      window.getSelection()?.removeAllRanges();
      setSelection(null);
      refreshHighlights();
      return;
    }

    const prompts: Record<Exclude<SelectionAction, 'highlight'>, string> = {
      explain:
        'Explain this passage: what it says, why it matters in context, and any key terms.',
      define:
        'Define the key terms in this passage. Format as a short list.',
      ask: '',
    };
    const promptText = prompts[action];
    if (action === 'ask') {
      setPendingPrompt({ text: '', selection });
    } else {
      setPendingPrompt({ text: promptText, selection });
    }
    window.getSelection()?.removeAllRanges();
    setSelection(null);
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
            onSelection={setSelection}
            highlights={highlights}
          />
        ) : (
          <EpubReader
            ref={readerRef}
            book={book}
            onPageChange={setPageContext}
            onSelection={setSelection}
            highlights={highlights}
          />
        )}
        {regionMode && (
          <RegionSelect
            targetSelector=".reader-content"
            onComplete={onRegionComplete}
            onCancel={() => setRegionMode(false)}
          />
        )}
        {selection && !regionMode && (
          <SelectionToolbar
            rect={selection.rect}
            onAction={onSelectionAction}
          />
        )}
      </div>
      <ChatPanel
        book={book}
        pageContext={pageContext}
        pendingImage={pendingImage}
        onClearPendingImage={() => setPendingImage(null)}
        onCaptureFullPage={async () => {
          const dataUrl = await readerRef.current?.capturePage();
          return dataUrl ? { kind: 'page', dataUrl } : null;
        }}
        pendingPrompt={pendingPrompt}
        onConsumePendingPrompt={() => setPendingPrompt(null)}
        highlights={highlights}
        onAskAboutHighlight={(h) =>
          setPendingPrompt({
            text: '',
            selection: {
              kind: h.kind,
              text: h.text,
              pageKey: h.pageKey,
              pageLabel: h.pageLabel,
              anchor: h.anchor,
              rect: { top: 0, left: 0, width: 0, height: 0 },
            },
          })
        }
        onDeleteHighlight={async (h) => {
          await window.api.deleteHighlight(h.id);
          refreshHighlights();
        }}
        onNavigate={(url) => {
          if (!url.startsWith('reader://')) return;
          if (book.format === 'pdf') {
            const m = url.match(/^reader:\/\/page\/(\d+)/);
            if (m) {
              readerRef.current?.navigate({
                kind: 'pdf-page',
                page: parseInt(m[1], 10),
              });
            }
          } else {
            const m = url.match(/^reader:\/\/href\/(.+)/);
            if (m) {
              readerRef.current?.navigate({
                kind: 'epub-href',
                href: decodeURIComponent(m[1]),
              });
            }
          }
        }}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}
