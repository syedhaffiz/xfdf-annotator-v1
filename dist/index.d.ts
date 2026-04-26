import { Canvas } from 'fabric';
import { PageViewport } from 'pdfjs-dist';

/** An entry in the real-time activity log sidebar. */
export declare interface ActivityEntry {
    id: string;
    /** Human-readable description of the action, e.g. 'Drew rectangle on page 2'. */
    description: string;
    /** 'added' | 'removed' — what happened to the annotation. */
    action: string;
    tool: AnnotationTool | 'eraser' | 'system' | string;
    pageIndex: number;
    /** Unique annotation object identifier. */
    objectId?: string;
    /** User ID of the actor (alias for authorId). */
    userId: string;
    /** @deprecated use userId */
    authorId?: string;
    timestamp: number;
}

export declare class ActivityLog {
    private _container;
    private _events;
    constructor(containerId: string);
    addEvent(eventData: ActivityEntry): void;
    clear(): void;
    repopulate(events: ActivityEntry[]): void;
    getEvents(): ActivityEntry[];
    private _removeEmptyPlaceholder;
    private _prependEntry;
    private _toolLabel;
}

export declare class AnnotationCanvas {
    userId: string;
    onEvent: (entry: ActivityEntry) => void;
    onCommentPlace: (pageIndex: number, x: number, y: number, e: MouseEvent) => void;
    private _pages;
    private _dirtyPages;
    private _jsonCache;
    currentTool: AnnotationTool;
    strokeColor: string;
    strokeWidth: number;
    mode: AnnotationMode;
    constructor({ userId, onEvent, onCommentPlace }: AnnotationCanvasOptions);
    createCanvas(canvasEl: HTMLCanvasElement, baseW: number, baseH: number, pageIndex: number, scale: number): Canvas;
    resize(pageIndex: number, newScale: number): void;
    destroy(): void;
    setTool(tool: AnnotationTool): void;
    setMode(mode: AnnotationMode): void;
    setColor(color: string): void;
    setStrokeWidth(w: number): void;
    insertImage(fileOrUrl: File | string, pageIndex: number): void;
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

/** Options passed to the AnnotationCanvas constructor. */
export declare interface AnnotationCanvasOptions {
    userId: string;
    onEvent: AnnotationEventHandler;
    onCommentPlace: CommentPlaceHandler;
}

/** Callback fired whenever the user draws, erases, or places a comment. */
export declare type AnnotationEventHandler = (entry: ActivityEntry) => void;

/** Whether the canvas is interactive or read-only. */
export declare type AnnotationMode = 'edit' | 'view';

/**
 * All available drawing tools.
 * 'select' is a pointer/move tool; all others create new annotations.
 */
export declare type AnnotationTool = 'select' | 'freehand' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'polygon' | 'text' | 'comment' | 'eraser' | 'image';

/**
 * DOM element ID references that DocumentAnnotator needs.
 * Every key maps 1-to-1 to an `id` attribute in the host HTML.
 */
export declare interface AnnotatorDOMOptions {
    viewerPanelId?: string;
    pagesContainerId?: string;
    logContainerId?: string;
    emptyStateId?: string;
    loadingId?: string;
    viewportId?: string;
    threadPanelId?: string;
    newCommentPopupId?: string;
}

export declare class CommentManager {
    private userId;
    private _pagesContainerId;
    private _comments;
    private _pinEls;
    private _counter;
    private _scale;
    private _activeId;
    private _pendingPlacement;
    private _panel;
    private _popup;
    constructor({ userId, pagesContainerId, threadPanelId, newPopupId }: CommentManagerOptions);
    startPlacement(pageIndex: number, baseX: number, baseY: number, nativeEvent: MouseEvent): void;
    repositionAll(scale: number): void;
    setInteractive(interactive: boolean): void;
    openThread(commentId: string): void;
    closeThread(): void;
    rebuildPins(scale: number): void;
    clearAll(): void;
    toJSON(): XFDFCommentsState;
    fromJSON(data: XFDFCommentsState, scale: number): void;
    private _closeThreadSilent;
    private _createPin;
    private _positionPin;
    private _getPageLayersEl;
    private _renderThread;
    private _repositionOpenPanel;
    private _pinTipClientPos;
    private _positionFloating;
    private _bindPanelEvents;
    private _showPopup;
    private _hidePopup;
    private _bindPopupEvents;
    private _submitComment;
    private _shortId;
    private _safe;
}

declare interface CommentManagerOptions {
    userId: string;
    pagesContainerId: string;
    threadPanelId: string;
    newPopupId: string;
}

/** A single message inside a comment thread. */
export declare interface CommentMessage {
    id: string;
    authorId: string;
    text: string;
    createdAt: number;
}

/** Callback fired when a comment pin is placed (mode = 'comment' tool). */
export declare type CommentPlaceHandler = (pageIndex: number, x: number, y: number, nativeEvent: MouseEvent) => void;

/** A numbered comment pin and its associated thread. */
export declare interface CommentThread {
    id: string;
    /** Sequential number shown on the pin in the canvas. */
    number: number;
    /** Pin position in Fabric/screen coordinates (top-left origin). */
    x: number;
    y: number;
    /** 0-based page index the pin belongs to. */
    pageIndex: number;
    messages: CommentMessage[];
    resolved: boolean;
    createdAt: number;
}

export declare function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void;

export declare class DocumentAnnotator {
    readonly userId: string;
    private _opts;
    private _renderer;
    private _docType;
    private _docLabel;
    private _baseDims;
    private _currentScale;
    private _blobURL;
    private _mode;
    private _activePageIndex;
    private _log;
    private _canvas;
    private _comments;
    constructor(options?: DocumentAnnotatorOptions);
    loadFile(file: File): Promise<void>;
    loadURL(url: string, type: DocumentType_2, label?: string): Promise<void>;
    setMode(mode: AnnotationMode): void;
    getMode(): AnnotationMode;
    setTool(tool: AnnotationTool): void;
    setColor(color: string): void;
    setStrokeWidth(width: number): void;
    clearLog(): void;
    insertImage(file: File): void;
    save(): string;
    restore(xfdfString: string): Promise<void>;
    destroy(): void;
    private _load;
    private _buildDOM;
    private _createPageWrapper;
    private _getPdfDims;
    private _bindResize;
    private _viewerWidth;
    private _showEmpty;
    private _showViewport;
    private _showLoading;
}

/** Full constructor options for DocumentAnnotator. */
export declare interface DocumentAnnotatorOptions extends AnnotatorDOMOptions {
    /**
     * Initial display scale factor applied on top of `devicePixelRatio`.
     * Defaults to 1.5 (a good balance between sharpness and performance).
     */
    displayScale?: number;
    /**
     * User ID shown in the comment author badge and activity log.
     * If omitted, a random session ID is generated.
     */
    userId?: string;
}

/**
 * @file src/types/index.ts
 *
 * Central type definitions for xfdf-annotator.
 *
 * These interfaces form the "contract" between the library's internal
 * modules and its public consumers. Every class, function, and callback
 * should reference these types rather than using inline object shapes.
 */
/** The two document formats the annotator can open. */
declare type DocumentType_2 = 'pdf' | 'image';
export { DocumentType_2 as DocumentType }

declare interface FabricCanvasJSON {
    version?: string;
    objects: FabricSerializedObject[];
}

declare interface FabricPathCmd extends Array<string | number> {
    0: string;
}

declare interface FabricPoint {
    x: number;
    y: number;
}

declare interface FabricSerializedObject {
    tool?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    objectId?: string;
    timestamp?: number;
    path?: FabricPathCmd[];
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    rx?: number;
    ry?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    points?: FabricPoint[];
    text?: string;
    fontSize?: number;
}

export declare function formatTime(ts: number): string;

export declare function fromPdfDate(str: string): number;

export declare function fromXFDF(xmlString: string): ParsedXFDF;

export declare function generateUUID(): string;

export declare function getDocumentType(nameOrMime: string): DocumentType_2 | null;

declare interface ImageDims {
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

/**
 * Minimal interface expected from both PDFRenderer and ImageRenderer.
 * Both renderers expose the same API so DocumentAnnotator can treat
 * them interchangeably.
 */
export declare interface IRenderer {
    readonly pageCount: number;
    renderPage(pageIndex: number, canvas: HTMLCanvasElement): Promise<PageDimensions>;
    destroy(): void;
}

/** Dimensions of a rendered page in screen pixels. */
export declare interface PageDimensions {
    width: number;
    height: number;
}

declare interface ParsedXFDF {
    pages: Array<{
        pageIndex: number;
        canvasJSON: FabricCanvasJSON;
    }>;
    comments: XFDFCommentsState | null;
    log: ActivityEntry[];
}

declare interface PdfDims {
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

export declare function toPdfDate(ts: number): string;

export declare function toXFDF({ docId, pages, comments, log }: XFDFInput): string;

/** A standard XFDF annotation entry. */
export declare interface XFDFAnnotation {
    /** XFDF annotation subtype, e.g. 'ink', 'square', 'circle'. */
    type: string;
    /** Page index (0-based). */
    page: number;
    /** Unique annotation identifier (UUID v4). */
    name: string;
    /** Stroke/fill colour as a CSS hex string, e.g. '#e74c3c'. */
    color: string;
    /** Stroke width in PDF points. */
    width: number;
    /** Bounding rect in PDF coordinate space. */
    rect?: XFDFRect;
    /** Vertices for polyline / polygon annotations. */
    vertices?: XFDFVertex[];
    /** Text content for freetext annotations. */
    content?: string;
    /** ISO-8601 creation timestamp. */
    createdAt?: string;
    /** Author / user ID. */
    author?: string;
}

declare interface XFDFCommentData {
    id: string | null;
    pageIndex: number;
    baseX: number;
    baseY: number;
    number: number;
    resolved: boolean;
    messages: XFDFCommentMessage[];
}

declare interface XFDFCommentMessage {
    id: string | null;
    userId: string | null;
    text: string | null;
    timestamp: number;
}

declare interface XFDFCommentsState {
    counter?: number;
    comments?: XFDFCommentData[];
}

/** Parsed result of calling `fromXFDF()`. */
export declare interface XFDFDocument {
    /** The document filename the XFDF was saved against. */
    docId: string;
    /** Standard annotations extracted from the `<annots>` block. */
    annotations: XFDFAnnotation[];
    /** Per-page Fabric.js snapshots from the `ext:canvas-data` extension. */
    pages: XFDFPageData[];
    /** Comment threads from the `ext:comments` extension. */
    comments: CommentThread[];
    /** Activity log entries from the `ext:log` extension. */
    log: ActivityEntry[];
}

declare interface XFDFInput {
    docId: string;
    pages: XFDFPageInput[];
    comments: XFDFCommentsState | null;
    log: ActivityEntry[] | null;
}

/** Per-page data carried inside an XFDF document. */
export declare interface XFDFPageData {
    /** 0-based page index. */
    index: number;
    /**
     * Lossless Fabric.js JSON snapshot.
     * This is the primary restore path — guarantees pixel-perfect round-trips
     * including images, opacity, and styled text.
     */
    canvasData: string;
}

declare interface XFDFPageInput {
    pageIndex: number;
    pageHPts: number;
    canvasJSON: FabricCanvasJSON | null;
}

/**
 * Coordinate rect as it appears in XFDF XML.
 * Origin is bottom-left (PDF coordinate space); Y grows upwards.
 */
export declare interface XFDFRect {
    left: number;
    bottom: number;
    right: number;
    top: number;
}

/** Payload passed to `toXFDF()`. */
export declare interface XFDFSerialiseInput {
    docId: string;
    pages: XFDFPageData[];
    comments: CommentThread[];
    log: ActivityEntry[];
}

/**
 * A single vertex in a polyline or polygon annotation.
 * Stored in PDF coordinate space.
 */
export declare interface XFDFVertex {
    x: number;
    y: number;
}

export { }
