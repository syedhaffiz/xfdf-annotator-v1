/**
 * PDFRenderer — HiDPI-aware PDF.js wrapper.
 *
 * Renders at  displayScale × devicePixelRatio  for sharp output on retina
 * screens, then sets canvas CSS size to  displayScale  so the element
 * takes the correct layout space.
 *
 * Performance notes
 * ─────────────────
 * • All page objects are fetched in parallel (Promise.all) — O(1) vs O(n).
 * • getViewport() is called once per render (layout + render share the same
 *   base, only the scale factor differs).
 * • Rendering tasks are cancellable; a stale resize won't corrupt a new one.
 */
export class PDFRenderer {
  constructor() {
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    this._pdf           = null;
    this._baseViewports = [];   // viewport at scale=1.0 per page (immutable after load)
    this._pdfPages      = [];   // raw PDF page objects (cached)
    this._renderTasks   = [];   // active render tasks (for cancellation)
    this.pageCount      = 0;
  }

  /**
   * Load a PDF from a URL or Blob URL.
   * All page objects are fetched in parallel — O(1) regardless of page count.
   * @param {string} url
   * @returns {Promise<number>} total page count
   */
  async load(url) {
    const task     = pdfjsLib.getDocument({ url, cMapPacked: true });
    this._pdf      = await task.promise;
    this.pageCount = this._pdf.numPages;

    // Fetch all page objects simultaneously — previously sequential, now O(1)
    this._pdfPages = await Promise.all(
      Array.from({ length: this.pageCount }, (_, i) => this._pdf.getPage(i + 1))
    );

    // getViewport is synchronous — safe to do in a plain map
    this._baseViewports = this._pdfPages.map((p) => p.getViewport({ scale: 1.0 }));

    return this.pageCount;
  }

  /**
   * Render a page onto a <canvas> element at HiDPI resolution.
   *
   * The canvas bitmap is rendered at  displayScale × dpr  for crispness.
   * The CSS size is set to  displayScale  so the element occupies correct space.
   *
   * @param {number}            pageNum       1-based
   * @param {HTMLCanvasElement} canvasEl
   * @param {number}            displayScale
   * @returns {Promise<{ width: number, height: number }>} CSS (layout) px dims
   */
  async renderPage(pageNum, canvasEl, displayScale) {
    const page = this._pdfPages[pageNum - 1];
    if (!page) return { width: 0, height: 0 };

    const dpr = window.devicePixelRatio || 1;

    // Single viewport call — derive render dims by scaling CSS dims
    const layoutVP = page.getViewport({ scale: displayScale });
    const cssW     = Math.round(layoutVP.width);
    const cssH     = Math.round(layoutVP.height);

    canvasEl.width  = Math.round(cssW * dpr);
    canvasEl.height = Math.round(cssH * dpr);
    canvasEl.style.width  = cssW + 'px';
    canvasEl.style.height = cssH + 'px';

    const ctx = canvasEl.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // scale once, reuse same viewport

    // Cancel any previous task on this canvas slot to avoid stale renders
    const slotKey = pageNum - 1;
    this._renderTasks[slotKey]?.cancel();

    const task = page.render({ canvasContext: ctx, viewport: layoutVP });
    this._renderTasks[slotKey] = task;

    try {
      await task.promise;
    } catch (e) {
      if (e?.name !== 'RenderingCancelledException') throw e;
      // Cancelled by a newer resize — silently ignore
    }

    return { width: cssW, height: cssH };
  }

  /**
   * Suggested display scale so the first page fills containerWidth.
   * @param {number} containerWidth
   * @param {number} [padding=0.92]
   * @returns {number}
   */
  getScale(containerWidth, padding = 0.92) {
    if (!this._baseViewports.length) return 1;
    return (containerWidth * padding) / this._baseViewports[0].width;
  }

  /**
   * Base viewport (scale=1.0) for a given page index.
   * @param {number} pageIndex 0-based
   */
  getBaseViewport(pageIndex) {
    return this._baseViewports[pageIndex] || { width: 612, height: 792 };
  }

  /**
   * Page dimensions in PDF user-space points.
   * Used by the XFDF serialiser for y-axis flipping.
   * @param {number} pageIndex 0-based
   */
  getPdfDims(pageIndex) {
    const vp = this._baseViewports[pageIndex];
    if (!vp) return { widthPts: 612, heightPts: 792 };
    return { widthPts: vp.width, heightPts: vp.height };
  }

  destroy() {
    this._renderTasks.forEach((t) => t?.cancel());
    if (this._pdf) { this._pdf.destroy(); this._pdf = null; }
    this._baseViewports = [];
    this._pdfPages      = [];
    this._renderTasks   = [];
    this.pageCount      = 0;
  }
}
