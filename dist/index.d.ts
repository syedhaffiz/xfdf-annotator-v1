export { DocumentAnnotator } from './core/DocumentAnnotator';
export { AnnotationCanvas } from './core/AnnotationCanvas';
export { PDFRenderer } from './core/PDFRenderer';
export { ImageRenderer } from './core/ImageRenderer';
export { ActivityLog } from './core/ActivityLog';
export { CommentManager } from './core/CommentManager';
export { toXFDF, fromXFDF } from './utils/xfdf';
export { generateUUID, debounce, formatTime, getDocumentType, toPdfDate, fromPdfDate } from './utils/utils';
export type { DocumentType, PageDimensions, IRenderer, AnnotationTool, AnnotationMode, XFDFRect, XFDFVertex, XFDFAnnotation, XFDFPageData, XFDFDocument, XFDFSerialiseInput, CommentMessage, CommentThread, ActivityEntry, AnnotatorDOMOptions, DocumentAnnotatorOptions, AnnotationEventHandler, CommentPlaceHandler, AnnotationCanvasOptions, } from './types/index';
