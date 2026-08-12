import { useEffect, useRef, useState } from 'react';
import { sendChatMessage } from '../utils/api.js';
import './ChatBot.css';

export default function ChatBot({ docName, getContext, hasDoc }) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]); // [{role:'user'|'model', text}]
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const listRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight;
        }
    }, [messages, sending, open]);

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    async function handleSend(e) {
        e?.preventDefault();
        const text = input.trim();
        if (!text || sending) return;

        const nextMessages = [...messages, { role: 'user', text }];
        setMessages(nextMessages);
        setInput('');
        setSending(true);
        setError('');

        try {
            // RAG retrieval: pull only the chunks relevant to *this*
            // question instead of sending the whole document every time.
            const context = getContext ? getContext(text) : '';
            const reply = await sendChatMessage(
                text,
                nextMessages.map(({ role, text }) => ({ role, text })),
                context,
                docName
            );
            setMessages((cur) => [...cur, { role: 'model', text: reply }]);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Something went wrong. Try again.');
        } finally {
            setSending(false);
        }
    }

    return (
        <>
            <button
                className={`chatbot-fab${open ? ' hidden' : ''}`}
                aria-label="Open chat assistant"
                onClick={() => setOpen(true)}
            >
                <svg viewBox="0 0 24 24" fill="none">
                    <path
                        d="M4 5h16v11H8l-4 4V5Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinejoin="round"
                    />
                    <path d="M8 9h8M8 12.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
            </button>

            <div className={`chatbot-panel${open ? ' open' : ''}`}>
                <header className="chatbot-header">
                    <div className="chatbot-title">
                        <span className="chatbot-dot" />
                        <div>
                            <h2>Ask Paperwaves</h2>
                            <p>{hasDoc ? `Chatting about "${docName}"` : 'Open a PDF to chat about it'}</p>
                        </div>
                    </div>
                    <button className="chatbot-close" aria-label="Close chat" onClick={() => setOpen(false)}>
                        <svg viewBox="0 0 24 24" fill="none">
                            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                    </button>
                </header>

                <div className="chatbot-messages" ref={listRef}>
                    {messages.length === 0 && (
                        <div className="chatbot-empty">
                            {hasDoc
                                ? 'Ask me anything about this document — summaries, definitions, or specific details.'
                                : "I'll be able to answer questions about your PDF once you open one. Ask me anything in the meantime."}
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} className={`chatbot-msg ${m.role}`}>
                            {m.text}
                        </div>
                    ))}
                    {sending && (
                        <div className="chatbot-msg model chatbot-typing">
                            <span /><span /><span />
                        </div>
                    )}
                    {error && <div className="chatbot-error">{error}</div>}
                </div>

                <form className="chatbot-input-row" onSubmit={handleSend}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={hasDoc ? 'Ask about this document…' : 'Ask a question…'}
                        disabled={sending}
                    />
                    <button type="submit" className="chatbot-send" disabled={sending || !input.trim()} aria-label="Send message">
                        <svg viewBox="0 0 24 24" fill="none">
                            <path d="M4 12h16M13 5l7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </form>
            </div>
        </>
    );
}