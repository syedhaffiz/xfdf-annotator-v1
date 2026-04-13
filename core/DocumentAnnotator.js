import { generateUUID, debounce, getDocumentType } from '../utils/utils.js';
import { toXFDF, fromXFDF }    from '../utils/xfdf.js';
import { PDFRenderer }          from './PDFRenderer.js';
import { ImageRenderer }        from './ImageRenderer.js';
import { AnnotationCanvas }     from './AnnotationCanvas.js';
import { ActivityLog }          from './ActivityLog.js';
import { CommentManager }       from './CommentManager.js';

/**
 * DocumentAnnotator — top-level orchestrator.
 *
 * Owns: PDFRenderer|ImageRenderer, AnnotationCanvas, ActivityLog, CommentManager.
 * Builds and tears down the page-layer DOM.
 * Handles responsive resize, view/edit modes, XFDF import/export.
 *
 * Save format: XFDF (ISO 19444-1 / Adobe standard) with ext:* extensions for
 * lossless Fabric.js round-trips and Figma-style comment threads.
 */
export class DocumentAnnotator {
  /**
   * @param {{
   *   viewerPanelId:      string,
   *   pagesContainerId:   string,
   *   logContainerId:     string,
   *   emptyStateId?:      string,
   *   loadingId?:         string,
   *   viewportId?:        string,
   *   threadPanelId?:     string,
   *   newCommentPopupId?: string,
   * }} options
   */
  constructor(options = {}) {
    this._opts = {
      viewerPanelId:      'viewer-panel',
      pagesContainerId:   'pages-container',
      logContainerId:     'log-entries',
      emptyStateId:       'empty-state',
      loadingId:          'loading-overlay',
      viewportId:         'document-viewport',
      threadPanelId:      'comment-thread-panel',
      newCommentPopupId:  'new-comment-popup',
      ...options,
    };

    this.userId           = generateUUID();
    this._renderer        = null;
    this._docType         = null;
    this._docLabel        = '';      // filename for XFDF <f href>
    this._baseDims        = [];      // { width, height } in base (pt/px) per page
    this._currentScale    = 1;
    this._blobURL         = null;
    this._mode            = 'edit';
    this._activePageIndex = 0;

    this._log = new ActivityLog(this._opts.logContainerId);

    this._canvas = new AnnotationCanvas({
      userId:        this.userId,
      onEvent:       (ev) => this._log.addEvent(ev),
      onCommentPlace: (pageIndex, bx, by, nativeEvent) => {
        this._comments.startPlacement(pageIndex, bx, by, nativeEvent);
      },
    });

    this._comments = new CommentManager({
      userId:           this.userId,
      pagesContainerId: this._opts.pagesContainerId,
      threadPanelId:    this._opts.threadPanelId,
      newPopupId:       this._opts.newCommentPopupId,
    });

    this._bindResize();
  }

  // ── Public API ────────────────────────────────────────────────────

  async loadFile(file) {
    const type = getDocumentType(file.name) || getDocumentType(file.type);
    if (!type) throw new Error(`Unsupported file: ${file.name}`);
    if (this._blobURL) URL.revokeObjectURL(this._blobURL);
    this._blobURL = URL.createObjectURL(file);
    await this._load(this._blobURL, type, file.name);
  }

  async loadURL(url, type, label = url) {
    await this._load(url, type, label);
  }

  // ── Mode ──────────────────────────────────────────────────────────

  setMode(mode) {
    this._mode = mode;
    this._canvas.setMode(mode);

    const pinsInteractive = (mode === 'view') || (this._canvas.currentTool === 'comment');
    this._comments.setInteractive(pinsInteractive);

    const toolbar = document.getElementById('toolbar-panel');
    if (toolbar) toolbar.classList.toggle('view-mode', mode === 'view');
  }

  getMode() { return this._mode; }

  // ── Tool / style ──────────────────────────────────────────────────

  setTool(tool) {
    if (this._mode === 'view') return;
    this._canvas.setTool(tool);
    this._comments.setInteractive(tool === 'comment');
  }

  setColor(color)       { this._canvas.setColor(color); }
  setStrokeWidth(width) { this._canvas.setStrokeWidth(width); }
  clearLog()            { this._log.clear(); }

  insertImage(file) {
    if (this._mode === 'view') return;
    this._canvas.insertImage(file, this._activePageIndex);
  }

  // ── Save (XFDF) ───────────────────────────────────────────────────

  /**
   * Export all annotations as an XFDF XML string.
   * @returns {string}
   */
  save() {
    const canvasPages = this._canvas.toJSON();   // [{pageIndex, canvasJSON}]

    // Attach page height in pts for XFDF y-flip conversion
    const pages = canvasPages.map(({ pageIndex, canvasJSON }) => {
      const dims = this._getPdfDims(pageIndex);
      return { pageIndex, pageHPts: dims.heightPts, canvasJSON };
    });

    return toXFDF({
      docId:    this._docLabel,
      pages,
      comments: this._comments.toJSON(),
      log:      this._log.getEvents(),
    });
  }

  // ── Restore (XFDF) ────────────────────────────────────────────────

  /**
   * Import annotations from an XFDF XML string.
   * A document must already be loaded before calling restore().
   * @param {string} xfdfString
   */
  async restore(xfdfString) {
    const data = fromXFDF(xfdfString);

    await this._canvas.loadFromData(data.pages || []);
    this._log.repopulate(data.log || []);

    if (data.comments) {
      this._comments.fromJSON(data.comments, this._currentScale);
    }
  }

  destroy() {
    this._canvas.destroy();
    if (this._renderer) this._renderer.destroy();
    if (this._blobURL)  URL.revokeObjectURL(this._blobURL);
    this._comments.clearAll();
  }

  // ── Private: load ─────────────────────────────────────────────────

  async _load(url, type, label) {
    this._showLoading(true);
    try {
      this._canvas.destroy();
      if (this._renderer) this._renderer.destroy();
      this._comments.clearAll();
      this._baseDims  = [];
      this._docType   = type;
      this._docLabel  = label;

      const containerW = this._viewerWidth();

      if (type === 'pdf') {
        this._renderer = new PDFRenderer();
        // load() fetches all page objects in parallel internally
        const pageCount    = await this._renderer.load(url);
        this._currentScale = this._renderer.getScale(containerW);
        // getBaseViewport is synchronous — plain loop is fine
        for (let i = 0; i < pageCount; i++) {
          const vp = this._renderer.getBaseViewport(i);
          this._baseDims.push({ width: vp.width, height: vp.height });
        }
      } else {
        this._renderer = new ImageRenderer();
        const dims         = await this._renderer.load(url);
        this._currentScale = this._renderer.getScale(containerW);
        this._baseDims.push({ width: dims.width, height: dims.height });
      }

      // _buildDOM hides the loading overlay itself after the first page renders
      await this._buildDOM(label);
    } catch (err) {
      this._showLoading(false);
      throw err;
    }
  }

  async _buildDOM(label) {
    const pagesEl   = document.getElementById(this._opts.pagesContainerId);
    pagesEl.innerHTML = '';

    const multiPage  = (this._docType === 'pdf' && this._baseDims.length > 1);
    const scale      = this._currentScale;

    // ── Phase 1: Build all DOM wrappers synchronously (no awaits, instant) ──
    // All layout math and DOM creation happens in one synchronous pass.
    // The browser paints skeletons immediately; PDF pixels fill in after.
    const pdfCanvases = [];   // [{ pageNum, canvasEl }] collected for batch render
    const frag        = document.createDocumentFragment();

    for (let i = 0; i < this._baseDims.length; i++) {
      const { width: bW, height: bH } = this._baseDims[i];
      const physW = Math.round(bW * scale);
      const physH = Math.round(bH * scale);

      const wrapper = this._createPageWrapper(i, physW, physH, multiPage);
      frag.appendChild(wrapper);

      if (this._docType === 'pdf') {
        pdfCanvases.push({ pageNum: i + 1, canvasEl: wrapper.querySelector('.pdf-layer') });
      }

      const annotEl = wrapper.querySelector('.annotation-layer');
      this._canvas.createCanvas(annotEl, bW, bH, i, scale);

      wrapper.querySelector('.page-layers')
        .addEventListener('mousedown', () => { this._activePageIndex = i; }, true);
    }

    // Single reflow: append all pages at once via DocumentFragment
    pagesEl.appendChild(frag);

    // ── Phase 2: Progressive PDF rendering ──────────────────────────────────
    // Render page 1 first → user sees content immediately (loading overlay gone).
    // Remaining pages render in parallel in the background.
    if (pdfCanvases.length > 0) {
      await this._renderer.renderPage(
        pdfCanvases[0].pageNum, pdfCanvases[0].canvasEl, scale
      );

      // Remove loading overlay as soon as page 1 is visible
      this._showLoading(false);
      this._showEmpty(false);
      this._showViewport(true);

      // Pages 2..N in parallel — non-blocking for the user
      if (pdfCanvases.length > 1) {
        Promise.all(
          pdfCanvases.slice(1).map(({ pageNum, canvasEl }) =>
            this._renderer.renderPage(pageNum, canvasEl, scale)
          )
        ).catch(console.error);
      }
    } else {
      // Image path — already loaded, just show
      this._showLoading(false);
      this._showEmpty(false);
      this._showViewport(true);
    }

    this._canvas.setMode(this._mode);
    this._comments.repositionAll(scale);

    const filename = label.split(/[\\/]/).pop().replace(/\?.*$/, '');
    const titleEl  = document.getElementById('doc-title');
    if (titleEl) titleEl.textContent = filename;

    const metaEl = document.getElementById('doc-meta');
    if (metaEl) {
      metaEl.textContent = this._docType === 'pdf'
        ? `${this._baseDims.length} page${this._baseDims.length !== 1 ? 's' : ''} · XFDF`
        : `${this._baseDims[0].width} × ${this._baseDims[0].height} px · XFDF`;
    }

    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.disabled = false;
  }

  _createPageWrapper(pageIndex, physW, physH, showLabel) {
    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.dataset.pageIndex = pageIndex;

    if (showLabel) {
      const lbl = document.createElement('div');
      lbl.className   = 'page-number-label';
      lbl.textContent = `Page ${pageIndex + 1}`;
      wrapper.appendChild(lbl);
    }

    const layers = document.createElement('div');
    layers.className    = 'page-layers';
    layers.style.cssText = `width:${physW}px;height:${physH}px;overflow:visible;`;

    if (this._docType === 'pdf') {
      const pdfCanvas = document.createElement('canvas');
      pdfCanvas.className = 'pdf-layer';
      layers.appendChild(pdfCanvas);
    } else {
      const img = document.createElement('img');
      img.className     = 'image-layer';
      img.src           = this._renderer.url;
      img.style.cssText = `width:${physW}px;height:${physH}px;`;
      img.draggable     = false;
      layers.appendChild(img);
    }

    const annotCanvas = document.createElement('canvas');
    annotCanvas.className = 'annotation-layer';
    layers.appendChild(annotCanvas);

    wrapper.appendChild(layers);
    return wrapper;
  }

  // ── Private: PDF dims for XFDF conversion ─────────────────────────

  _getPdfDims(pageIndex) {
    if (this._renderer && typeof this._renderer.getPdfDims === 'function') {
      return this._renderer.getPdfDims(pageIndex);
    }
    // Fallback: use baseDims (they equal pts for PDFs, px for images)
    const bd = this._baseDims[pageIndex] || { width: 612, height: 792 };
    return { widthPts: bd.width, heightPts: bd.height };
  }

  // ── Private: resize ───────────────────────────────────────────────

  _bindResize() {
    const panel = document.getElementById(this._opts.viewerPanelId);
    if (!panel || typeof ResizeObserver === 'undefined') return;

    const onResize = debounce(async () => {
      if (!this._renderer || !this._baseDims.length) return;
      const containerW = this._viewerWidth();
      const newScale   = this._renderer.getScale(containerW);
      if (Math.abs(newScale - this._currentScale) < 0.01) return;
      this._currentScale = newScale;

      const pagesEl = document.getElementById(this._opts.pagesContainerId);

      // ── Phase 1: Update DOM sizes synchronously (instant, no paints blocked) ──
      const pdfRenderJobs = [];

      for (let i = 0; i < this._baseDims.length; i++) {
        const { width: bW, height: bH } = this._baseDims[i];
        const physW   = Math.round(bW * newScale);
        const physH   = Math.round(bH * newScale);
        const wrapper = pagesEl.querySelector(`[data-page-index="${i}"]`);
        if (!wrapper) continue;

        const layers = wrapper.querySelector('.page-layers');
        layers.style.width  = physW + 'px';
        layers.style.height = physH + 'px';

        if (this._docType === 'pdf') {
          pdfRenderJobs.push({ i, canvasEl: wrapper.querySelector('.pdf-layer') });
        } else {
          const img = wrapper.querySelector('.image-layer');
          if (img) { img.style.width = physW + 'px'; img.style.height = physH + 'px'; }
        }

        // Fabric resize is synchronous
        this._canvas.resize(i, newScale);
      }

      // ── Phase 2: Re-render all PDF pages in parallel ──────────────────────
      // PDFRenderer cancels stale render tasks automatically, so rapid resizes
      // don't pile up — only the latest scale wins.
      if (pdfRenderJobs.length) {
        await Promise.all(
          pdfRenderJobs.map(({ i, canvasEl }) =>
            this._renderer.renderPage(i + 1, canvasEl, newScale)
          )
        );
      }

      this._comments.repositionAll(newScale);
    }, 250);

    new ResizeObserver(onResize).observe(panel);
  }

  // ── Private: UI helpers ───────────────────────────────────────────

  _viewerWidth() {
    const panel = document.getElementById(this._opts.viewerPanelId);
    return panel ? panel.clientWidth : window.innerWidth;
  }

  _showEmpty(s)    { const el = document.getElementById(this._opts.emptyStateId);  if (el) el.style.display = s ? 'flex' : 'none'; }
  _showViewport(s) { const el = document.getElementById(this._opts.viewportId);    if (el) el.style.display = s ? 'flex' : 'none'; }
  _showLoading(s)  { const el = document.getElementById(this._opts.loadingId);     if (el) el.style.display = s ? 'flex' : 'none'; }
}
