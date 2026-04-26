import type { XFDFCommentsState } from '../utils/xfdf';
interface CommentManagerOptions {
    userId: string;
    pagesContainerId: string;
    threadPanelId: string;
    newPopupId: string;
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
export {};
