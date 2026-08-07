import { forwardRef, useImperativeHandle, useRef, useEffect, useState} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import './PdfViewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const MIN_TEXT_CHARS_BEFORE_OCR = 10;
const OCR_MIN_WIDTH = 1500;

function multiplyMatrices(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
  ];
}

const PdfViewer = forwardRef(function PdfViewer({ hidden, hasContent, onViewingPageChange, onWordClick, onPageProgress }, ref) {
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef(null);
  const pageWrapEls = useRef([]);
  const rangesByPage = useRef([]);
  const activeRectRef = useRef(null);
  const observerRef = useRef(null);
  const pageRatios = useRef({});
  const ocrWorkerRef = useRef(null);
  // Caches OCR words per page, keyed to the current pdfDoc instance, so
  // zooming in/out (which re-renders every page's canvas at a new size)
  // does NOT re-run Tesseract on already-OCR'd pages — only a NEW file
  // load clears this. Re-running OCR on every zoom click was the real
  // cause of the "pages jumping around" complaint: each zoom click
  // silently kicked off a multi-minute re-OCR of the whole document,
  // and a stale observer (see below) kept firing bogus page-change
  // events while that was happening, LOOKING like pages were reordering.
  const ocrCacheRef = useRef({ doc: null, pages: {} });

  async function getOcrWorker() {
    if (!ocrWorkerRef.current) {
      const worker = await createWorker('eng');
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
      ocrWorkerRef.current = worker;
    }
    return ocrWorkerRef.current;
  }

  async function renderHighResCanvasForOcr(page) {
    const baseViewport = page.getViewport({ scale: 1 });
    const ocrScale = OCR_MIN_WIDTH / baseViewport.width;
    const ocrViewport = page.getViewport({ scale: ocrScale });

    const ocrCanvas = document.createElement('canvas');
    ocrCanvas.width = Math.ceil(ocrViewport.width);
    ocrCanvas.height = Math.ceil(ocrViewport.height);
    const ctx = ocrCanvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: ocrViewport }).promise;

    return { ocrCanvas, ocrViewport };
  }

  useImperativeHandle(ref, () => ({
    async renderAllPages(pdfDoc, zoom = 1) {
      // Disconnect the PREVIOUS observer immediately, before touching
      // the DOM. Previously this happened only at the very end of this
      // function — so during the entire (potentially multi-minute, if
      // OCR is involved) rebuild, the old observer stayed attached to
      // now-detached page elements and kept firing spurious
      // onViewingPageChange calls, making the page indicator/highlight
      // jump around while the new pages were still being built.
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      // Reset the OCR cache only when this is genuinely a new document,
      // not just a zoom change on the same one.
      if (ocrCacheRef.current.doc !== pdfDoc) {
        ocrCacheRef.current = { doc: pdfDoc, pages: {} };
      }

      const container = scrollRef.current;
      container.innerHTML = '';
      pageWrapEls.current = [];
      rangesByPage.current = [];
      pageRatios.current = {};
      const pagesText = [];

      const containerWidth = container.clientWidth || 760;
      const targetWidth = Math.min(760, containerWidth - 40) * zoom;

      for (let p = 1; p <= pdfDoc.numPages; p++) {
        onPageProgress?.(p, pdfDoc.numPages, 'render');

        const page = await pdfDoc.getPage(p);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });

        const wrap = document.createElement('div');
        wrap.className = 'pdf-page';
        wrap.style.width = `${viewport.width}px`;
        wrap.style.height = `${viewport.height}px`;
        wrap.dataset.pageIndex = String(p - 1);

        const canvas = document.createElement('canvas');
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext('2d');
        const renderTransform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
        await page.render({ canvasContext: ctx, viewport, transform: renderTransform }).promise;
        wrap.appendChild(canvas);

        const overlay = document.createElement('div');
        overlay.className = 'text-overlay';
        wrap.appendChild(overlay);

        const pageIdx = p - 1;
        let fullText = '';
        let ranges = [];

        const cached = ocrCacheRef.current.pages[pageIdx];

        if (cached) {
          // This page was already OCR'd on a previous render (e.g.
          // before a zoom change) — reuse the recognized words and just
          // rescale their positions to the current viewport size instead
          // of re-running OCR.
          const mapX = viewport.width / cached.ocrWidth;
          const mapY = viewport.height / cached.ocrHeight;
          cached.words.forEach((w) => {
            const start = fullText.length;
            fullText += w.text + ' ';
            const end = start + w.text.length;

            const rect = document.createElement('div');
            rect.className = 'hl-rect';
            rect.style.left = `${w.x0 * mapX}px`;
            rect.style.top = `${w.y0 * mapY}px`;
            rect.style.width = `${Math.max((w.x1 - w.x0) * mapX, 2)}px`;
            rect.style.height = `${Math.max((w.y1 - w.y0) * mapY, 2)}px`;
            rect.addEventListener('click', () => {
              if (activeRectRef.current) activeRectRef.current.classList.remove('active');
              rect.classList.add('active');
              activeRectRef.current = rect;
              onWordClick?.(pageIdx, start);
            });
            overlay.appendChild(rect);

            ranges.push({ start, end, el: rect });
          });
        } else {
          const textContent = await page.getTextContent();

          const itemInfos = textContent.items.map((item) => {
            const m = multiplyMatrices(viewport.transform, item.transform);
            return { item, m };
          });
          itemInfos.sort((a, b) => {
            const dy = a.m[5] - b.m[5];
            const LINE_TOLERANCE = 4;
            if (Math.abs(dy) > LINE_TOLERANCE) return dy;
            return a.m[4] - b.m[4];
          });

          itemInfos.forEach(({ item, m }) => {
            const str = item.str;
            if (!str || !str.trim()) { fullText += str; return; }
            const start = fullText.length;
            fullText += str + ' ';
            const end = start + str.length;

            const fontHeight = Math.hypot(m[2], m[3]) || 10;
            const left = m[4];
            const top = m[5] - fontHeight * 0.85;
            const width = Math.max((item.width || 0) * viewport.scale, 2);

            const rect = document.createElement('div');
            rect.className = 'hl-rect';
            rect.style.left = `${left}px`;
            rect.style.top = `${top}px`;
            rect.style.width = `${width}px`;
            rect.style.height = `${fontHeight * 1.15}px`;
            rect.addEventListener('click', () => {
              if (activeRectRef.current) {
                activeRectRef.current.classList.remove('active');
              }

              rect.classList.add('active');
              activeRectRef.current = rect;

              onWordClick?.(pageIdx, start);
            }); overlay.appendChild(rect);

            ranges.push({ start, end, el: rect });
          });

          // --- OCR fallback for scanned / handwritten pages ---
          if (fullText.trim().length < MIN_TEXT_CHARS_BEFORE_OCR) {
            overlay.innerHTML = '';
            fullText = '';
            ranges = [];

            onPageProgress?.(p, pdfDoc.numPages, 'ocr');
            try {
              const worker = await getOcrWorker();
              const { ocrCanvas, ocrViewport } = await renderHighResCanvasForOcr(page);
              const { data } = await worker.recognize(ocrCanvas);
              const words = (data.words || []).filter((w) => w.text && w.text.trim());

              const mapX = viewport.width / ocrViewport.width;
              const mapY = viewport.height / ocrViewport.height;

              const cacheWords = [];
              words.forEach((w) => {
                const str = w.text;
                const start = fullText.length;
                fullText += str + ' ';
                const end = start + str.length;

                const left = w.bbox.x0 * mapX;
                const top = w.bbox.y0 * mapY;
                const width = Math.max((w.bbox.x1 - w.bbox.x0) * mapX, 2);
                const height = Math.max((w.bbox.y1 - w.bbox.y0) * mapY, 2);

                const rect = document.createElement('div');
                rect.className = 'hl-rect';
                rect.style.left = `${left}px`;
                rect.style.top = `${top}px`;
                rect.style.width = `${width}px`;
                rect.style.height = `${height}px`;
                rect.addEventListener('click', () => {
                  if (activeRectRef.current) {
                    activeRectRef.current.classList.remove('active');
                  }

                  rect.classList.add('active');
                  activeRectRef.current = rect;

                  onWordClick?.(pageIdx, start);
                });
                overlay.appendChild(rect);

                ranges.push({ start, end, el: rect });
                cacheWords.push({ text: str, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 });
              });

              // Cache in OCR-canvas pixel space + the OCR canvas's own
              // width/height, so future zoom re-renders can rescale
              // correctly regardless of what zoom level triggered them.
              ocrCacheRef.current.pages[pageIdx] = {
                words: cacheWords,
                ocrWidth: ocrViewport.width,
                ocrHeight: ocrViewport.height
              };
            } catch (err) {
              console.error(`OCR failed on page ${p}:`, err);
            }
          }
        }

        pagesText.push(fullText.trim());
        rangesByPage.current.push(ranges);
        pageWrapEls.current.push(wrap);
        container.appendChild(wrap);
      }

      const scrollParent = container.parentElement;
      if (scrollParent) scrollParent.scrollTop = 0;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            const idx = parseInt(en.target.dataset.pageIndex, 10);
            pageRatios.current[idx] = en.isIntersecting ? en.intersectionRatio : 0;
          });

          let best = null;
          Object.keys(pageRatios.current).forEach((key) => {
            const idx = parseInt(key, 10);
            const ratio = pageRatios.current[key];
            if (ratio <= 0.5) return;
            if (
              !best ||
              ratio > best.ratio ||
              (ratio === best.ratio && idx < best.idx)
            ) {
              best = { idx, ratio };
            }
          });
          if (best) onViewingPageChange?.(best.idx);
        },
        { root: container.parentElement, threshold: 0.5 }
      );
      pageWrapEls.current.forEach((w) => observerRef.current.observe(w));

      return {
        pageCount: pdfDoc.numPages,
        pagesText,
        ranges: rangesByPage.current.map((r) => r.map(({ start, end }) => ({ start, end })))
      };
    },

    scrollToPage(idx) {
      pageWrapEls.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    highlightIndex(pageIdx, idx) {
      const ranges = rangesByPage.current[pageIdx];
      if (!ranges || !ranges[idx]) return;
      if (activeRectRef.current) activeRectRef.current.classList.remove('active');
      const rect = ranges[idx].el;
      rect.classList.add('active');
      rect.scrollIntoView({ block: 'center', behavior: 'smooth' });
      activeRectRef.current = rect;
    },

    clearHighlight() {
      if (activeRectRef.current) {
        activeRectRef.current.classList.remove('active');
        activeRectRef.current = null;
      }
    },

    clear() {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (scrollRef.current) scrollRef.current.innerHTML = '';
      pageWrapEls.current = [];
      rangesByPage.current = [];
      activeRectRef.current = null;
      pageRatios.current = {};
      ocrCacheRef.current = { doc: null, pages: {} };
    }
  }));

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      if (ocrWorkerRef.current) {
        ocrWorkerRef.current.terminate();
        ocrWorkerRef.current = null;
      }
    };
  }, []);

  return (
    <div className={`paper-wrap${hidden ? ' hidden' : ''}`}>
      {!hasContent && (
        <div className="empty">
          <h2>Nothing to read yet</h2>
          <div
            className={`dropzone${dragging ? ' drag' : ''}`}
            style={{ maxWidth: 420, margin: '18px auto 0' }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) onFileSelected?.(e.dataTransfer.files[0]);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => e.target.files.length && onFileSelected?.(e.target.files[0])}
            />
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 3v13m0-13 4.5 4.5M12 3 7.5 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <p className="title">Drop a PDF, or tap to browse</p>
            <p className="sub">From your device — nothing is uploaded anywhere</p>
          </div>
        </div>
      )}
      <div className="pdf-scroll" ref={scrollRef} />
    </div>
  );
});

export default PdfViewer;
