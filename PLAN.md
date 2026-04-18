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

## Phase 2b — Math Rendering (KaTeX)
Goal: mathematical notation in AI responses renders as typeset equations, not raw LaTeX, when the content warrants it.

- Add `remark-math` + `rehype-katex` to the chat markdown pipeline; import `katex` CSS.
- Support inline (`$…$`) and display (`$$…$$`) math.
- System-prompt guidance: when the current page contains equations/formulas, instruct the model to emit LaTeX math syntax in its answers; otherwise stay in plain prose.
- Lightweight page-text heuristic (presence of equation-like tokens, Greek letters, `∑ ∫ ∂`, `=` in formula context) to set a `mathLikely` hint passed to the model, so it knows when math formatting is appropriate without having to guess.
- Copy button preserves raw LaTeX source (not rendered glyphs).

**Exit criteria:** on a math-heavy page, asking "explain this equation" returns a cleanly typeset response; on a prose page, output stays in plain markdown.

### Also in Phase 2b — Library cover thumbnails
- Generate a cover image for each book on import (and lazily for pre-existing books without one).
  - PDF: render page 1 to an offscreen canvas at a small scale, export PNG.
  - EPUB: use `book.coverUrl()` when the package metadata exposes one; fall back to rendering the first spine section.
- Store covers under `<userData>/covers/<id>.png`; save path in the `books.cover_path` column.
- Library grid renders the cover image with an aspect-ratio tile; format badge only when no cover exists.

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

## Phase 3b — Reader Toolbar & Selection-Gated Vision UX
Goal: surface vision tools where the user's hands are (on the page, not in the chat), and reduce chat-panel clutter.

- Add a vertical toolbar on the left edge of the reader pane. First affordance: **Select region** (drag-to-crop).
- Remove the "⬚ Select region" button and the "Include page image" toggle from the chat panel.
- Vision quick prompts ("Explain selection", "Extract this table", "Describe this figure", …) are hidden by default and only appear once a region/page attachment is pending.
- Toolbar is extensible — future tools (highlight, note, zoom, fit-to-width) slot into the same rail.

**Exit criteria:** with no attachment, the chat panel shows only text-oriented quick actions. Clicking the toolbar's region tool, dragging a rect, and releasing reveals the vision prompts inline.

---

## Phase 4 — Selection & Deep Interaction
Goal: make the assistant feel native to reading.

- Text selection → floating toolbar: Explain / Define / Ask / Highlight.
- Highlights + margin notes, stored and re-rendered on reopen.
- "Ask about selection" threads scoped to the selection, linked back to the location.
- Inline citations: AI answers reference page numbers when drawing from the book.

**Exit criteria:** user can highlight → ask → get grounded answer citing the page.

---

## Phase 4b — Highlights carousel in chat pane
Goal: put the page's saved highlights at the user's fingertips without switching views.

- A compact carousel sits at the top of the chat pane, showing only highlights for the current page/location.
- One highlight visible at a time with ← / → controls and an "i of n" counter.
- Each item exposes: the quoted text, and quick actions (Ask about this, Delete).
- Hidden when the page has no highlights.
- Updates live as highlights are added/removed and as the user turns pages.

**Exit criteria:** create two highlights on a page, flip through them in the carousel, ask a question scoped to one, delete the other.

---

## Phase 5 — Whole-Book Understanding (RAG)
Goal: questions that span chapters, not just the current page.

- On import: chunk book, embed (local via `@xenova/transformers` MiniLM, or API), store vectors in `sqlite-vec`.
- Retrieval: top-k chunks injected alongside current page (and current page image when vision is on).
- Toggle: "This page" vs "Whole book" scope.
- Chapter-aware summaries cached per chapter.

**Exit criteria:** "Where did the author first introduce X?" works reliably.

---

## Phase 5b — Book-scope polish
Goal: whole-book mode should feel like a different conversation, not just a routing flag.

- Quick prompts swap to book-level when scope is Whole book:
  - "Prerequisites for this book"
  - "Summarize this book"
  - "Key takeaways"
  - "Who is this book for?"
  - "Table of contents (inferred)"
- Chat input placeholder adapts to scope ("Ask about this page…" vs. "Ask about the whole book…").
- Library thumbnails get a corner ribbon with an icon marking indexed books, so the user can see at a glance which titles support whole-book chat.

**Exit criteria:** toggling scope to Whole book swaps the action row and placeholder; indexed books show the ribbon in the library grid; unindexed books do not.

---

## Phase 5c — Remove-from-library + scope isolation
Goal: let users take books out, and stop page and book conversations from bleeding into each other.

- Library cards expose a delete affordance on hover. Confirm before deleting.
- Deleting a book removes: the DB row, all its chat messages, all highlights, all embedding chunks, the cover file, and the copied book file on disk — leaving no trace under userData.
- Page-scope and book-scope chats are stored on separate threads. Turning pages does not surface book-scope history, and switching to Whole book does not surface page history.
- In Whole book scope the prompt does not inject the current page text; the model sees retrieved excerpts and book metadata only.

**Exit criteria:** adding and deleting the same book twice leaves the DB and userData clean; page-scope and book-scope chats show different history lists; a book-scope question does not recall a page-scope answer.

---

## Phase 5d — Vision fallback for text-less pages
Goal: cover pages, title pages, scanned PDFs, and image-only EPUB sections should just work, without the user having to manually attach an image.

- When sending a page-scope prompt, if the current page has no meaningful extractable text (empty or below a small threshold of characters) and no image is already attached, automatically capture the full page and include it as a vision attachment.
- This only applies when scope is Page and no user-selected region is pending — the existing manual region attachment flow remains untouched.
- The attached page image is a one-shot fallback, not shown as a persistent chip. The model's system prompt already knows how to read from images.

**Exit criteria:** on a scanned PDF page or a PDF cover with only an image, asking "what's on this page?" returns a grounded answer without the user pressing any region/attach control.

---

## Phase 5e — Navigable citations in book-mode chat
Goal: turn the AI's location citations into actual navigation.

- When a whole-book response cites a location — e.g. `(Page 42)` for PDFs or `(§ <source>)` for EPUBs — render it as a link rather than plain text.
- Clicking the link moves the left pane to that location: PDF page number, EPUB spine href.
- System prompt enforces the two exact citation formats so the renderer can reliably detect and rewrite them.
- Citations in page-scope chat are left as plain text (they already point to the current page).

**Exit criteria:** ask a whole-book question that draws on multiple chapters; clicking any cited page/section in the answer jumps the reader to that location without leaving the chat.

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
