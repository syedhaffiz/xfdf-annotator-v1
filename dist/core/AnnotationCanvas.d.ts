import { Canvas } from 'fabric';
import type { FabricCanvasJSON } from '../utils/xfdf';
import type { AnnotationCanvasOptions, AnnotationTool, AnnotationMode, ActivityEntry, User } from '../types/index';
/**
 * Special line styles — non-dash rendering modes.
 * `'arc'` produces a "revision cloud" border whose perimeter is a chain of
 * outward-facing arcs. Anything else falls back to a regular straight stroke
 * (optionally with a dash pattern).
 */
export type LineStyle = 'solid' | 'arc';
export declare class AnnotationCanvas {
    user: User;
    onEvent: (entry: ActivityEntry) => void;
    onCommentPlace: (pageIndex: number, x: number, y: number, e: MouseEvent) => void;
    /** @deprecated read `user.id` instead. */
    get userId(): string;
    private _pages;
    private _dirtyPages;
    private _jsonCache;
    currentTool: AnnotationTool;
    strokeColor: string;
    strokeWidth: number;
    mode: AnnotationMode;
    /** Hex fill colour applied to newly-drawn fillable shapes. */
    fillColor: string;
    /** Fill opacity 0–1. 0 (default) means "no fill" — stroke only. */
    fillOpacity: number;
    /** strokeDashArray applied to new strokable shapes ([] = solid). */
    dashArray: number[];
    /** Special non-dash rendering style. `'arc'` triggers cloud-border substitution. */
    lineStyle: LineStyle;
    constructor({ user, onEvent, onCommentPlace }: AnnotationCanvasOptions);
    createCanvas(canvasEl: HTMLCanvasElement, baseW: number, baseH: number, pageIndex: number, scale: number): Canvas;
    resize(pageIndex: number, newScale: number): void;
    destroy(): void;
    setTool(tool: AnnotationTool): void;
    setMode(mode: AnnotationMode): void;
    setColor(color: string): void;
    setStrokeWidth(w: number): void;
    /** Hex fill colour for new fillable shapes (rect, ellipse, polygon, …). */
    setFillColor(color: string): void;
    /**
     * Fill opacity 0–1 for new fillable shapes. `0` (default) is treated as
     * "no fill" — the resulting Fabric object gets `fill: 'transparent'`.
     */
    setFillOpacity(opacity: number): void;
    /** Stroke dash pattern for new strokable shapes. `[]` (or omitted) = solid. */
    setDashArray(arr: number[]): void;
    /**
     * Line rendering style for new shapes/lines/polygons.
     *  - `'solid'` (default) — regular straight stroke, optionally dashed.
     *  - `'arc'`             — cloud-border: perimeter is a chain of arcs.
     */
    setLineStyle(style: LineStyle): void;
    /** Compute the CSS fill string from fillColor + fillOpacity. */
    private _computeFill;
    /** strokeDashArray value for new objects — null when solid. */
    private _activeDash;
    private readonly FILL_EXEMPT;
    /** Apply the current fill to any selected fillable shape on any page. */
    private _applyFillToSelection;
    insertImage(fileOrUrl: File | string, pageIndex: number): void;
    insertImageAt(fileOrUrl: File | string, pageIndex: number, x: number, y: number): void;
    private _placeImage;
    toJSON(): Array<{
        pageIndex: number;
        canvasJSON: FabricCanvasJSON | null;
    }>;
    loadFromData(pagesData: Array<{
        pageIndex: number;
        canvasJSON: FabricCanvasJSON;
    }>): Promise<void>;
    private _applyToolTo;
    private _applyModeTo;
    private _setupEvents;
    private _eraseAt;
    private _makeShapePreview;
    private _updateShapePreview;
    private _makeFinalShape;
    private _makeArrow;
    private _isValidShape;
    private _polygonClick;
    private _hintPolygonClose;
    private _finalizePolygon;
    private _cancelPolygon;
    private _placeText;
    private _attachMeta;
    private _markDirty;
    private _fireEvent;
}
