/**
 * Lightweight, fully client-side RAG (Retrieval-Augmented Generation) —
 * no embeddings API, no extra API key, no network call.
 *
 * Sarvam AI (the provider already used for translate/chat) doesn't offer
 * an embeddings endpoint, and a separate embeddings provider would mean
 * another API key + cost. Instead we use classic TF-IDF scoring, which
 * is "good enough" retrieval for a single PDF: it finds the chunks whose
 * words best match the question, so the chatbot gets a handful of
 * relevant paragraphs instead of the whole document (or a truncated
 * chunk of it) stuffed into the prompt.
 *
 * Flow:
 *   1. buildChunks()  — split each page's text into ~180-word chunks
 *   2. buildIndex()   — compute term frequency (TF) per chunk + inverse
 *                        document frequency (IDF) across all chunks
 *   3. searchChunks() — score every chunk against the question's terms,
 *                        return the top-K highest scoring chunks
 */

const STOPWORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'of', 'to', 'in', 'on', 'for', 'and', 'or',
    'with', 'as', 'by', 'at', 'from', 'that', 'this', 'it', 'be', 'which', 'has', 'have',
    'had', 'not', 'but', 'can', 'will', 'would', 'should', 'could', 'do', 'does', 'did',
    'you', 'your', 'i', 'we', 'our', 'they', 'their', 'he', 'she', 'his', 'her', 'its',
    'if', 'then', 'than', 'so', 'such', 'into', 'about', 'what', 'who', 'how', 'when',
    'where', 'why', 'also', 'these', 'those', 'there', 'been', 'being', 'more', 'most'
]);

function tokenize(text) {
    return (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter(
        (w) => w.length > 2 && !STOPWORDS.has(w)
    );
}

/**
 * Splits page text into overlapping word chunks so a chunk boundary
 * never fully severs a relevant passage. Each chunk remembers which
 * page it came from (0-indexed) so the model — and the UI, if desired
 * later — can reference "page N".
 */
export function buildChunks(pagesText, wordsPerChunk = 180, overlap = 40) {
    const chunks = [];
    (pagesText || []).forEach((pageText, pageIdx) => {
        const words = (pageText || '').split(/\s+/).filter(Boolean);
        if (!words.length) return;

        let start = 0;
        while (start < words.length) {
            const end = Math.min(words.length, start + wordsPerChunk);
            chunks.push({ pageIdx, text: words.slice(start, end).join(' ') });
            if (end === words.length) break;
            start += wordsPerChunk - overlap;
        }
    });
    return chunks;
}

/** Precomputes per-chunk term frequencies and corpus-wide IDF weights. */
export function buildIndex(chunks) {
    const df = new Map(); // term -> number of chunks containing it
    const chunkTerms = chunks.map((c) => {
        const tf = new Map();
        for (const term of tokenize(c.text)) tf.set(term, (tf.get(term) || 0) + 1);
        for (const term of tf.keys()) df.set(term, (df.get(term) || 0) + 1);
        return tf;
    });

    const N = chunks.length || 1;
    const idf = new Map();
    for (const [term, count] of df.entries()) {
        idf.set(term, Math.log((N + 1) / (count + 0.5)) + 1);
    }

    return { chunkTerms, idf };
}

/**
 * Scores every chunk by summing (term frequency * IDF) over the
 * question's terms, and returns the top-K chunks — the retrieval step
 * of RAG. Falls back to the first few chunks if the question shares no
 * vocabulary with the document (e.g. "summarize this").
 */
export function searchChunks(query, chunks, index, topK = 4) {
    if (!chunks.length) return [];

    const qTerms = tokenize(query);
    if (!qTerms.length) return chunks.slice(0, topK);

    const scored = chunks.map((chunk, i) => {
        const tf = index.chunkTerms[i];
        let score = 0;
        for (const term of qTerms) {
            const freq = tf.get(term);
            if (freq) score += freq * (index.idf.get(term) || 0);
        }
        return { chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.filter((s) => s.score > 0).slice(0, topK);
    return (top.length ? top : scored.slice(0, topK)).map((s) => s.chunk);
}