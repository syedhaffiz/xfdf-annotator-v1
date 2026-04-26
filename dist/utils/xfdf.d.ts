/**
 * XFDF (XML Forms Data Format) serialiser / deserialiser.
 * Standard:  ISO 19444-1 / Adobe XFDF Specification
 * Extension: http://xfdf-annotator.example.com/ext/1.0  (ext:*)
 */
import type { ActivityEntry } from '../types/index';
interface FabricPoint {
    x: number;
    y: number;
}
interface FabricPathCmd extends Array<string | number> {
    0: string;
}
interface FabricSerializedObject {
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
export interface FabricCanvasJSON {
    version?: string;
    objects: FabricSerializedObject[];
}
export interface XFDFPageInput {
    pageIndex: number;
    pageHPts: number;
    canvasJSON: FabricCanvasJSON | null;
}
export interface XFDFCommentMessage {
    id: string | null;
    userId: string | null;
    text: string | null;
    timestamp: number;
}
export interface XFDFCommentData {
    id: string | null;
    pageIndex: number;
    baseX: number;
    baseY: number;
    number: number;
    resolved: boolean;
    messages: XFDFCommentMessage[];
}
export interface XFDFCommentsState {
    counter?: number;
    comments?: XFDFCommentData[];
}
export interface XFDFInput {
    docId: string;
    pages: XFDFPageInput[];
    comments: XFDFCommentsState | null;
    log: ActivityEntry[] | null;
}
export interface ParsedXFDF {
    pages: Array<{
        pageIndex: number;
        canvasJSON: FabricCanvasJSON;
    }>;
    comments: XFDFCommentsState | null;
    log: ActivityEntry[];
}
export declare function toXFDF({ docId, pages, comments, log }: XFDFInput): string;
export declare function fromXFDF(xmlString: string): ParsedXFDF;
export {};
