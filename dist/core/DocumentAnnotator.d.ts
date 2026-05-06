import { type LineStyle } from './AnnotationCanvas';
import type { DocumentAnnotatorOptions, DocumentType, AnnotationTool, AnnotationMode, User } from '../types/index';
export type { LineStyle } from './AnnotationCanvas';
export declare class DocumentAnnotator {
    /** Identity of the user authoring annotations and comments. */
    readonly user: User;
    /** @deprecated use `user.id`. */
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
    private _historyStack;
    private _historyIndex;
    private _suppressHistory;
    private static readonly HISTORY_MAX;
    constructor(options?: DocumentAnnotatorOptions);
    /** Internal: pick the right User from `options`, falling back as documented. */
    private _resolveUser;
    loadFile(file: File): Promise<void>;
    loadURL(url: string, type: DocumentType, label?: string): Promise<void>;
    setMode(mode: AnnotationMode): void;
    getMode(): AnnotationMode;
    setTool(tool: AnnotationTool): void;
    setColor(color: string): void;
    setStrokeWidth(width: number): void;
    /** Hex fill colour for new fillable shapes. */
    setFillColor(color: string): void;
    /** Fill opacity 0–1 for new fillable shapes (`0` = transparent fill). */
    setFillOpacity(opacity: number): void;
    /** Stroke dash pattern for new strokable shapes (`[]` = solid). */
    setDashArray(arr: number[]): void;
    /**
     * Line rendering style for new shapes/lines/polygons.
     *  - `'solid'` (default) — regular straight stroke, optionally dashed.
     *  - `'arc'`             — cloud-border with outward-bulging arcs.
     */
    setLineStyle(style: LineStyle): void;
    getColor(): string;
    getStrokeWidth(): number;
    getFillColor(): string;
    getFillOpacity(): number;
    getDashArray(): number[];
    getLineStyle(): LineStyle;
    clearLog(): void;
    insertImage(file: File): void;
    save(): string;
    restore(xfdfString: string): Promise<void>;
    /** True if there's an earlier state to revert to. */
    canUndo(): boolean;
    /** True if there's a future state to re-apply. */
    canRedo(): boolean;
    /** Revert the canvas to the previous snapshot. No-op if `canUndo()` is false. */
    undo(): Promise<void>;
    /** Re-apply the next snapshot in the redo branch. No-op if `canRedo()` is false. */
    redo(): Promise<void>;
    /**
     * Reset history with the current state as the new baseline. Called after
     * every load to drop snapshots from the previous document.
     */
    private _resetHistory;
    /** Capture the current document as XFDF and append it to the history stack. */
    private _snapshot;
    /**
     * Push a notification to consumers that the history stack changed.
     * Errors thrown by the listener are caught so they never derail the
     * library's own state machine.
     */
    private _emitChange;
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
