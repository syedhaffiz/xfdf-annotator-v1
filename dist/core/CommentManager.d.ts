import type { XFDFCommentsState } from '../utils/xfdf';
import type { User } from '../types/index';
interface CommentManagerOptions {
    user: User;
    pagesContainerId: string;
    threadPanelId: string;
    newPopupId: string;
}
export declare class CommentManager {
    private _user;
    private _pagesContainerId;
    private _comments;
    private _pinEls;
    private _counter;
    private _scale;
    private _activeId;
    private _pendingPlacement;
    private _panel;
    private _popup;
    constructor({ user, pagesContainerId, threadPanelId, newPopupId }: CommentManagerOptions);
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
    /**
     * Pick the best human-readable label for a comment author. Persisted
     * `userName` wins; otherwise we fall back to a truncated id so legacy
     * XFDF (saved before userName was added) still renders.
     */
    private _renderUser;
    private _safe;
}
export {};
