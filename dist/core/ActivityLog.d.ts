import type { ActivityEntry } from '../types/index';
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
