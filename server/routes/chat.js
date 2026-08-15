import { Router } from 'express';

const router = Router();

// ---------------------------------------------------------------------
// Chatbot backed by Google Gemini API — free tier via Google AI Studio.
// https://ai.google.dev/gemini-api/docs
// gemini-2.5-flash is blocked for new API keys (retiring Oct 16, 2026),
// so this uses gemini-3.1-flash-lite — current gen, available to new
// keys, free tier ~15 requests/min. Not "unlimited" — nobody's free
// tier is — but generous enough for a college project / personal app.
// Want noticeably smarter (but slower/lower-RPM) answers? Swap the
// model string below for 'gemini-3.5-flash'.
//
// `context` is NOT the whole PDF — the client does lightweight RAG
// (client/src/utils/ragSearch.js: TF-IDF chunking + retrieval) and sends
// just the few passages relevant to the current question, tagged with
// their page numbers. We forward that as a system instruction so answers
// stay grounded in the document instead of hallucinating.
// ---------------------------------------------------------------------

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_CONTEXT_CHARS = 16000; // room for the full current page + a few extra chunks
const MAX_HISTORY_TURNS = 10;

// POST /api/chat  { message: string, history?: [{role:'user'|'model', text}], context?: string, docName?: string }
router.post('/', async (req, res) => {
    const { message, history, context, docName } = req.body || {};

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Missing "message" in request body.' });
    }
    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'Server is missing GEMINI_API_KEY. Add it to server/.env.' });
    }

    const trimmedContext = (context || '').slice(0, MAX_CONTEXT_CHARS);

    const systemPrompt = trimmedContext
        ? `You are Paperwaves' in-app assistant, helping the user understand a PDF they have open${docName ? ` called "${docName}"` : ''}. Below are passages from the document — the page the user is currently viewing (included in full) plus a few other passages retrieved as relevant to their question, each tagged with its page number. Treat the currently-viewed page as the most likely source of the answer. Give a thorough, well-explained answer: cover the relevant definitions, steps, or reasoning from the passages in your own words, not just a one-line summary, and cite the page number when it helps. If a passage genuinely doesn't cover the question, say so plainly rather than guessing.\n\n--- DOCUMENT PASSAGES ---\n${trimmedContext}`
        : `You are Paperwaves' in-app assistant. No PDF is loaded yet, so let the user know you'll be able to answer questions about their document once they open one, but still help with general questions in the meantime. Give thorough, well-explained answers.`;

    // Gemini's API uses 'user' / 'model' roles natively — matches our
    // stored history shape already, so no role-mapping needed here.
    const turns = Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS * 2) : [];
    const contents = [
        ...turns
            .filter((t) => t && typeof t.text === 'string' && (t.role === 'user' || t.role === 'model'))
            .map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        { role: 'user', parts: [{ text: message }] }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: {
                'x-goog-api-key': process.env.GEMINI_API_KEY,
                'Content-Type': 'application/json'
            },
            signal: controller.signal,
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: 2048
                }
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Gemini API ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();

        if (!reply) {
            return res.status(502).json({ error: 'Gemini returned an empty response.' });
        }

        res.json({ reply });
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error('Chat route timed out');
            return res.status(504).json({ error: 'Chat request timed out. Try again.' });
        }
        console.error('Gemini chat failed:', err.message || err);
        res.status(502).json({ error: 'Chat service error: ' + (err.message || 'unknown error') });
    } finally {
        clearTimeout(timeout);
    }
});

export default router;