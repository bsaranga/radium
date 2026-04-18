import { useState } from 'react';
import type { Book, PageContext } from '../../../shared/types';
import { PdfReader } from '../readers/PdfReader';
import { EpubReader } from '../readers/EpubReader';
import { ChatPanel } from '../components/ChatPanel';

export function Reader({
  book,
  onOpenSettings,
}: {
  book: Book;
  onOpenSettings: () => void;
}) {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);

  return (
    <div className="reader">
      <div className="reader-main">
        {book.format === 'pdf' ? (
          <PdfReader book={book} onPageChange={setPageContext} />
        ) : (
          <EpubReader book={book} onPageChange={setPageContext} />
        )}
      </div>
      <ChatPanel
        book={book}
        pageContext={pageContext}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}
