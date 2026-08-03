import { forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import './PdfViewer.css'; // reuses .paper-wrap / .paper / .word styles

const TranslatedPanel = forwardRef(function TranslatedPanel(
  { hidden, status, text, targetLang, onWordClick, onRendered },
  ref
) {
  const containerRef = useRef(null);
  const rangesRef = useRef([]);
  const activeWordRef = useRef(null);

  useImperativeHandle(ref, () => ({
    highlightIndex(idx) {
      const ranges = rangesRef.current;
      if (!ranges[idx]) return;
      if (activeWordRef.current) activeWordRef.current.classList.remove('active');
      ranges[idx].el.classList.add('active');
      ranges[idx].el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      activeWordRef.current = ranges[idx].el;
    },
    clearHighlight() {
      if (activeWordRef.current) {
        activeWordRef.current.classList.remove('active');
        activeWordRef.current = null;
      }
    }
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';
    rangesRef.current = [];
    activeWordRef.current = null;

    if (status !== 'ready' || !text) return;

    const matches = [...text.matchAll(/\S+/g)];
    const ranges = [];
    const frag = document.createDocumentFragment();
    let lastEnd = 0;
    matches.forEach((m) => {
      if (m.index > lastEnd) frag.appendChild(document.createTextNode(text.slice(lastEnd, m.index)));
      const span = document.createElement('span');
      span.className = 'word';
      span.textContent = m[0];
      span.addEventListener('click', () => onWordClick?.(m.index));
      frag.appendChild(span);
      ranges.push({ start: m.index, end: m.index + m[0].length, el: span });
      lastEnd = m.index + m[0].length;
    });
    if (lastEnd < text.length) frag.appendChild(document.createTextNode(text.slice(lastEnd)));

    const paper = document.createElement('div');
    paper.className = 'paper';
    paper.appendChild(frag);
    container.appendChild(paper);

    rangesRef.current = ranges;
    onRendered?.(ranges.map(({ start, end }) => ({ start, end })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, text]);

  return (
    <div className={`paper-wrap${hidden ? ' hidden' : ''}`}>
      {status === 'idle' && (
        <div className="empty">
          <h2>Nothing translated yet</h2>
          <p>Pick Hindi or Hinglish on the left, then open this tab.</p>
        </div>
      )}
      {status === 'loading' && (
        <div className="empty">
          <h2>Translating…</h2>
          <p>Turning this page into {targetLang === 'hindi' ? 'Hindi' : 'Hinglish'}.</p>
        </div>
      )}
      {status === 'error' && (
        <div className="empty">
          <h2>Translation failed</h2>
          <p>Something went wrong — check your connection (and that the backend server is running) and try again.</p>
        </div>
      )}
      {status === 'ready' && !text && (
        <div className="empty">
          <h2>Nothing to translate</h2>
          <p>This page has no extractable text.</p>
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
});

export default TranslatedPanel;
