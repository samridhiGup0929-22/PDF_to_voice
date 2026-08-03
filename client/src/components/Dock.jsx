import './Dock.css';

export default function Dock({
  title,
  isPlaying,
  isPaused,
  progressPct,
  controlsEnabled,
  seekEnabled,
  onPlayPause,
  onStop,
  onPrevPage,
  onNextPage,
  onSeekBack,
  onSeekFwd
}) {
  return (
    <div className={`dock${isPlaying && !isPaused ? ' playing' : ''}`}>
      <div className="waveform">
        {Array.from({ length: 8 }).map((_, i) => <span key={i} />)}
      </div>

      <div className="transport">
        <button className="btn-round" title="Previous page" disabled={!controlsEnabled} onClick={onPrevPage}>⏮</button>
        <button className="btn-round btn-seek" title="Back a sentence" disabled={!seekEnabled} onClick={onSeekBack}>◀◀</button>
        <button className="btn-play" title="Play" disabled={!controlsEnabled} onClick={onPlayPause}>
          {isPlaying && !isPaused ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <button className="btn-round btn-seek" title="Forward a sentence" disabled={!seekEnabled} onClick={onSeekFwd}>▶▶</button>
        <button className="btn-round" title="Stop" disabled={!controlsEnabled} onClick={onStop}>⏹</button>
        <button className="btn-round" title="Next page" disabled={!controlsEnabled} onClick={onNextPage}>⏭</button>
      </div>

      <div className="dock-meta">
        <div className="titleline">{title}</div>
        <div className="progressbar"><div className="fill" style={{ width: `${progressPct}%` }} /></div>
      </div>
    </div>
  );
}
