import { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// import GalaxyBackground from './components/GalaxyBackground.jsx';
import Sidebar from './components/Sidebar.jsx';
import Toolbar from './components/Toolbar.jsx';
import PdfViewer from './components/PdfViewer.jsx';
import TranslatedPanel from './components/TranslatedPanel.jsx';
import Dock from './components/Dock.jsx';
import useSpeechEngine from './hooks/useSpeechEngine.js';
import { translateText } from './utils/api.js';
import { chunkWords } from './utils/textChunk.js';
import { ThemeProvider, ThemeToggle } from './hooks/DarkLight.jsx';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export default function App() {
  const restartDebounceRef = useRef(null);
  const pdfViewerRef = useRef(null);
  const translatedPanelRef = useRef(null);
  const pdfDocRef = useRef(null);
  const pausedRef = useRef(false);
  const translatedCacheRef = useRef({}); // key `${pageIdx}_${lang}` -> { status, text, ranges }
  const animFrameRef = useRef(null);
  // Anchor for the smooth progress-bar animation: the moment (time, idx)
  // we last KNEW the true reading position (from an actual onBoundary
  // event or an optimistic click/seek), plus the active ranges array.
  // Between real boundary events the rAF loop below interpolates the
  // fill forward based on an estimated per-word duration, so the bar
  // glides continuously like a music player instead of jumping only
  // when a word boundary fires.
  const segAnchorRef = useRef({ time: 0, idx: 0, ranges: [] });

  const speech = useSpeechEngine();

  const [fileInfo, setFileInfo] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [progressMessage, setProgressMessage] = useState('No document loaded yet.');

  const [pagesText, setPagesText] = useState([]);
  const [rangesMeta, setRangesMeta] = useState([]); // [[{start,end}]]
  const [pageCount, setPageCount] = useState(0);
  const [viewingPage, setViewingPage] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [currentItemIdx, setCurrentItemIdx] = useState(0);

  const [mode, setMode] = useState('original'); // 'original' | 'translated'
  const [targetLang, setTargetLang] = useState('hindi');
  const [translatedCache, setTranslatedCache] = useState({});

  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const hasDoc = pagesText.length > 0;

  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  function updatePaused(v) {
    pausedRef.current = v;
    setIsPaused(v);
  }

  function updateCache(key, entry) {
    translatedCacheRef.current = { ...translatedCacheRef.current, [key]: entry };
    setTranslatedCache(translatedCacheRef.current);
  }

  // ---------- File loading ----------
  async function handleFileSelected(file) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setStatusMessage("That doesn't look like a PDF — try another file.");
      return;
    }
    stopSpeaking();
    setStatusMessage('Opening your PDF…');
    setFileInfo({ name: file.name, meta: `${(file.size / 1024).toFixed(0)} KB · parsing…` });

    try {
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      pdfDocRef.current = doc;
      setFileInfo({ name: file.name, meta: `${doc.numPages} pages · ${(file.size / 1024).toFixed(0)} KB` });

      setStatusMessage('Rendering pages…');
      const result = await pdfViewerRef.current.renderAllPages(doc, zoomLevel, (pageNum, total, phase) => {
        setStatusMessage(
          phase === 'ocr'
            ? `Scanning handwriting/images — page ${pageNum} of ${total}…`
            : `Rendering pages… ${pageNum} of ${total}`
        );
      });
      setPageCount(result.pageCount);
      setPagesText(result.pagesText);
      setRangesMeta(result.ranges);
      translatedCacheRef.current = {};
      setTranslatedCache({});
      setMode('original');
      setViewingPage(0);
      setCurrentPage(0);
      setStatusMessage('Ready — scroll to read, or press play to listen.');
      setProgressMessage(`Page 1 of ${result.pageCount} · ${result.ranges[0]?.length || 0} readable chunks`);
    } catch (err) {
      console.error(err);
      setStatusMessage('Could not open that PDF. It may be scanned/image-only or corrupted.');
    }
  }

  function clearFile() {
    stopSpeaking();
    pdfViewerRef.current?.clear();
    pdfDocRef.current = null;
    setFileInfo(null);
    setPagesText([]);
    setRangesMeta([]);
    setPageCount(0);
    setViewingPage(0);
    setCurrentPage(0);
    translatedCacheRef.current = {};
    setTranslatedCache({});
    setMode('original');
    setStatusMessage('');
    setProgressMessage('No document loaded yet.');
    setProgressPct(0);
  }

  // ---------- Translation ----------
  async function ensureTranslated(pageIdx, lang) {
    const key = `${pageIdx}_${lang}`;
    const cached = translatedCacheRef.current[key];
    if (cached && cached.status === 'ready') return cached;

    const source = (pagesText[pageIdx] || '').trim();
    if (!source) {
      const entry = { status: 'ready', text: '', ranges: [] };
      updateCache(key, entry);
      return entry;
    }

    updateCache(key, { status: 'loading', text: '', ranges: null });
    const chunks = chunkWords(source, 280);
    let full = '';
    try {
      for (let i = 0; i < chunks.length; i++) {
        setProgressMessage(`Translating page ${pageIdx + 1}… (${i + 1}/${chunks.length})`);
        const piece = await translateText(chunks[i], lang);
        full += (full ? ' ' : '') + piece;
      }
    } catch (err) {
      console.error(err);
      updateCache(key, { status: 'error', text: '', ranges: [] });
      setProgressMessage('Translation failed.');
      throw err;
    }
    const entry = { status: 'ready', text: full.trim(), ranges: null };
    updateCache(key, entry);
    setProgressMessage(`Page ${pageIdx + 1} of ${pageCount} translated to ${lang === 'hindi' ? 'Hindi' : 'Hinglish'}.`);
    return entry;
  }

  function handleTranslatedRendered(ranges) {
    const key = `${viewingPage}_${targetLang}`;
    const prev = translatedCacheRef.current[key];
    if (!prev) return;
    updateCache(key, { ...prev, ranges });
  }

  // ---------- Mode-aware helpers ----------
  function getActiveRanges(pageIdx) {
    if (mode === 'translated') {
      const entry = translatedCacheRef.current[`${pageIdx}_${targetLang}`];
      return entry?.ranges || [];
    }
    return rangesMeta[pageIdx] || [];
  }

  // ---------- Navigation ----------
  async function scrollOrShow(pageIdx, langOverride) {
    if (mode === 'translated') {
      await ensureTranslated(pageIdx, langOverride || targetLang);
    } else {
      pdfViewerRef.current?.scrollToPage(pageIdx);
    }
  }

  async function gotoPage(delta) {
    const target = Math.min(pageCount - 1, Math.max(0, viewingPage + delta));
    setViewingPage(target);
    await scrollOrShow(target);
    setProgressMessage(`Page ${target + 1} of ${pageCount} · ${getActiveRanges(target).length || (rangesMeta[target]?.length ?? 0)} readable chunks`);
    if (isPlaying) speakFromChar(target, 0);
  }

  async function handleModeChange(newMode) {
    if (newMode === mode) return;
    stopSpeaking();
    setMode(newMode);
    if (newMode === 'translated') await ensureTranslated(viewingPage, targetLang);
    else pdfViewerRef.current?.scrollToPage(viewingPage);
  }

  async function handleLangChange(lang) {
    stopSpeaking();
    setTargetLang(lang);
    if (mode === 'translated') await ensureTranslated(viewingPage, lang);
  }


  // ---------- Speech ----------
  function highlightAt(pageIdx, charIndex) {
    const ranges = getActiveRanges(pageIdx);
    if (!ranges.length) return;
    let idx = ranges.findIndex((r) => r.start <= charIndex && charIndex < r.end);
    if (idx === -1) {
      idx = ranges.findIndex((r) => r.start > charIndex);
      idx = idx === -1 ? ranges.length - 1 : Math.max(0, idx - 1);
    }
    setCurrentItemIdx(idx);
    if (mode === 'translated') translatedPanelRef.current?.highlightIndex(idx);
    else pdfViewerRef.current?.highlightIndex(pageIdx, idx);

    // Re-anchor the smooth animation to this known-true position. This
    // fires on every real onBoundary event AND on optimistic
    // click/seek jumps, so the bar always snaps back to the correct
    // spot and then resumes gliding forward from there.
    segAnchorRef.current = { time: performance.now(), idx, ranges };
    setProgressPct(Math.min(100, Math.round((idx / ranges.length) * 100)));
  }

  // ---------- Smooth (Spotify-style) progress animation ----------
  // Anchored by an estimated CHARACTER position, not just the current
  // word. Real onBoundary events (via highlightAt) correct/re-anchor it
  // whenever they arrive, but the bar keeps gliding forward continuously
  // between them by extrapolating from the anchor — so even if the
  // browser's boundary events are sparse or stop firing altogether (a
  // known quirk on some voices/platforms), the slider still moves the
  // whole time speech is playing, instead of freezing after one word.
  function startProgressAnim() {
    cancelAnimationFrame(animFrameRef.current);
    let lastPaint = 0;
    const tick = (now) => {
      if (!pausedRef.current) {
        const { time, idx, ranges } = segAnchorRef.current;
        if (ranges && ranges.length) {
          const totalChars = Math.max(ranges[ranges.length - 1].end, 1);
          const anchorChar = ranges[idx]?.start ?? 0;
          // Rough chars/sec at 1x rate, scaled by the current speech
          // rate so faster/slower voices still track reasonably well.
          const charsPerSec = 13 * (speech.rate || 1);
          const elapsedChars = ((now - time) / 1000) * charsPerSec;
          const estCharPos = Math.min(totalChars, anchorChar + elapsedChars);
          // Cap the estimate just short of 100% while gliding — actual
          // completion is driven by onEnd, not the estimate, so it never
          // visually "finishes" ahead of the real audio.
          const pct = Math.min(99, (estCharPos / totalChars) * 100);
          // Throttle React state updates to ~20fps — plenty smooth
          // visually, without re-rendering on every animation frame.
          if (now - lastPaint > 50) {
            setProgressPct((prev) => (pct > prev ? pct : prev));
            lastPaint = now;
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }

  function stopProgressAnim() {
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
  }

  async function speakFromChar(pageIdx, charStart) {
    if (!pagesText.length) return;

    let text;
    if (mode === 'translated') {
      setViewingPage(pageIdx);
      const entry = await ensureTranslated(pageIdx, targetLang);
      text = entry.text;
    } else {
      pdfViewerRef.current?.scrollToPage(pageIdx);
      text = pagesText[pageIdx];
    }

    if (!text) { setIsPlaying(false); return; }
    setCurrentPage(pageIdx);
    // Optimistic highlight/progress: jump straight to the clicked/sought
    // word now, rather than waiting for the engine's first onboundary
    // event (which lags behind by the speak() setTimeout + first-word
    // delay). Without this the slider/highlight briefly snapped back to
    // wherever it was before, then caught up a moment later.
    highlightAt(pageIdx, charStart);

    let forceVoice, forceLang;
    if (mode === 'translated' && targetLang === 'hindi') {
      const hi = speech.findVoiceByLangPrefix('hi');
      if (hi) { forceVoice = hi; forceLang = hi.lang; }
    }

    speech.speak(text.slice(charStart), {
      charOffset: charStart,
      forceVoice,
      forceLang,
      onBoundary: (abs) => highlightAt(pageIdx, abs),
      onEnd: () => {
        if (!pausedRef.current) {
          if (pageIdx < pagesText.length - 1) speakFromChar(pageIdx + 1, 0);
          else { setIsPlaying(false); stopProgressAnim(); }
        }
      },
      onError: () => { setIsPlaying(false); stopProgressAnim(); }
    });
    setIsPlaying(true);
    updatePaused(false);
    startProgressAnim();
  }

  function stopSpeaking() {
    speech.cancel();
    setIsPlaying(false);
    updatePaused(false);
    stopProgressAnim();
    pdfViewerRef.current?.clearHighlight();
    translatedPanelRef.current?.clearHighlight();
  }

  function handlePlayPause() {
    if (!pagesText.length) return;
    if (!isPlaying) speakFromChar(viewingPage, 0);
    else if (isPlaying && !isPaused) {
      speech.pause();
      updatePaused(true);
      stopProgressAnim(); // freeze the bar exactly where it is
    } else if (isPaused) {
      speech.resume();
      updatePaused(false);
      // Re-anchor to "now" at the current word so the glide resumes
      // smoothly instead of jumping using a stale, paused-over timestamp.
      const ranges = getActiveRanges(currentPage);
      segAnchorRef.current = { time: performance.now(), idx: currentItemIdx, ranges };
      startProgressAnim();
    }
  }

  function handleProgressSeek(ratio) {
    const pageForSeek = isPlaying || isPaused ? currentPage : viewingPage;
    const ranges = getActiveRanges(pageForSeek);
    if (!ranges.length) return;

    const idx = Math.min(
      ranges.length - 1,
      Math.max(0, Math.round(ratio * (ranges.length - 1)))
    );

    // speakFromChar -> speech.speak() already cancels whatever's currently
    // speaking (with a token guard so the cancelled utterance's stale
    // onend can't race the new one and hijack playback) — no need to
    // cancel a second time here.
    setIsPlaying(true);
    updatePaused(false);
    speakFromChar(pageForSeek, ranges[idx].start);
  }

  function handleWordClickOriginal(pageIdx, charStart) {
    speakFromChar(pageIdx, charStart);
  }
  function handleWordClickTranslated(charStart) {
    speakFromChar(viewingPage, charStart);
  }

  function handleVoiceChange(idx) {
    speech.setVoiceIndex(Number(idx));
    if (isPlaying) restartAtCurrentWord();
  }
  function handleRateChange(v) {
    speech.setRate(v); // updates instantly — slider itself feels smooth
    if (isPlaying) {
      clearTimeout(restartDebounceRef.current);
      restartDebounceRef.current = setTimeout(() => restartAtCurrentWord(), 300);
    }
  }
  function handleVolumeChange(v) {
    speech.setVolume(v);
    if (isPlaying) {
      clearTimeout(restartDebounceRef.current);
      restartDebounceRef.current = setTimeout(() => restartAtCurrentWord(), 300);
    }
  }
  function restartAtCurrentWord() {
    const ranges = getActiveRanges(currentPage);
    if (!ranges.length) return;
    speakFromChar(currentPage, ranges[currentItemIdx]?.start || 0);
  }

  const translatedEntry = translatedCache[`${viewingPage}_${targetLang}`];

  return (
    <div className={`"app"`} >
      <header>
        <button className="hamburger-btn" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
          <span />
        </button>
        <div className="brand">
          <div className="mark">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 4v16M4 4h11l5 5v11H4" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M8 12h6M8 16h6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1>Paperwaves</h1>
            <p>PDF · listened, not just read</p>
          </div>
        </div>
        <div className="tagline">"Every page has a voice — you just have to press play."</div>
        <ThemeProvider>
          <ThemeToggle/>
        </ThemeProvider>
        
      </header>

      <div className={`sidebar-backdrop${sidebarOpen ? ' show' : ''}`} onClick={() => setSidebarOpen(false)} />

      <div className="layout">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          fileInfo={fileInfo}
          statusMessage={statusMessage}
          progressMessage={progressMessage}
          onFileSelected={handleFileSelected}
          onClearFile={clearFile}
          voices={speech.voices}
          selectedVoiceIndex={speech.voiceIndex}
          onVoiceChange={handleVoiceChange}
          rate={speech.rate}
          volume={speech.volume}
          onRateChange={handleRateChange}
          onVolumeChange={handleVolumeChange}
          targetLang={targetLang}
          onLangChange={handleLangChange}
        />

        <section className="reading">
          <Toolbar
            pageLabel={hasDoc ? `Page ${viewingPage + 1} / ${pageCount}` : 'Page — / —'}
            canPrev={hasDoc && viewingPage > 0}
            canNext={hasDoc && viewingPage < pageCount - 1}
            onPrev={() => gotoPage(-1)}
            onNext={() => gotoPage(1)}
            mode={mode}
            onModeChange={handleModeChange}
            canGoTranslated={hasDoc}
            translateStatus={mode === 'translated' ? progressMessage.includes('Translating') ? progressMessage : '' : ''}
          />

          <PdfViewer
            ref={pdfViewerRef}
            hidden={mode !== 'original'}
            hasContent={hasDoc}
            onViewingPageChange={(idx) => { if (mode === 'original') setViewingPage(idx); }}
            onWordClick={handleWordClickOriginal}
          />
          <TranslatedPanel
            ref={translatedPanelRef}
            hidden={mode !== 'translated'}
            status={translatedEntry?.status || 'idle'}
            text={translatedEntry?.text || ''}
            targetLang={targetLang}
            onWordClick={handleWordClickTranslated}
            onRendered={handleTranslatedRendered}
          />
        </section>
      </div>

      <Dock
        title={fileInfo?.name || 'Nothing loaded'}
        isPlaying={isPlaying}
        isPaused={isPaused}
        progressPct={progressPct}
        controlsEnabled={hasDoc}
        seekEnabled={isPlaying}
        onStop={stopSpeaking}
        onPlayPause={handlePlayPause}
        onPrevPage={() => gotoPage(-1)}
        onNextPage={() => gotoPage(1)}
        onProgressSeek={handleProgressSeek}
      />

      <footer>PAPERWAVES · PDF stays in your browser · translation goes through your own backend</footer>
    </div>
  );
}