import type { Book } from '../../../shared/types';
import { PdfReader } from '../readers/PdfReader';
import { EpubReader } from '../readers/EpubReader';

export function Reader({ book }: { book: Book }) {
  return (
    <div className="reader">
      <div className="reader-main">
        {book.format === 'pdf' ? (
          <PdfReader book={book} />
        ) : (
          <EpubReader book={book} />
        )}
      </div>
      <div className="chat-placeholder">
        <strong style={{ color: 'var(--fg)' }}>AI Chat</strong>
        <p>Coming in Phase 2.</p>
      </div>
    </div>
  );
}
