import type { IRenderer, PageDimensions } from '../types/index';
interface ImageDims {
    widthPts: number;
    heightPts: number;
}
export declare class ImageRenderer implements IRenderer {
    naturalWidth: number;
    naturalHeight: number;
    url: string | null;
    get pageCount(): number;
    load(imageUrl: string): Promise<{
        width: number;
        height: number;
    }>;
    renderPage(_pageIndex: number, _canvas: HTMLCanvasElement): Promise<PageDimensions>;
    getScale(containerWidth: number, padding?: number): number;
    getBaseViewport(): {
        width: number;
        height: number;
    };
    getPdfDims(): ImageDims;
    destroy(): void;
}
export {};
