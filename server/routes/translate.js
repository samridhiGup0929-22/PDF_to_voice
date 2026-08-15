import { Router } from 'express';
import sanscript from '@indic-transliteration/sanscript';
const { t: transliterate } = sanscript;

const router = Router();

// ---------------------------------------------------------------------
// MyMemory Translation API — completely free, NO signup / NO API key.
// https://mymemory.translated.net/doc/spec.php
// Anonymous limit: ~5000 words/day, ~500 bytes per request.
// If you add a free MYMEMORY_EMAIL in .env, daily quota jumps to 10,000
// words/day (MyMemory's way of reducing abuse, not an auth requirement).
//
// MyMemory only outputs Devanagari — it has no "roman/Hinglish" mode
// like Sarvam did. So for targetLang === 'hinglish' we translate to
// Devanagari first, then transliterate to Roman script LOCALLY using
// @indic-transliteration/sanscript (a JS library, not an API call —
// so this step has literally no rate limit at all).
// ---------------------------------------------------------------------

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const MAX_CHUNK_CHARS = 450; // stay safely under MyMemory's ~500 byte cap

function splitIntoChunks(text, maxLen) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length <= maxLen) {
      current += sentence;
    } else {
      if (current.trim()) chunks.push(current.trim());
      if (sentence.length <= maxLen) {
        current = sentence;
      } else {
        let piece = '';
        for (const word of sentence.split(' ')) {
          if ((piece + ' ' + word).length > maxLen) {
            chunks.push(piece.trim());
            piece = word;
          } else {
            piece += (piece ? ' ' : '') + word;
          }
        }
        current = piece;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function translateChunkViaMyMemory(chunk) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  const params = new URLSearchParams({
    q: chunk,
    langpair: 'en|hi'
  });
  if (process.env.MYMEMORY_EMAIL) {
    params.set('de', process.env.MYMEMORY_EMAIL); // raises free daily quota
  }

  try {
    const response = await fetch(`${MYMEMORY_URL}?${params.toString()}`, {
      signal: controller.signal
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`MyMemory API ${response.status}: ${errBody}`);
    }

    const data = await response.json();

    // MyMemory returns HTTP 200 even on quota/error cases — the real
    // status lives inside the JSON body.
    if (data.responseStatus && Number(data.responseStatus) >= 400) {
      throw new Error(`MyMemory error: ${data.responseDetails || data.responseStatus}`);
    }
    const translated = data.responseData?.translatedText;
    if (!translated || /MYMEMORY WARNING/i.test(translated)) {
      throw new Error(translated || 'MyMemory returned no translation');
    }
    return translated;
  } finally {
    clearTimeout(timeout);
  }
}

// Common short function words where the inherent vowel IS pronounced —
// don't strip these even though the rule below would normally apply.
const KEEP_SCHWA = new Set([
  'hai', 'tha', 'thi', 'the', 'ka', 'ki', 'ke', 'sa', 'ya', 'wa', 'na', 'ne',
  'se', 'ko', 'ho', 'wo', 'ye', 'ab', 'sab', 'kya', 'aur', 'par', 'agar', 'jab',
  'tab', 'kab', 'kabhi', 'shayad', 'phir'
]);

function toHinglish(devanagariText) {
  const raw = transliterate(devanagariText, 'devanagari', 'itrans');

  // Raw ITRANS is a letter-for-letter Sanskrit-style transliteration —
  // it writes every inherent vowel that Hindi actually drops when spoken
  // ("आप" -> "Apa" instead of "aap"). We post-process it into natural
  // casual Hinglish: long vowels get doubled letters, anusvara becomes
  // "n", and the word-final schwa gets deleted (the single biggest
  // readability fix), except for short function words and glide-final
  // endings like "-ya"/"-va" which keep their vowel in spoken Hindi.
  return raw
    .split(/(\s+)/)
    .map((tok) => {
      if (!/[a-zA-Z]/.test(tok)) return tok;

      let w = tok
        .replace(/A/g, 'aa')
        .replace(/I/g, 'ee')
        .replace(/U/g, 'oo')
        .replace(/M/g, 'n')
        .replace(/H$/g, '')
        .replace(/[RTDNSLG]/g, (c) => c.toLowerCase());

      w = w.toLowerCase();

      const bare = w.replace(/[^a-z]/g, '');
      const finalSchwa = w.match(/([bcdfghjklmnpqrstvwxyz])a([^a-z]*)$/);
      if (finalSchwa && !KEEP_SCHWA.has(bare) && bare.length >= 3 &&
          finalSchwa[1] !== 'y' && finalSchwa[1] !== 'v') {
        w = w.replace(/a([^a-z]*)$/, '$1');
      }
      return w;
    })
    .join('');
}

// POST /api/translate  { text: string, targetLang: 'hindi' | 'hinglish' }
router.post('/', async (req, res) => {
  const { text, targetLang } = req.body || {};

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing "text" in request body.' });
  }
  if (targetLang !== 'hindi' && targetLang !== 'hinglish') {
    return res.status(400).json({ error: 'targetLang must be "hindi" or "hinglish".' });
  }

  try {
    const chunks = splitIntoChunks(text, MAX_CHUNK_CHARS);
    const translatedChunks = [];

    for (const chunk of chunks) {
      const piece = await translateChunkViaMyMemory(chunk);
      translatedChunks.push(piece);
    }

    let finalText = translatedChunks.join(' ').trim();

    if (!finalText) {
      return res.status(502).json({ error: 'Translation service returned an empty response.' });
    }

    if (targetLang === 'hinglish') {
      finalText = toHinglish(finalText);
    }

    res.json({ translatedText: finalText });
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('Translate route timed out');
      return res.status(504).json({ error: 'Translation request timed out. Try again.' });
    }
    console.error('MyMemory translate failed:', err.message || err);
    res.status(502).json({ error: 'Translation service error: ' + (err.message || 'unknown error') });
  }
});

export default router;