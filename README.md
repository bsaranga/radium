# Radium

Read ebooks alongside an AI assistant.

Radium is a desktop app that pairs an EPUB/PDF reader with a chat panel, so you can ask questions about what you're reading without leaving the page.

## Stack

- Electron + electron-vite
- React 18 + TypeScript
- `epubjs` and `pdfjs-dist` for rendering
- `better-sqlite3` for local storage
- `keytar` for API key storage
- OpenAI SDK for the assistant

## Getting started

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — run in development
- `npm run build` — build for production
- `npm start` — preview the production build
- `npm run typecheck` — typecheck main and renderer
- `npm run rebuild` — rebuild native modules against Electron

## Project layout

```
src/
  main/      Electron main process
  preload/   Preload bridge
  renderer/  React UI
  shared/    Shared types
```

## License

MIT
