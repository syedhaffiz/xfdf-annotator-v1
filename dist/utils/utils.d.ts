import type { DocumentType } from '../types/index';
export declare function generateUUID(): string;
export declare function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void;
export declare function formatTime(ts: number): string;
export declare function getDocumentType(nameOrMime: string): DocumentType | null;
export declare function toPdfDate(ts: number): string;
export declare function fromPdfDate(str: string): number;
