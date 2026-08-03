# Paperwaves — PDF to Voice (Hindi/Hinglish)

A PDF reader that opens your real PDF pages, reads them aloud, and can
translate them into Hindi (Devanagari) or Hinglish (Roman script) — with
text and voice both. Burgundy-black animated background.

## Project structure

```
paperwaves/
├── index.html
├── package.json          frontend + backend deps, all in one
├── vite.config.js         dev-server proxy → backend on port 3001
├── .env.example
├── src/                   React frontend
│   ├── main.jsx
│   ├── App.jsx            orchestrates everything
│   ├── index.css          global styles / variables
│   ├── components/
│   │   ├── GalaxyBackground.jsx / .css
│   │   ├── Sidebar.jsx / .css
│   │   ├── Toolbar.jsx / .css
│   │   ├── PdfViewer.jsx / .css       (renders real PDF pages via pdf.js)
│   │   ├── TranslatedPanel.jsx        (Hindi/Hinglish reading view)
│   │   └── Dock.jsx / .css            (floating voice player)
│   ├── hooks/
│   │   └── useSpeechEngine.js         (Web Speech API wrapper)
│   └── utils/
│       ├── api.js                     (calls the backend)
│       └── textChunk.js
│
└── server/                Express backend
    ├── index.js
    └── routes/
        └── translate.js   POST /api/translate → calls the Gemini API
```

## Why a backend at all?

Real Hindi/Hinglish translation calls the Gemini API, which needs a
secret API key. A key can never be safely placed in frontend code —
anyone could open dev tools and steal it. So the React app calls **our
own** `/api/translate` route, and only the Express server holds the key.

Everything else — opening the PDF, rendering pages, text-to-speech —
runs entirely in the browser and needs no backend.

## Setup

### 1. Install dependencies (once, from the project root)

```bash
npm install
```

### 2. Add your Gemini API key

```bash
cp .env.example .env
```

Get a free key from **https://aistudio.google.com/apikey**, then open
`.env` and paste it in:

```
GEMINI_API_KEY=your-real-key-here
```

### 3. Run the backend (Terminal 1)

```bash
npm run server
```

Should print `Paperwaves backend running on http://localhost:3001`.

### 4. Run the frontend (Terminal 2)

```bash
npm run dev
```

Opens on `http://localhost:5173`. Vite proxies any `/api/*` request to
the backend automatically (see `vite.config.js`) — both just work
together with zero extra config, as long as **both terminals stay
running**.

Use **Chrome or Edge** for the best free text-to-speech voices (Edge's
"Online Neural" voices sound the most natural).

## Fixed in this version

- **Page-jump bug**: on load, the PDF viewer's visibility tracker could
  pick the *last* page instead of the first when an entire short PDF fit
  on screen without scrolling (all pages reported >50% visible at once,
  and the last one silently won). Playback then started from the last
  page. Fixed by always choosing the single most-visible page and
  explicitly resetting to page 1 after a new file loads.
- **Translation provider**: switched from Anthropic to **Google Gemini**
  (`server/routes/translate.js`) — set `GEMINI_API_KEY` (and optionally
  `GEMINI_MODEL`, default `gemini-2.0-flash`) in `.env`.
- **Theme**: burgundy/black palette throughout, including the animated
  background.

## Notes

- No database — nothing is persisted; everything lives in memory for
  the current session.
- Browser voices are synthetic (Web Speech API) — there's no way to get
  a genuine recorded human voice for arbitrary uploaded text without a
  paid neural TTS service.
