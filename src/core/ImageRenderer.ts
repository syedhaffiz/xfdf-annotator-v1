import type { IRenderer, PageDimensions } from '../types/index'

interface ImageDims {
  widthPts: number
  heightPts: number
}

export class ImageRenderer implements IRenderer {
  naturalWidth  = 0
  naturalHeight = 0
  url: string | null = null

  get pageCount(): number { return this.url ? 1 : 0 }

  load(imageUrl: string): Promise<{ width: number; height: number }> {
    this.url = imageUrl
    return new Promise((resolve, reject) => {
      const img      = new Image()
      img.onload  = () => {
        this.naturalWidth  = img.naturalWidth
        this.naturalHeight = img.naturalHeight
        resolve({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.onerror = () => reject(new Error('Failed to load image: ' + imageUrl))
      img.src = imageUrl
    })
  }

  renderPage(_pageIndex: number, _canvas: HTMLCanvasElement): Promise<PageDimensions> {
    return Promise.resolve({ width: this.naturalWidth, height: this.naturalHeight })
  }

  getScale(containerWidth: number, padding = 0.92): number {
    if (!this.naturalWidth) return 1
    return (containerWidth * padding) / this.naturalWidth
  }

  getBaseViewport(): { width: number; height: number } {
    return { width: this.naturalWidth, height: this.naturalHeight }
  }

  getPdfDims(): ImageDims {
    return { widthPts: this.naturalWidth, heightPts: this.naturalHeight }
  }

  destroy(): void {
    this.url           = null
    this.naturalWidth  = 0
    this.naturalHeight = 0
  }
}
