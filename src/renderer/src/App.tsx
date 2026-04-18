import { useEffect, useState, useCallback } from 'react';
import { Library } from './views/Library';
import { Reader } from './views/Reader';
import { SettingsModal } from './components/SettingsModal';
import type { Book } from '../../shared/types';

type View = { name: 'library' } | { name: 'reader'; book: Book };

export function App() {
  const [view, setView] = useState<View>({ name: 'library' });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('theme') as 'light' | 'dark') ?? 'dark',
  );
  const [fontSize, setFontSize] = useState<number>(() =>
    Number(localStorage.getItem('fontSize') ?? 18),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--reader-font-size',
      `${fontSize}px`,
    );
    localStorage.setItem('fontSize', String(fontSize));
  }, [fontSize]);

  const openBook = useCallback(async (id: string) => {
    const book = await window.api.openBook(id);
    if (book) setView({ name: 'reader', book });
  }, []);

  return (
    <div className="app">
      <div className="topbar">
        {view.name === 'reader' && (
          <button onClick={() => setView({ name: 'library' })}>← Library</button>
        )}
        <h1>ReaderAI</h1>
        <div className="spacer" />
        {view.name === 'reader' && (
          <>
            <button onClick={() => setFontSize((s) => Math.max(12, s - 2))}>
              A−
            </button>
            <button onClick={() => setFontSize((s) => Math.min(32, s + 2))}>
              A+
            </button>
          </>
        )}
        <button
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button onClick={() => setSettingsOpen(true)} title="Settings">
          ⚙
        </button>
      </div>

      {view.name === 'library' ? (
        <Library onOpen={openBook} />
      ) : (
        <Reader
          book={view.book}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
