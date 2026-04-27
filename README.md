# xfdf-annotator

A lightweight, browser-based PDF and image annotation library that saves and loads annotations using the **XFDF standard** (ISO 19444-1 / Adobe XFDF Specification).

Built on top of [Fabric.js](http://fabricjs.com/) for canvas rendering and [PDF.js](https://mozilla.github.io/pdf.js/) for PDF support. Ships as an ESM + CJS package with TypeScript types.

> **Reference implementation:** A complete, production-style Angular host app — toolbar, activity log, comment threads, asset palette, drag-and-drop, theme toggle, PDF thumbnails, and zoom — lives at **[github.com/syedhaffiz/xfdf-annotator-angular](https://github.com/syedhaffiz/xfdf-annotator-angular)**. Use it as a worked example when wiring this library into your own framework.

---

## Features

- **Multi-format support** — Open PDFs (multi-page) and raster images (PNG, JPG, JPEG, GIF, WebP, SVG, BMP)
- **Annotation tools** — Select, Freehand, Rectangle, Ellipse, Line, Arrow, Polygon, Text, Image stamp, Eraser
- **Figma-style comments** — Click anywhere to drop a numbered pin and start a reply thread
- **XFDF save / load** — Export annotations as standard XFDF XML; reload them on the same document with full fidelity
- **Activity log** — Real-time sidebar feed of every draw / erase / comment action (also persisted in XFDF)
- **Responsive** — Auto re-renders at the correct scale when the viewer panel resizes (`ResizeObserver`)
- **HiDPI** — PDF pages render at `displayScale × devicePixelRatio` for crisp retina output
- **View / Edit modes** — Lock the canvas for read-only review or enable full editing
- **Framework-agnostic** — Plain DOM API; works in Angular, React, Vue, Svelte, or vanilla apps

---

## Installation

```bash
npm install xfdf-annotator fabric pdfjs-dist
```

`fabric` and `pdfjs-dist` are declared as peer dependencies — install them in the host application.

The package ships:

- `dist/xfdf-annotator.js` — ESM entry (`"module"`)
- `dist/xfdf-annotator.cjs` — CommonJS entry (`"main"`)
- `dist/index.d.ts` — TypeScript type definitions

---

## Project Structure (source)

```
src/
├── index.ts                       # Public exports
├── core/
│   ├── DocumentAnnotator.ts       # Top-level orchestrator (load, save, restore, resize)
│   ├── AnnotationCanvas.ts        # Per-page Fabric.js canvas + all drawing tools
│   ├── PDFRenderer.ts             # HiDPI PDF.js wrapper
│   ├── ImageRenderer.ts           # Image loader (mirrors PDFRenderer interface)
│   ├── ActivityLog.ts             # Sidebar event feed
│   └── CommentManager.ts          # Comment pins + floating thread panel
├── types/
│   └── index.ts                   # Public type definitions
└── utils/
    ├── utils.ts                   # UUID, debounce, date helpers, document-type detection
    └── xfdf.ts                    # XFDF serialiser / deserialiser
```

---

## Quickstart

```ts
import { DocumentAnnotator } from 'xfdf-annotator';

// Construct AFTER the host DOM (the IDs below) exists.
const annotator = new DocumentAnnotator({
  displayScale: 1.5,         // optional — base CSS scale (× devicePixelRatio for backing pixels)
  userId:       'haffiz',    // optional — random UUID generated if omitted
});

// Open a file
fileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await annotator.loadFile(file);
});

// Or open from a URL
await annotator.loadURL('/sample.pdf', 'pdf', 'Sample.pdf');

// Tool / style / mode
annotator.setTool('rectangle');
annotator.setColor('#e74c3c');
annotator.setStrokeWidth(3);
annotator.setMode('view');           // lock canvas for read-only review

// Save / restore
const xml = annotator.save();        // XFDF XML string
await annotator.restore(xml);        // hydrates pages + comments + log

// Tear down
annotator.destroy();
```

---

## PDF.js Worker

`PDFRenderer` initialises `pdfjsLib.GlobalWorkerOptions.workerSrc` to a CDN URL **only if it isn't already set**:

```text
https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.6.205/pdf.worker.min.mjs
```

CDNs occasionally lag behind `pdfjs-dist` releases. The recommended pattern is to ship the worker with your app and pin it before any document loads:

```ts
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
```

Copy `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` into your app's static assets folder (`/public/`, `assets/`, etc.) as part of your build.

---

## Required DOM Scaffold

`DocumentAnnotator` reaches into the DOM by **element ID** — your framework's job is to render the scaffold and then construct the annotator after the view exists.

| ID (default) | Purpose | Required |
|----|----|----|
| `viewer-panel` | Outer panel observed by `ResizeObserver` for auto-rescale | yes |
| `pages-container` | Container where page wrappers (`.page-wrapper`) get injected | yes |
| `document-viewport` | Scrollable viewport shown after a document loads | yes |
| `empty-state` | "No document loaded" placeholder | optional |
| `loading-overlay` | Spinner shown during load | optional |
| `log-entries` | Activity log list — must exist at construction time, otherwise events are silently dropped | yes (if you use the log) |
| `comment-thread-panel` | Floating thread reader (needs `.ctp-pin-num`, `.ctp-messages`, `.ctp-close`, `.ctp-reply-input`, `.ctp-reply-btn` children) | yes (if you use comments) |
| `new-comment-popup` | New-comment composer (needs `<textarea>`, `#btn-post-comment`, `#btn-cancel-comment` children) | yes (if you use comments) |
| `doc-title` / `doc-meta` | Filename + page-count display written by the library after load | optional |
| `toolbar-panel` | Your toolbar — gets `.view-mode` class added/removed when `setMode()` is called | optional |

All IDs are configurable via `DocumentAnnotatorOptions` (see [API Reference](#api-reference)).

A minimal scaffold:

```html
<main id="viewer-panel">
  <div id="empty-state">Open a PDF or image to start annotating</div>
  <div id="loading-overlay" style="display:none;">Loading…</div>
  <div id="document-viewport" style="display:none;">
    <div id="pages-container"></div>
  </div>
</main>

<aside><div id="log-entries"></div></aside>

<div id="comment-thread-panel" style="display:none;">
  <div class="ctp-header">
    <span class="ctp-pin-num"></span>
    <button class="ctp-close" aria-label="Close">×</button>
  </div>
  <div class="ctp-messages"></div>
  <div class="ctp-reply-bar">
    <input class="ctp-reply-input" placeholder="Reply…" />
    <button class="ctp-reply-btn">Send</button>
  </div>
</div>

<div id="new-comment-popup" style="display:none;">
  <textarea placeholder="Add a comment…"></textarea>
  <button id="btn-cancel-comment">Cancel</button>
  <button id="btn-post-comment">Post</button>
</div>
```

The library ships **no styles** — you own the visual treatment.

---

## Annotation Tools

Pass a tool name to `annotator.setTool(...)`. The `key` column is the convention used by the Angular reference app — the library doesn't bind shortcuts itself.

| Key | Tool name | Description |
|---|---|---|
| V | `'select'` | Move, resize, or delete existing annotations |
| P | `'freehand'` | Free-draw ink strokes (Fabric `PencilBrush`) |
| L | `'line'` | Click-drag straight line |
| A | `'arrow'` | Click-drag line with arrowhead |
| R | `'rectangle'` | Click-drag outlined rectangle |
| C | `'circle'` | Click-drag outlined ellipse |
| G | `'polygon'` | Click to place vertices; click near the first point (or **Enter**) to close; **Escape** to cancel |
| T | `'text'` | Click to place an editable text label (commits on blur, removed if empty) |
| M | `'comment'` | Click empty space to drop a numbered comment pin and open the new-comment popup |
| E | `'eraser'` | Click an annotation to remove it |
| I | `'image'` | Stamp an image file onto the active page (typically wired to a hidden file picker) |

A minimum-size guard (`MIN_SIZE = 4`) prevents accidental tiny shapes; sub-threshold drags are dropped.

---

## XFDF Format

Annotations are persisted as standard XFDF XML with three custom extensions:

### `<annots>` — standard XFDF block

Interoperable with Adobe Acrobat, Foxit, and other XFDF-aware readers. Contains basic geometry for: `ink`, `square`, `circle`, `line`, `polyline`, `polygon`, `freetext`. Coordinates are in PDF coordinate space (origin bottom-left, Y up).

### `ext:canvas-data` — Fabric.js snapshot extension

A lossless Fabric.js JSON snapshot per page, embedded in `CDATA`. This is the **primary restore path** — it guarantees pixel-perfect round-trips including images, opacity, and styled text. `restore()` uses this when present and falls back to `<annots>` only if the extension is missing.

### `ext:comments` — comment threads

Serialised comment pins with their messages, resolved state, and the running counter. Pin coordinates are stored in *base* (unzoomed) page space so they reposition correctly when the canvas re-scales.

### `ext:log` — activity log

Activity log entries for an audit trail. After a `restore()`, the log re-populates from the saved entries automatically.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/"
      xmlns:ext="http://xfdf-annotator.example.com/ext/1.0"
      xml:space="preserve">
  <f href="my-document.pdf"/>
  <annots>
    <square page="0" name="…" color="#e74c3c" width="3" rect="50,700,200,650"/>
  </annots>
  <ext:canvas-data>
    <ext:page index="0"><![CDATA[{ …fabric JSON… }]]></ext:page>
  </ext:canvas-data>
  <ext:comments counter="1"> … </ext:comments>
  <ext:log><![CDATA[[ … log entries … ]]]></ext:log>
</xfdf>
```

---

## API Reference

### `DocumentAnnotator`

```ts
import { DocumentAnnotator } from 'xfdf-annotator';

const annotator = new DocumentAnnotator(options?);
```

**Constructor options** (`DocumentAnnotatorOptions`, all optional, defaults shown):

```ts
{
  // DOM IDs
  viewerPanelId:     'viewer-panel',
  pagesContainerId:  'pages-container',
  logContainerId:    'log-entries',
  emptyStateId:      'empty-state',
  loadingId:         'loading-overlay',
  viewportId:        'document-viewport',
  threadPanelId:     'comment-thread-panel',
  newCommentPopupId: 'new-comment-popup',

  // Display
  displayScale:      1.5,    // base CSS scale before devicePixelRatio
  userId:            '',     // random UUID generated if omitted
}
```

**Methods**

| Method | Description |
|---|---|
| `loadFile(file: File): Promise<void>` | Open a PDF or image File object |
| `loadURL(url, type, label?): Promise<void>` | Open from a URL — `type` is `'pdf'` or `'image'` |
| `setMode(mode: 'edit' \| 'view'): void` | Switch interaction mode |
| `getMode(): 'edit' \| 'view'` | Current mode |
| `setTool(tool: AnnotationTool): void` | Activate a drawing tool (no-op in view mode) |
| `setColor(color: string): void` | CSS hex stroke/fill colour |
| `setStrokeWidth(width: number): void` | Stroke width in base units (px at scale 1) |
| `insertImage(file: File): void` | Stamp an image onto the active page (no-op in view mode) |
| `save(): string` | Export annotations as XFDF XML |
| `restore(xfdfString: string): Promise<void>` | Import annotations from XFDF |
| `clearLog(): void` | Empty the activity log |
| `destroy(): void` | Tear down all canvases and free resources |
| `userId: string` *(readonly)* | This session's user ID |

### `AnnotationCanvas`

Internal class — managed by `DocumentAnnotator`. Exposed for advanced consumers who want to embed individual page canvases.

```ts
import { AnnotationCanvas } from 'xfdf-annotator';

const canvas = new AnnotationCanvas({ userId, onEvent, onCommentPlace });
```

Key methods: `createCanvas`, `resize`, `destroy`, `setTool`, `setMode`, `setColor`, `setStrokeWidth`, `insertImage`, `toJSON`, `loadFromData`.

### `PDFRenderer` and `ImageRenderer`

Both implement the `IRenderer` interface and can be used directly if you need to render thumbnails or an outline panel using the same loaded document:

```ts
interface IRenderer {
  readonly pageCount: number;
  renderPage(pageIndex: number, canvas: HTMLCanvasElement): Promise<{ width: number; height: number }>;
  destroy(): void;
}
```

### XFDF utilities

```ts
import { toXFDF, fromXFDF } from 'xfdf-annotator';

const xml = toXFDF({ docId, pages, comments, log });
const { pages, comments, log } = fromXFDF(xmlString);
```

### Other utilities

```ts
import {
  generateUUID,    // () => string                — UUID v4 with crypto.randomUUID fallback
  debounce,        // <T>(fn, delay) => T          — trailing-edge debounce
  formatTime,      // (ts: number) => string       — locale time string
  getDocumentType, // (s: string) => 'pdf' | 'image' | null
  toPdfDate,       // (ts: number) => string       — 'D:YYYYMMDDHHmmss'
  fromPdfDate,     // (s: string)  => number       — ms since epoch
} from 'xfdf-annotator';
```

### Type exports

The library re-exports every type used in its public surface:

```ts
import type {
  DocumentType, PageDimensions, IRenderer,
  AnnotationTool, AnnotationMode,
  XFDFRect, XFDFVertex, XFDFAnnotation, XFDFPageData,
  XFDFDocument, XFDFSerialiseInput,
  CommentMessage, CommentThread,
  ActivityEntry,
  AnnotatorDOMOptions, DocumentAnnotatorOptions,
  AnnotationEventHandler, CommentPlaceHandler,
  AnnotationCanvasOptions,
} from 'xfdf-annotator';
```

---

## Framework Integration

### Angular

`DocumentAnnotator` queries the DOM by ID at construction, so initialise after `ngAfterViewInit` and tear down in `ngOnDestroy`:

```ts
import { AfterViewInit, Component, OnDestroy, inject } from '@angular/core';
import { DocumentAnnotator } from 'xfdf-annotator';

@Component({ selector: 'app-root', templateUrl: './app.html' })
export class App implements AfterViewInit, OnDestroy {
  private annotator: DocumentAnnotator | null = null;

  ngAfterViewInit(): void {
    this.annotator = new DocumentAnnotator();
  }

  ngOnDestroy(): void {
    this.annotator?.destroy();
  }
}
```

The recommended pattern is to wrap the annotator in an injectable service that exposes mutable state (tool, mode, color, stroke width) as Angular signals — see the reference implementation at [`syedhaffiz/xfdf-annotator-angular`](https://github.com/syedhaffiz/xfdf-annotator-angular).

### React

Mount in a `useEffect` so the DOM scaffold exists before construction. Destroy in the cleanup:

```tsx
import { useEffect, useRef } from 'react';
import { DocumentAnnotator } from 'xfdf-annotator';

export function Annotator() {
  const ref = useRef<DocumentAnnotator | null>(null);

  useEffect(() => {
    const a = new DocumentAnnotator();
    ref.current = a;
    return () => { a.destroy(); ref.current = null; };
  }, []);

  return (
    <main id="viewer-panel">
      <div id="empty-state">Open a PDF or image to start annotating</div>
      <div id="loading-overlay" style={{ display: 'none' }}>Loading…</div>
      <div id="document-viewport" style={{ display: 'none' }}>
        <div id="pages-container" />
      </div>
      {/* …log-entries, comment-thread-panel, new-comment-popup… */}
    </main>
  );
}
```

For state propagation (so the toolbar reflects the active tool, etc.) wrap the annotator in a Context provider exposing `useState` setters that proxy to the underlying methods.

---

## Coordinate Systems

| System | Origin | Y direction | Units |
|---|---|---|---|
| Screen / Fabric | Top-left | Down ↓ | px (= PDF pts at scale 1) |
| XFDF / PDF | Bottom-left | Up ↑ | PDF points |

Conversion:

- screen → PDF: `pdfY = pageHeight − screenY`
- PDF → screen: `screenY = pageHeight − pdfY`

The serialiser flips Y on save, and `loadFromData` uses Fabric snapshots that already live in screen space — so application code rarely needs to think about this.

---

## Performance Notes

- **Parallel PDF page loading** — page proxies fetched with `Promise.all` (O(1) round trips vs. sequential O(n))
- **Progressive rendering** — page 1 paints first so the viewport is interactive immediately; remaining pages render in parallel in the background
- **Dirty-page serialisation** — `AnnotationCanvas.toJSON()` only re-serialises pages modified since the last save; clean pages return cached JSON
- **Cancellable PDF render tasks** — stale tasks are cancelled on resize so rapid resizing doesn't pile up work
- **String-builder XFDF** — `toXFDF` builds via array + `join` rather than DOM construction; 10–50× faster for large annotation sets
- **Single-reflow DOM build** — page wrappers collected into a `DocumentFragment` and appended in one operation

---

## Browser Support

Requires a modern browser with support for:

- ES Modules (`import` / `export`)
- `ResizeObserver`
- `DOMParser` / `XMLSerializer`
- `FileReader` / `Blob` / `URL.createObjectURL`
- `crypto.randomUUID` (falls back to `Math.random`-based UUID generation)

---

## License

MIT
