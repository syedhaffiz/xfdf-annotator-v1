import { generateUUID, debounce, getDocumentType } from '../utils/utils'
import { toXFDF, fromXFDF } from '../utils/xfdf'
import { PDFRenderer } from './PDFRenderer'
import { ImageRenderer } from './ImageRenderer'
import { AnnotationCanvas } from './AnnotationCanvas'
import { ActivityLog } from './ActivityLog'
import { CommentManager } from './CommentManager'
import type {
  DocumentAnnotatorOptions,
  DocumentType,
  AnnotationTool,
  AnnotationMode,
} from '../types/index'

interface PageBaseDims {
  width:  number
  height: number
}

interface PdfDims {
  widthPts:  number
  heightPts: number
}

type Renderer = PDFRenderer | ImageRenderer

export class DocumentAnnotator {
  readonly userId: string

  private _opts: Required<DocumentAnnotatorOptions>
  private _renderer:        Renderer | null = null
  private _docType:         DocumentType | null = null
  private _docLabel         = ''
  private _baseDims:        PageBaseDims[] = []
  private _currentScale     = 1
  private _blobURL:         string | null = null
  private _mode:            AnnotationMode = 'edit'
  private _activePageIndex  = 0

  private _log:      ActivityLog
  private _canvas:   AnnotationCanvas
  private _comments: CommentManager

  constructor(options: DocumentAnnotatorOptions = {}) {
    this._opts = {
      viewerPanelId:     'viewer-panel',
      pagesContainerId:  'pages-container',
      logContainerId:    'log-entries',
      emptyStateId:      'empty-state',
      loadingId:         'loading-overlay',
      viewportId:        'document-viewport',
      threadPanelId:     'comment-thread-panel',
      newCommentPopupId: 'new-comment-popup',
      displayScale:      1.5,
      userId:            '',
      ...options,
    }

    this.userId = this._opts.userId || generateUUID()

    this._log = new ActivityLog(this._opts.logContainerId)

    this._canvas = new AnnotationCanvas({
      userId:  this.userId,
      onEvent: (ev) => this._log.addEvent(ev),
      onCommentPlace: (pageIndex, bx, by, nativeEvent) => {
        this._comments.startPlacement(pageIndex, bx, by, nativeEvent)
      },
    })

    this._comments = new CommentManager({
      userId:           this.userId,
      pagesContainerId: this._opts.pagesContainerId,
      threadPanelId:    this._opts.threadPanelId,
      newPopupId:       this._opts.newCommentPopupId,
    })

    this._bindResize()
  }

  // ── Public API ────────────────────────────────────────────────────

  async loadFile(file: File): Promise<void> {
    const type = getDocumentType(file.name) ?? getDocumentType(file.type)
    if (!type) throw new Error(`Unsupported file: ${file.name}`)
    if (this._blobURL) URL.revokeObjectURL(this._blobURL)
    this._blobURL = URL.createObjectURL(file)
    await this._load(this._blobURL, type, file.name)
  }

  async loadURL(url: string, type: DocumentType, label = url): Promise<void> {
    await this._load(url, type, label)
  }

  setMode(mode: AnnotationMode): void {
    this._mode = mode
    this._canvas.setMode(mode)
    const pinsInteractive = mode === 'view' || this._canvas.currentTool === 'comment'
    this._comments.setInteractive(pinsInteractive)
    const toolbar = document.getElementById('toolbar-panel')
    if (toolbar) toolbar.classList.toggle('view-mode', mode === 'view')
  }

  getMode(): AnnotationMode { return this._mode }

  setTool(tool: AnnotationTool): void {
    if (this._mode === 'view') return
    this._canvas.setTool(tool)
    this._comments.setInteractive(tool === 'comment')
  }

  setColor(color: string): void       { this._canvas.setColor(color) }
  setStrokeWidth(width: number): void { this._canvas.setStrokeWidth(width) }
  clearLog(): void                    { this._log.clear() }

  insertImage(file: File): void {
    if (this._mode === 'view') return
    this._canvas.insertImage(file, this._activePageIndex)
  }

  save(): string {
    const canvasPages = this._canvas.toJSON()

    const pages = canvasPages.map(({ pageIndex, canvasJSON }) => {
      const dims = this._getPdfDims(pageIndex)
      return { pageIndex, pageHPts: dims.heightPts, canvasJSON }
    })

    return toXFDF({
      docId:    this._docLabel,
      pages,
      comments: this._comments.toJSON(),
      log:      this._log.getEvents(),
    })
  }

  async restore(xfdfString: string): Promise<void> {
    const data = fromXFDF(xfdfString)
    await this._canvas.loadFromData(data.pages ?? [])
    this._log.repopulate(data.log ?? [])
    if (data.comments) {
      this._comments.fromJSON(data.comments, this._currentScale)
    }
  }

  destroy(): void {
    this._canvas.destroy()
    if (this._renderer) this._renderer.destroy()
    if (this._blobURL)  URL.revokeObjectURL(this._blobURL)
    this._comments.clearAll()
  }

  // ── Private: load ─────────────────────────────────────────────────

  private async _load(url: string, type: DocumentType, label: string): Promise<void> {
    this._showLoading(true)
    try {
      this._canvas.destroy()
      if (this._renderer) this._renderer.destroy()
      this._comments.clearAll()
      this._baseDims  = []
      this._docType   = type
      this._docLabel  = label

      const containerW = this._viewerWidth()

      if (type === 'pdf') {
        const pdfRenderer  = new PDFRenderer()
        this._renderer     = pdfRenderer
        const pageCount    = await pdfRenderer.load(url)
        this._currentScale = pdfRenderer.getScale(containerW)
        for (let i = 0; i < pageCount; i++) {
          const vp = pdfRenderer.getBaseViewport(i)
          this._baseDims.push({ width: vp.width, height: vp.height })
        }
      } else {
        const imgRenderer  = new ImageRenderer()
        this._renderer     = imgRenderer
        const dims         = await imgRenderer.load(url)
        this._currentScale = imgRenderer.getScale(containerW)
        this._baseDims.push({ width: dims.width, height: dims.height })
      }

      await this._buildDOM(label)
    } catch (err) {
      this._showLoading(false)
      throw err
    }
  }

  private async _buildDOM(label: string): Promise<void> {
    const pagesEl = document.getElementById(this._opts.pagesContainerId)
    if (!pagesEl) return
    pagesEl.innerHTML = ''

    const multiPage = this._docType === 'pdf' && this._baseDims.length > 1
    const scale     = this._currentScale

    const pdfCanvases: Array<{ pageNum: number; canvasEl: HTMLCanvasElement }> = []
    const frag = document.createDocumentFragment()

    for (let i = 0; i < this._baseDims.length; i++) {
      const { width: bW, height: bH } = this._baseDims[i]
      const physW = Math.round(bW * scale)
      const physH = Math.round(bH * scale)

      const wrapper = this._createPageWrapper(i, physW, physH, multiPage)
      frag.appendChild(wrapper)

      if (this._docType === 'pdf') {
        const pdfLayer = wrapper.querySelector('.pdf-layer') as HTMLCanvasElement | null
        if (pdfLayer) pdfCanvases.push({ pageNum: i + 1, canvasEl: pdfLayer })
      }

      const annotEl = wrapper.querySelector('.annotation-layer') as HTMLCanvasElement | null
      if (annotEl) this._canvas.createCanvas(annotEl, bW, bH, i, scale)

      wrapper.querySelector('.page-layers')?.addEventListener(
        'mousedown', () => { this._activePageIndex = i }, true
      )
    }

    pagesEl.appendChild(frag)

    if (pdfCanvases.length > 0 && this._renderer instanceof PDFRenderer) {
      await this._renderer.renderPage(pdfCanvases[0].pageNum - 1, pdfCanvases[0].canvasEl, scale)

      this._showLoading(false)
      this._showEmpty(false)
      this._showViewport(true)

      if (pdfCanvases.length > 1) {
        Promise.all(
          pdfCanvases.slice(1).map(({ pageNum, canvasEl }) =>
            (this._renderer as PDFRenderer).renderPage(pageNum - 1, canvasEl, scale)
          )
        ).catch(console.error)
      }
    } else {
      this._showLoading(false)
      this._showEmpty(false)
      this._showViewport(true)
    }

    this._canvas.setMode(this._mode)
    this._comments.repositionAll(scale)

    const filename = label.split(/[/\\]/).pop()?.replace(/\?.*$/, '') ?? label
    const titleEl  = document.getElementById('doc-title')
    if (titleEl) titleEl.textContent = filename

    const metaEl = document.getElementById('doc-meta')
    if (metaEl) {
      metaEl.textContent = this._docType === 'pdf'
        ? `${this._baseDims.length} page${this._baseDims.length !== 1 ? 's' : ''} · XFDF`
        : `${this._baseDims[0].width} × ${this._baseDims[0].height} px · XFDF`
    }

    const saveBtn = document.getElementById('btn-save') as HTMLButtonElement | null
    if (saveBtn) saveBtn.disabled = false
  }

  private _createPageWrapper(
    pageIndex: number,
    physW:     number,
    physH:     number,
    showLabel: boolean
  ): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'page-wrapper'
    wrapper.dataset['pageIndex'] = String(pageIndex)

    if (showLabel) {
      const lbl = document.createElement('div')
      lbl.className   = 'page-number-label'
      lbl.textContent = `Page ${pageIndex + 1}`
      wrapper.appendChild(lbl)
    }

    const layers = document.createElement('div')
    layers.className   = 'page-layers'
    layers.style.cssText = `width:${physW}px;height:${physH}px;overflow:visible;`

    if (this._docType === 'pdf') {
      const pdfCanvas = document.createElement('canvas')
      pdfCanvas.className = 'pdf-layer'
      layers.appendChild(pdfCanvas)
    } else {
      const imgRenderer = this._renderer as ImageRenderer
      const img = document.createElement('img')
      img.className   = 'image-layer'
      img.src         = imgRenderer.url ?? ''
      img.style.cssText = `width:${physW}px;height:${physH}px;`
      img.draggable   = false
      layers.appendChild(img)
    }

    const annotCanvas = document.createElement('canvas')
    annotCanvas.className = 'annotation-layer'
    layers.appendChild(annotCanvas)

    wrapper.appendChild(layers)
    return wrapper
  }

  // ── Private: PDF dims for XFDF ────────────────────────────────────

  private _getPdfDims(pageIndex: number): PdfDims {
    if (this._renderer && typeof (this._renderer as PDFRenderer).getPdfDims === 'function') {
      return (this._renderer as PDFRenderer).getPdfDims(pageIndex)
    }
    const bd = this._baseDims[pageIndex] ?? { width: 612, height: 792 }
    return { widthPts: bd.width, heightPts: bd.height }
  }

  // ── Private: resize ───────────────────────────────────────────────

  private _bindResize(): void {
    const panel = document.getElementById(this._opts.viewerPanelId)
    if (!panel || typeof ResizeObserver === 'undefined') return

    const onResize = debounce(async () => {
      if (!this._renderer || !this._baseDims.length) return
      const containerW = this._viewerWidth()
      const newScale   = this._renderer.getScale(containerW)
      if (Math.abs(newScale - this._currentScale) < 0.01) return
      this._currentScale = newScale

      const pagesEl = document.getElementById(this._opts.pagesContainerId)
      if (!pagesEl) return

      const pdfJobs: Array<{ i: number; canvasEl: HTMLCanvasElement }> = []

      for (let i = 0; i < this._baseDims.length; i++) {
        const { width: bW, height: bH } = this._baseDims[i]
        const physW   = Math.round(bW * newScale)
        const physH   = Math.round(bH * newScale)
        const wrapper = pagesEl.querySelector(`[data-page-index="${i}"]`)
        if (!wrapper) continue

        const layers = wrapper.querySelector('.page-layers') as HTMLElement | null
        if (layers) { layers.style.width = physW + 'px'; layers.style.height = physH + 'px' }

        if (this._docType === 'pdf') {
          const c = wrapper.querySelector('.pdf-layer') as HTMLCanvasElement | null
          if (c) pdfJobs.push({ i, canvasEl: c })
        } else {
          const img = wrapper.querySelector('.image-layer') as HTMLElement | null
          if (img) { img.style.width = physW + 'px'; img.style.height = physH + 'px' }
        }

        this._canvas.resize(i, newScale)
      }

      if (pdfJobs.length && this._renderer instanceof PDFRenderer) {
        await Promise.all(
          pdfJobs.map(({ i, canvasEl }) =>
            (this._renderer as PDFRenderer).renderPage(i, canvasEl, newScale)
          )
        )
      }

      this._comments.repositionAll(newScale)
    }, 250)

    new ResizeObserver(onResize).observe(panel)
  }

  // ── Private: UI helpers ───────────────────────────────────────────

  private _viewerWidth(): number {
    const panel = document.getElementById(this._opts.viewerPanelId)
    return panel ? panel.clientWidth : window.innerWidth
  }

  private _showEmpty(s: boolean): void {
    const el = document.getElementById(this._opts.emptyStateId)
    if (el) el.style.display = s ? 'flex' : 'none'
  }

  private _showViewport(s: boolean): void {
    const el = document.getElementById(this._opts.viewportId)
    if (el) el.style.display = s ? 'flex' : 'none'
  }

  private _showLoading(s: boolean): void {
    const el = document.getElementById(this._opts.loadingId)
    if (el) el.style.display = s ? 'flex' : 'none'
  }
}
