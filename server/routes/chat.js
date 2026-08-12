import { Router } from 'express';

const router = Router();

// ---------------------------------------------------------------------
// Chatbot backed by Sarvam AI's Chat Completions API — same key/account
// as the /api/translate route already uses, no separate signup needed.
// https://docs.sarvam.ai/api-reference/chat/chat-completions
// The client sends the document's text (or the current page's text,
// trimmed) as `context`, plus the running message history, and we
// forward it all as a system message so answers stay grounded in the
// document instead of hallucinating.
// ---------------------------------------------------------------------

const SARVAM_CHAT_URL = 'https://api.sarvam.ai/v1/chat/completions';
const MODEL = 'sarvam-105b';
const MAX_CONTEXT_CHARS = 12000; // keep prompt size sane for long PDFs
const MAX_HISTORY_TURNS = 10;

// POST /api/chat  { message: string, history?: [{role:'user'|'model', text}], context?: string, docName?: string }
router.post('/', async (req, res) => {
    const { message, history, context, docName } = req.body || {};

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Missing "message" in request body.' });
    }
    if (!process.env.SARVAM_API_KEY) {
        return res.status(500).json({ error: 'Server is missing SARVAM_API_KEY. Add it to server/.env.' });
    }

    const trimmedContext = (context || '').slice(0, MAX_CONTEXT_CHARS);

    const systemPrompt = trimmedContext
        ? `You are Paperwaves' in-app assistant, helping the user understand a PDF they have open${docName ? ` called "${docName}"` : ''}. Answer using the document text below whenever it's relevant, and say clearly when something isn't covered by the document. Keep answers concise and conversational.\n\n--- DOCUMENT TEXT (may be truncated) ---\n${trimmedContext}`
        : `You are Paperwaves' in-app assistant. No PDF is loaded yet, so let the user know you'll be able to answer questions about their document once they open one, but still help with general questions in the meantime. Keep answers concise.`;

    // Sarvam's chat API uses OpenAI-style roles ('user' / 'assistant'), so
    // map our stored 'model' role (kept for parity with the client state) to 'assistant'.
    const turns = Array.isArray(history) ? history.slice(-MAX_HISTORY_TURNS * 2) : [];
    const messages = [
        { role: 'system', content: systemPrompt },
        ...turns
            .filter((t) => t && typeof t.text === 'string' && (t.role === 'user' || t.role === 'model'))
            .map((t) => ({ role: t.role === 'model' ? 'assistant' : 'user', content: t.text })),
        { role: 'user', content: message }
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        const response = await fetch(SARVAM_CHAT_URL, {
            method: 'POST',
            headers: {
                'api-subscription-key': process.env.SARVAM_API_KEY,
                'Content-Type': 'application/json'
            },
            signal: controller.signal,
            body: JSON.stringify({
                model: MODEL,
                messages,
                temperature: 0.4,
                max_tokens: 1024,
                reasoning_effort: null
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Sarvam chat API ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content?.trim();

        if (!reply) {
            return res.status(502).json({ error: 'Sarvam returned an empty response.' });
        }

        res.json({ reply });
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error('Chat route timed out');
            return res.status(504).json({ error: 'Chat request timed out. Try again.' });
        }
        console.error('Sarvam chat failed:', err.message || err);
        res.status(502).json({ error: 'Chat service error: ' + (err.message || 'unknown error') });
    } finally {
        clearTimeout(timeout);
    }
});

export default router;