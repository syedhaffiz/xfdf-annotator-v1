import type { PageViewport } from 'pdfjs-dist';
import type { IRenderer, PageDimensions } from '../types/index';
interface PdfDims {
    widthPts: number;
    heightPts: number;
}
export declare class PDFRenderer implements IRenderer {
    private _pdf;
    private _baseViewports;
    private _pdfPages;
    private _renderTasks;
    private _pageCount;
    get pageCount(): number;
    load(url: string): Promise<number>;
    renderPage(pageIndex: number, canvasEl: HTMLCanvasElement, displayScale?: number): Promise<PageDimensions>;
    getScale(containerWidth: number, padding?: number): number;
    getBaseViewport(pageIndex: number): PageViewport;
    getPdfDims(pageIndex: number): PdfDims;
    destroy(): void;
}
export {};
