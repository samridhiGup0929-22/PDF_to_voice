/**
 * Calls our own Express backend (see /server/routes/translate.js), which
 * holds the real Gemini API key server-side. The browser never talks
 * to Gemini directly — that would require exposing a key.
 *
 * Uses a RELATIVE path so Vite's dev proxy (see vite.config.js: '/api' ->
 * http://localhost:3001) forwards it automatically. The previous version
 * hardcoded http://localhost:5000, which nothing was listening on — every
 * request failed immediately with a connection error, which looked like
 * "the backend isn't running" even when `npm run server` was up fine on
 * port 3001.
 */
export async function translateText(text, targetLang) {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      targetLang, // server expects "targetLang" — previously sent as "lang"
    }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      `Translate request failed (${res.status}). Is the backend running? Start it with "npm run server" in a separate terminal.`
    );
  }

  if (!res.ok) {
    throw new Error(data.error || `Translate request failed (${res.status})`);
  }

  return data.translatedText; // server returns "translatedText" — previously read as "translated"
}

/**
 * Calls our /api/chat backend (see /server/routes/chat.js), which holds
 * the Sarvam API key server-side. `history` is the running conversation
 * so far as [{ role: 'user'|'model', text }], and `context` is the PDF
 * text to ground answers in.
 */
export async function sendChatMessage(message, history, context, docName) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, history, context, docName }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Chat request failed (${res.status}). Is the backend running?`);
  }

  if (!res.ok) {
    throw new Error(data.error || `Chat request failed (${res.status})`);
  }

  return data.reply;
}