import { useState } from 'react';
import './Dock.css';

export default function Dock({
  title,
  isPlaying,
  isPaused,
  progressPct,
  controlsEnabled,
  onStop,
  onPlayPause,
  onPrevPage,
  onNextPage,
  onProgressSeek
}) {
  const [dragPct, setDragPct] = useState(null); // null = not dragging, else 0–100 preview position

  function handleProgressPointer(e) {
    if (!controlsEnabled) return;
    const bar = e.currentTarget;

    function ratioAt(clientX) {
      const rect = bar.getBoundingClientRect();
      return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    }

    // Move the handle instantly for feedback, but don't trigger speech yet.
    setDragPct(ratioAt(e.clientX) * 100);
    bar.setPointerCapture(e.pointerId);

    function onMove(ev) {
      setDragPct(ratioAt(ev.clientX) * 100);
    }
    function onUp(ev) {
      const finalRatio = ratioAt(ev.clientX);
      bar.removeEventListener('pointermove', onMove);
      bar.removeEventListener('pointerup', onUp);
      setDragPct(null);
      onProgressSeek?.(finalRatio); // commit the seek only once, on release
    }
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerup', onUp, { once: true });
  }

  const displayPct = dragPct !== null ? dragPct : progressPct;

  return (
    <div className={`dock${isPlaying && !isPaused ? ' playing' : ''}`}>
      <div className="waveform">
        {Array.from({ length: 8 }).map((_, i) => <span key={i} />)}
      </div>

      <div className="transport">
        <button className="btn-round" title="Previous page" disabled={!controlsEnabled} onClick={onPrevPage}>⏮</button>
        <button className="btn-play" title="Play" disabled={!controlsEnabled} onClick={onPlayPause}>
          {isPlaying && !isPaused ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <button className="btn-round" title="Next page" disabled={!controlsEnabled} onClick={onNextPage}>⏭</button>
        <button
          className="btn-round"
          title="Stop"
          disabled={!controlsEnabled || (!isPlaying && !isPaused)}
          onClick={onStop}
        >
          <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="1.5" /></svg>
        </button>
      </div>

      <div className="dock-meta">
        <div className="titleline">{title}</div>
        <div className="progressbar" onPointerDown={handleProgressPointer}>
          <div className="fill" style={{ width: `${displayPct}%` }} />
          <div className="scrub" style={{ left: `${displayPct}%` }} />
        </div>
      </div>
    </div>
  );
}