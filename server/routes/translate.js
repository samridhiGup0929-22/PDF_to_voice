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

// ---------------------------------------------------------------------
// Protect names, contact info, and tech terms from translation.
//
// MyMemory doesn't recognize proper nouns (people's names, tech stack
// names like "React.js") — it just guesses at a phonetic Hindi rendering,
// which our Hinglish step then re-mangles a second time. The fix is to
// swap these out for inert placeholder tokens BEFORE translation, and
// swap the original text back in AFTER the Hinglish step (so nothing —
// not MyMemory, not our own transliteration — ever touches them).
// ---------------------------------------------------------------------

const TECH_TERMS = [
  'React.js', 'Next.js', 'Node.js', 'Express.js', 'Vue.js', 'Angular.js',
  'MongoDB', 'PostgreSQL', 'MySQL', 'Tailwind CSS', 'Tailwind', 'Bootstrap',
  'JavaScript', 'TypeScript', 'HTML5', 'HTML', 'CSS3', 'CSS', 'GraphQL',
  'REST API', 'REST', 'JSON', 'Git', 'GitHub', 'LinkedIn', 'AWS', 'Docker',
  'Kubernetes', 'Firebase', 'Vercel', 'Netlify', 'Redux', 'npm', 'API',
  'UI/UX', 'UI', 'UX', 'SQL', 'Python', 'Java', 'C++'
].sort((a, b) => b.length - a.length); // longest first so "React.js" wins over "React"

function protectSpecialTerms(text) {
  const protectedItems = [];
  const stash = (match) => `[[${protectedItems.push(match) - 1}]]`;
  let result = text;

  // emails
  result = result.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, stash);
  // urls / bare domains with a path (linkedin.com/in/..., github.com/...)
  result = result.replace(
    /\b(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:com|in|org|net|io|dev|co|me)(?:\/[^\s|,]*)?/gi,
    stash
  );
  // phone numbers (with optional country code)
  result = result.replace(/\+?\d[\d\s-]{7,}\d/g, stash);

  // known tech / product names
  for (const term of TECH_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), stash);
  }

  // proper-noun phrases — runs of 2+ Capitalized Words, e.g. person
  // names ("Samridhi Gupta") and place names ("Gorakhpur, UP")
  result = result.replace(/\b[A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)+\b/g, stash);

  // standalone ALL-CAPS codes/acronyms (course codes like "BCA503",
  // abbreviations like "CN", "OS", "DBMS"). These are already Latin
  // script in the source PDF — MyMemory leaves them untranslated, but
  // without protection they'd still get run through the Hinglish
  // letter-mangling step below (meant only for actual ITRANS output),
  // e.g. "BCA" -> "bcaa" because that step blindly rewrites every
  // capital A/I/U as if it were a transliterated Devanagari vowel.
  result = result.replace(/\b[A-Z]{2,}[0-9]*\b/g, stash);

  return { protectedText: result, protectedItems };
}

function restoreProtectedTerms(text, protectedItems) {
  return text.replace(/\[\[\s*(\d+)\s*\]\]/g, (full, idx) => {
    const item = protectedItems[Number(idx)];
    return item !== undefined ? item : full;
  });
}

// Common short function words where the inherent vowel IS pronounced —
// don't strip these even though the rule below would normally apply.
const KEEP_SCHWA = new Set([
  'hai', 'tha', 'thi', 'the', 'ka', 'ki', 'ke', 'sa', 'ya', 'wa', 'na', 'ne',
  'se', 'ko', 'ho', 'wo', 'ye', 'ab', 'sab', 'kya', 'aur', 'par', 'agar', 'jab',
  'tab', 'kab', 'kabhi', 'shayad', 'phir'
]);

// ---------------------------------------------------------------------
// Common English words borrowed into Hindi (written in Devanagari) that
// should come back out in their normal English spelling, not a
// letter-by-letter phonetic guess. Without this, "रिसीवर" (receiver)
// becomes "riseevar" — technically a valid phonetic reading, but not
// how anyone actually writes Hinglish. Add more pairs here as needed.
// ---------------------------------------------------------------------
const DEVANAGARI_LOANWORDS = [
  ['डेटा', 'data'],
  ['नेटवर्क्स', 'networks'],
  ['नेटवर्क', 'network'],
  ['कम्युनिकेशन', 'communication'],
  ['रिसीवर', 'receiver'],
  ['ट्रांसमीटर', 'transmitter'],
  ['ट्रांसमिशन', 'transmission'],
  ['कंप्यूटर', 'computer'],
  ['सॉफ्टवेयर', 'software'],
  ['हार्डवेयर', 'hardware'],
  ['इंटरनेट', 'internet'],
  ['सर्वर', 'server'],
  ['प्रोटोकॉल', 'protocol'],
  ['चैनल', 'channel'],
  ['बैंडविड्थ', 'bandwidth'],
  ['राउटर', 'router'],
  ['स्विच', 'switch'],
  ['केबल', 'cable'],
  ['सिग्नल', 'signal'],
  ['फ्रीक्वेंसी', 'frequency'],
  ['मॉडेम', 'modem'],
  ['सैटेलाइट', 'satellite'],
  ['टेलीफोन', 'telephone'],
  ['मोबाइल', 'mobile'],
  ['डिवाइस', 'device'],
  ['एप्लीकेशन', 'application'],
  ['डेटाबेस', 'database'],
  ['सिक्योरिटी', 'security'],
  ['एन्क्रिप्शन', 'encryption'],
  ['एल्गोरिदम', 'algorithm'],
  ['प्रोग्रामिंग', 'programming'],
  ['मेमोरी', 'memory'],
  ['प्रोसेसर', 'processor'],
  ['इंटरफेस', 'interface'],
  ['फॉर्मेट', 'format'],
  ['स्ट्रक्चर', 'structure'],
  ['स्टैंडर्ड', 'standard'],
  ['लेयर', 'layer'],
  ['पैकेट', 'packet'],
  ['एड्रेस', 'address'],
  ['डोमेन', 'domain'],
  ['ईमेल', 'email'],
  ['इमेल', 'email']
];

// Swaps recognized Devanagari loanwords for their English spelling,
// stashing into the SAME protectedItems array used for the pre-
// translation pass so one restoreProtectedTerms() call at the end
// unwinds everything. Must run AFTER MyMemory translation (the text
// needs to be in Devanagari for these to match) and BEFORE toHinglish
// (so the phonetic step never sees these words at all).
function protectDevanagariLoanwords(text, protectedItems) {
  let result = text;
  for (const [devanagari, english] of DEVANAGARI_LOANWORDS) {
    const pattern = new RegExp(`(?<![\\p{L}])${devanagari}(?![\\p{L}])`, 'gu');
    result = result.replace(pattern, () => `[[${protectedItems.push(english) - 1}]]`);
  }
  return result;
}

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
    const { protectedText, protectedItems } = protectSpecialTerms(text);
    const chunks = splitIntoChunks(protectedText, MAX_CHUNK_CHARS);
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
      finalText = protectDevanagariLoanwords(finalText, protectedItems);
      finalText = toHinglish(finalText);
    }

    finalText = restoreProtectedTerms(finalText, protectedItems);

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