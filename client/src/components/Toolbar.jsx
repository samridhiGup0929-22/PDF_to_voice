import './Toolbar.css';

export default function Toolbar({
  pageLabel,
  canPrev,
  canNext,
  onPrev,
  onNext,
  mode,
  onModeChange,
  canGoTranslated,
  translateStatus
}) {
  return (
    <>
      <div className="toolbar">
        <div className="pagenav">
          <button disabled={!canPrev} onClick={onPrev}>‹</button>
          <span>{pageLabel}</span>
          <button disabled={!canNext} onClick={onNext}>›</button>
        </div>

        <div className="view-tabs">
          <button className={mode === 'original' ? 'active' : ''} onClick={() => onModeChange('original')}>
            Original PDF
          </button>
          <button
            className={mode === 'translated' ? 'active' : ''}
            disabled={!canGoTranslated}
            onClick={() => onModeChange('translated')}
          >
            Translated
          </button>
        </div>
      </div>
      {translateStatus && <div className="translate-status">{translateStatus}</div>}
    </>
  );
}