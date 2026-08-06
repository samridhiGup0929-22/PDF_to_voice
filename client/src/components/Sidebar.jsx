import { useRef, useState } from 'react';
import './Sidebar.css';

export default function Sidebar({
  fileInfo,
  statusMessage,
  progressMessage,
  onFileSelected,
  onClearFile,
  voices,
  selectedVoiceIndex,
  onVoiceChange,
  rate,
  volume,
  onRateChange,
  onVolumeChange,
  targetLang,
  onLangChange
}) {
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  function pickFile() {
    fileInputRef.current?.click();
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) onFileSelected(e.dataTransfer.files[0]);
  }

  return (
    <>
      {/* Hamburger — visible on mobile only, fixed to top-left */}
      <button
        className="menu-btn mobile-only"
        aria-label="Open menu"
        onClick={() => setMobileOpen(true)}
      >
        <span></span>
      </button>

      {/* Backdrop, shown only while drawer is open */}
      {mobileOpen && <div className="side-backdrop" onClick={() => setMobileOpen(false)} />}

      <aside className={`side${mobileOpen ? ' open' : ''}`}>
        <div className="side-mobile-header mobile-only">
          <span className="eyebrow">Menu</span>
          <button className="side-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}>✕</button>
        </div>

        <div>
          <div className="eyebrow">Load a document</div>
          <div style={{ height: 12 }} />
          <div
            className={`dropzone${dragging ? ' drag' : ''}`}
            onClick={pickFile}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => e.target.files.length && onFileSelected(e.target.files[0])}
            />
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3v13m0-13 4.5 4.5M12 3 7.5 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <p className="title">Drop a PDF, or click to browse</p>
            <p className="sub">From your system — nothing is uploaded anywhere</p>
          </div>

          <div style={{ height: 14 }} />
          <div className={`file-card${fileInfo ? ' show' : ''}`}>
            <div className="ficon">PDF</div>
            <div className="finfo">
              <div className="fname">{fileInfo?.name || '—'}</div>
              <div className="fmeta">{fileInfo?.meta || '—'}</div>
            </div>
            <button className="x" title="Remove" onClick={onClearFile}>✕</button>
          </div>
          <div style={{ height: 10 }} />
          <div className="status-line">{statusMessage}</div>
        </div>

        <div className="divider" />

        <div>
          <div className="eyebrow">Voice settings</div>
          <div style={{ height: 14 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field">
              <label>Voice</label>
              <select value={selectedVoiceIndex} onChange={(e) => onVoiceChange(e.target.value)}>
                {voices.length === 0 && <option>Loading voices…</option>}
                {voices.map((v) => (
                  <option key={v.i} value={v.i}>
                    {v.score >= 3 ? '★ ' : v.score === 2 ? '☆ ' : ''}
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Speed <span className="val">{rate.toFixed(1)}×</span></label>
              <input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={(e) => onRateChange(parseFloat(e.target.value))} />
            </div>
            <div className="field">
              <label>Volume <span className="val">{Math.round(volume * 100)}%</span></label>
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => onVolumeChange(parseFloat(e.target.value))} />
            </div>
          </div>
          <div style={{ height: 12 }} />
          <p className="note">
            ★ = best free quality (Neural/Online/Google/Enhanced voices) — auto-selected by default.
            For the best result, use <b>Microsoft Edge</b> — its Online Neural voices are the most natural free option in-browser.
          </p>
        </div>

        <div className="divider" />

        <div>
          <div className="eyebrow">Translate &amp; listen</div>
          <div style={{ height: 14 }} />
          <div className="field">
            <label>Translate to</label>
            <select value={targetLang} onChange={(e) => onLangChange(e.target.value)}>
              <option value="hindi">Hindi (हिन्दी script)</option>
              <option value="hinglish">Hinglish (Roman script)</option>
            </select>
          </div>
          <div style={{ height: 10 }} />
          <p className="note">
            Switch the "Translated" tab above the page to read and hear this in Hindi or Hinglish.
            Translation runs page-by-page through the backend and is cached, so switching back is instant.
          </p>
        </div>

        <div className="divider" />

        <div>
          <div className="eyebrow">Reading progress</div>
          <div style={{ height: 12 }} />
          <div className="status-line">{progressMessage}</div>
        </div>
      </aside>
    </>
  );
}