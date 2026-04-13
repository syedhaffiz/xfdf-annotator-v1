/**
 * ImageRenderer
 *
 * Loads a raster image and exposes helpers for calculating scale factors,
 * mirroring the PDFRenderer interface so DocumentAnnotator can treat
 * both document types uniformly.
 */
export class ImageRenderer {
  constructor() {
    this.naturalWidth  = 0;
    this.naturalHeight = 0;
    this.url           = null;
  }

  /**
   * Load an image from a URL.
   * @param {string} url
   * @returns {Promise<{ width: number, height: number }>}
   */
  load(url) {
    this.url = url;
    return new Promise((resolve, reject) => {
      const img  = new Image();
      img.onload = () => {
        this.naturalWidth  = img.naturalWidth;
        this.naturalHeight = img.naturalHeight;
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => reject(new Error('Failed to load image: ' + url));
      img.src = url;
    });
  }

  /**
   * Suggested render scale so the image fills containerWidth.
   * @param {number} containerWidth
   * @param {number} [padding=0.92]
   * @returns {number}
   */
  getScale(containerWidth, padding = 0.92) {
    if (!this.naturalWidth) return 1;
    return (containerWidth * padding) / this.naturalWidth;
  }

  /** Base dimensions (natural pixel size at scale 1.0). */
  getBaseViewport() {
    return { width: this.naturalWidth, height: this.naturalHeight };
  }

  /**
   * Image does not have PDF point dimensions; return pixel size as-is.
   * Used by XFDF module to know coordinate space bounds.
   */
  getPdfDims() {
    return { widthPts: this.naturalWidth, heightPts: this.naturalHeight };
  }

  destroy() {
    this.url           = null;
    this.naturalWidth  = 0;
    this.naturalHeight = 0;
  }
}
