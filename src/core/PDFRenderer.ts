import * as pdfjsLib from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy, PageViewport } from 'pdfjs-dist'
import type { IRenderer, PageDimensions } from '../types/index'

// Default to the matching CDN URL so library consumers don't need to configure the worker.
// Consumers can override pdfjsLib.GlobalWorkerOptions.workerSrc before calling PDFRenderer.load().
if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
}

interface PdfDims {
  widthPts: number
  heightPts: number
}

export class PDFRenderer implements IRenderer {
  private _pdf: PDFDocumentProxy | null = null
  private _baseViewports: PageViewport[] = []
  private _pdfPages: PDFPageProxy[] = []
  private _renderTasks: Array<ReturnType<PDFPageProxy['render']> | null> = []
  private _pageCount = 0

  get pageCount(): number { return this._pageCount }

  async load(url: string): Promise<number> {
    const task   = pdfjsLib.getDocument({ url, cMapPacked: true })
    this._pdf    = await task.promise
    this._pageCount = this._pdf.numPages

    this._pdfPages = await Promise.all(
      Array.from({ length: this._pageCount }, (_, i) => this._pdf!.getPage(i + 1))
    )

    this._baseViewports = this._pdfPages.map((p) => p.getViewport({ scale: 1.0 }))

    return this._pageCount
  }

  async renderPage(pageIndex: number, canvasEl: HTMLCanvasElement, displayScale?: number): Promise<PageDimensions> {
    const scale = displayScale ?? 1
    const page  = this._pdfPages[pageIndex]
    if (!page) return { width: 0, height: 0 }

    const dpr = window.devicePixelRatio || 1

    const layoutVP = page.getViewport({ scale })
    const cssW     = Math.round(layoutVP.width)
    const cssH     = Math.round(layoutVP.height)

    canvasEl.width  = Math.round(cssW * dpr)
    canvasEl.height = Math.round(cssH * dpr)
    canvasEl.style.width  = cssW + 'px'
    canvasEl.style.height = cssH + 'px'

    const ctx = canvasEl.getContext('2d')
    if (!ctx) return { width: cssW, height: cssH }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    this._renderTasks[pageIndex]?.cancel()

    const task = page.render({ canvasContext: ctx, viewport: layoutVP })
    this._renderTasks[pageIndex] = task

    try {
      await task.promise
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'RenderingCancelledException') throw e
    }

    return { width: cssW, height: cssH }
  }

  getScale(containerWidth: number, padding = 0.92): number {
    if (!this._baseViewports.length) return 1
    return (containerWidth * padding) / this._baseViewports[0].width
  }

  getBaseViewport(pageIndex: number): PageViewport {
    return this._baseViewports[pageIndex] ?? ({ width: 612, height: 792 } as unknown as PageViewport)
  }

  getPdfDims(pageIndex: number): PdfDims {
    const vp = this._baseViewports[pageIndex]
    if (!vp) return { widthPts: 612, heightPts: 792 }
    return { widthPts: vp.width, heightPts: vp.height }
  }

  destroy(): void {
    this._renderTasks.forEach((t) => t?.cancel())
    if (this._pdf) { void this._pdf.destroy(); this._pdf = null }
    this._baseViewports = []
    this._pdfPages      = []
    this._renderTasks   = []
    this._pageCount     = 0
  }

}
