import { Router } from 'express';

const router = Router();

// ---------------------------------------------------------------------
// Sarvam AI Translation API — free signup, no credit card required.
// https://docs.sarvam.ai/api-reference/text/translate-text
// Natively supports Hindi (Devanagari) AND Hinglish (Roman script) via
// the output_script param — no manual transliteration needed.
// Each request is capped at 1000 characters, so we chunk longer text.
// ---------------------------------------------------------------------

const SARVAM_URL = 'https://api.sarvam.ai/translate';
const MAX_CHUNK_CHARS = 950; // stay safely under the 1000-char cap

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

async function translateChunkViaSarvam(chunk, outputScript) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(SARVAM_URL, {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        input: chunk,
        source_language_code: 'en-IN',
        target_language_code: 'hi-IN',
        model: 'mayura:v1',
        mode: 'modern-colloquial',
        output_script: outputScript, // null = Devanagari, 'roman' = Hinglish
        numerals_format: 'international'
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Sarvam API ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    if (!data.translated_text) {
      throw new Error('Sarvam returned no translated_text');
    }
    return data.translated_text;
  } finally {
    clearTimeout(timeout);
  }
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
  if (!process.env.SARVAM_API_KEY) {
    return res.status(500).json({ error: 'Server is missing SARVAM_API_KEY. Add it to server/.env.' });
  }

  const outputScript = targetLang === 'hinglish' ? 'roman' : null;

  try {
    const chunks = splitIntoChunks(text, MAX_CHUNK_CHARS);
    const translatedChunks = [];

    for (const chunk of chunks) {
      const piece = await translateChunkViaSarvam(chunk, outputScript);
      translatedChunks.push(piece);
    }

    const finalText = translatedChunks.join(' ').trim();

    if (!finalText) {
      return res.status(502).json({ error: 'Translation service returned an empty response.' });
    }

    res.json({ translatedText: finalText });
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('Translate route timed out');
      return res.status(504).json({ error: 'Translation request timed out. Try again.' });
    }
    console.error('Sarvam translate failed:', err.message || err);
    res.status(502).json({ error: 'Translation service error: ' + (err.message || 'unknown error') });
  }
});

export default router;