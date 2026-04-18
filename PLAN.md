# ReaderAI — Phased Build Plan

A desktop app for reading ebooks (non-fiction, technical books, papers) alongside an AI assistant. Left pane: book page. Right pane: chat. History persists per book.

**Stack:** Electron + React + TypeScript, SQLite (`better-sqlite3`) for structured data, local filesystem for book files, Vite for bundling.

---

## Phase 1 — Foundation & Reader Core
Goal: open a book, read it, persist library.

- Electron shell with React renderer; IPC boundary for filesystem/DB access.
- Library view: import EPUB/PDF, list books, cover thumbnails.
- Reader pane (left): paginated rendering
  - EPUB via `epub.js`
  - PDF via `pdfjs-dist`
- Persist: books table, reading position per book, last-opened.
- Keyboard nav (←/→, j/k), font size, light/dark theme.

**Exit criteria:** import a book, read it across sessions, resume where you left off.

---

## Phase 2 — AI Chat Panel
Goal: right-pane chat wired to an LLM, scoped to the current page.

- Settings screen: API key (Anthropic/OpenAI), model selection, stored in OS keychain (`keytar`).
- Chat UI with streaming responses, markdown + code highlighting, copy button.
- Context injection: current page text auto-attached as system context.
- Quick actions: "Explain this page", "Summarize", "Define term", "ELI5".
- Persist chat threads per book + per page range in SQLite.

**Exit criteria:** text-based Q&A about the visible page works end-to-end.

---

## Phase 3 — Vision: Diagrams, Tables, Figures
Goal: the AI understands what's visually on the page, not just the extracted text.

- Capture current page as an image (PDF: render page canvas at 2x DPI; EPUB: `html2canvas` of the rendered frame).
- Send image + extracted text together to a vision-capable model (Claude Sonnet/Opus, GPT-4o) via multimodal message content.
- Region-select tool: drag a box around a diagram/table → send only that crop with the question ("What does this figure show?", "Transcribe this table to markdown").
- Cache page renders (hashed by book + page) to avoid re-rasterizing on every turn.
- Token budget guard: downscale images when page text is long; warn user when switching to a non-vision model.
- Quick actions: "Explain this diagram", "Extract this table", "Describe this figure".

**Exit criteria:** user points at a diagram, asks about it, and gets a grounded answer that clearly uses the visual.

---

## Phase 4 — Selection & Deep Interaction
Goal: make the assistant feel native to reading.

- Text selection → floating toolbar: Explain / Define / Ask / Highlight.
- Highlights + margin notes, stored and re-rendered on reopen.
- "Ask about selection" threads scoped to the selection, linked back to the location.
- Inline citations: AI answers reference page numbers when drawing from the book.

**Exit criteria:** user can highlight → ask → get grounded answer citing the page.

---

## Phase 5 — Whole-Book Understanding (RAG)
Goal: questions that span chapters, not just the current page.

- On import: chunk book, embed (local via `@xenova/transformers` MiniLM, or API), store vectors in `sqlite-vec`.
- Retrieval: top-k chunks injected alongside current page (and current page image when vision is on).
- Toggle: "This page" vs "Whole book" scope.
- Chapter-aware summaries cached per chapter.

**Exit criteria:** "Where did the author first introduce X?" works reliably.

---

## Phase 6 — Study Features
Goal: turn reading into retained knowledge.

- Auto-generated flashcards from highlights (Anki-style SM-2 review queue).
- Per-book notebook: collected highlights + notes + AI summaries, exportable to Markdown.
- Glossary: auto-built from user-asked definitions.
- Reading stats: pages/day, time per book, streaks.

---

## Phase 7 — Polish & Distribution
- Multi-window (detachable chat), split-pane resize persistence, full-text search across library.
- Offline mode with local model fallback (Ollama; vision via `llava` / `llama3.2-vision`).
- Code-sign + notarize (macOS), MSI/NSIS (Windows), AppImage (Linux); auto-update via `electron-updater`.

---

## Suggested extras worth considering
- **Paper mode**: arXiv URL import, auto-extract references, fetch cited papers.
- **"Why does this matter?"** button — AI connects current concept to user's stated learning goals (set per book).
- **Cross-book queries** once multiple technical books are in the library.
- **Voice mode** for hands-free Q&A while reading on a second screen.
- **Equation mode**: OCR + LaTeX rendering for math-heavy pages, with "explain this equation" action.
