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
export type DocumentType = 'pdf' | 'image';
/** Dimensions of a rendered page in screen pixels. */
export interface PageDimensions {
    width: number;
    height: number;
}
/**
 * Minimal interface expected from both PDFRenderer and ImageRenderer.
 * Both renderers expose the same API so DocumentAnnotator can treat
 * them interchangeably.
 */
export interface IRenderer {
    readonly pageCount: number;
    renderPage(pageIndex: number, canvas: HTMLCanvasElement): Promise<PageDimensions>;
    destroy(): void;
}
/**
 * All available drawing tools.
 * 'select' is a pointer/move tool; all others create new annotations.
 */
export type AnnotationTool = 'select' | 'freehand' | 'line' | 'arrow' | 'rectangle' | 'circle' | 'polygon' | 'text' | 'comment' | 'eraser' | 'image';
/** Whether the canvas is interactive or read-only. */
export type AnnotationMode = 'edit' | 'view';
/**
 * Coordinate rect as it appears in XFDF XML.
 * Origin is bottom-left (PDF coordinate space); Y grows upwards.
 */
export interface XFDFRect {
    left: number;
    bottom: number;
    right: number;
    top: number;
}
/**
 * A single vertex in a polyline or polygon annotation.
 * Stored in PDF coordinate space.
 */
export interface XFDFVertex {
    x: number;
    y: number;
}
/** A standard XFDF annotation entry. */
export interface XFDFAnnotation {
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
/** Per-page data carried inside an XFDF document. */
export interface XFDFPageData {
    /** 0-based page index. */
    index: number;
    /**
     * Lossless Fabric.js JSON snapshot.
     * This is the primary restore path — guarantees pixel-perfect round-trips
     * including images, opacity, and styled text.
     */
    canvasData: string;
}
/** Parsed result of calling `fromXFDF()`. */
export interface XFDFDocument {
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
/** Payload passed to `toXFDF()`. */
export interface XFDFSerialiseInput {
    docId: string;
    pages: XFDFPageData[];
    comments: CommentThread[];
    log: ActivityEntry[];
}
/** A single message inside a comment thread. */
export interface CommentMessage {
    id: string;
    authorId: string;
    text: string;
    createdAt: number;
}
/** A numbered comment pin and its associated thread. */
export interface CommentThread {
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
/** An entry in the real-time activity log sidebar. */
export interface ActivityEntry {
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
/**
 * DOM element ID references that DocumentAnnotator needs.
 * Every key maps 1-to-1 to an `id` attribute in the host HTML.
 */
export interface AnnotatorDOMOptions {
    viewerPanelId?: string;
    pagesContainerId?: string;
    logContainerId?: string;
    emptyStateId?: string;
    loadingId?: string;
    viewportId?: string;
    threadPanelId?: string;
    newCommentPopupId?: string;
}
/** Full constructor options for DocumentAnnotator. */
export interface DocumentAnnotatorOptions extends AnnotatorDOMOptions {
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
/** Callback fired whenever the user draws, erases, or places a comment. */
export type AnnotationEventHandler = (entry: ActivityEntry) => void;
/** Callback fired when a comment pin is placed (mode = 'comment' tool). */
export type CommentPlaceHandler = (pageIndex: number, x: number, y: number, nativeEvent: MouseEvent) => void;
/** Options passed to the AnnotationCanvas constructor. */
export interface AnnotationCanvasOptions {
    userId: string;
    onEvent: AnnotationEventHandler;
    onCommentPlace: CommentPlaceHandler;
}
