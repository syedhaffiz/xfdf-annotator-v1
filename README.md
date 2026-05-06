# xfdf-annotator

A lightweight, browser-based PDF and image annotation library that saves and loads annotations using the **XFDF standard** (ISO 19444-1 / Adobe XFDF Specification).

Built on top of [Fabric.js](http://fabricjs.com/) for canvas rendering and [PDF.js](https://mozilla.github.io/pdf.js/) for PDF support. Ships as an ESM + CJS package with TypeScript types.

> **Reference implementation:** A complete, production-style Angular host app — toolbar, activity log, comment threads, asset palette, drag-and-drop, theme toggle, PDF thumbnails, and zoom — lives at **[github.com/syedhaffiz/xfdf-annotator-angular](https://github.com/syedhaffiz/xfdf-annotator-angular)**. Use it as a worked example when wiring this library into your own framework.

---

## Features

- **Multi-format support** — Open PDFs (multi-page) and raster images (PNG, JPG, JPEG, GIF, WebP, SVG, BMP)
- **Annotation tools** — Select, Freehand, Rectangle, Ellipse, Line, Arrow, Polygon, Text, Image stamp, Eraser
- **Stroke styling** — Per-shape stroke colour, stroke width, and stroke dash pattern (any `strokeDashArray`)
- **Fill styling** — Per-shape fill colour and fill opacity (0–1) for rectangles, ellipses, polygons, triangles
- **Cloud-border line style** — `'arc'` line style replaces rect/line/polygon perimeters with outward-bulging arcs (revision-cloud / "scalloped" border) at draw time, with no post-hoc fabric hacks
- **Figma-style comments** — Click anywhere to drop a numbered pin and start a reply thread; messages persist `userId` *and* `userName`
- **Built-in undo / redo** — XFDF snapshot stack, capped at 50 entries, with `undo()` / `redo()` / `canUndo()` / `canRedo()`
- **Reactive integration hook** — `onChange` callback fires after every history-stack change, so framework adapters can mirror state into signals/stores without polling
- **First-class `User` identity** — Pass `{ id, displayName }` instead of an opaque id; the display name is shown in the activity log and comment threads, and round-trips through XFDF
- **XFDF save / load** — Export annotations as standard XFDF XML; reload them on the same document with full fidelity
- **Activity log** — Real-time sidebar feed of every draw / erase / comment action (also persisted in XFDF)
- **Responsive** — Auto re-renders at the correct scale when the viewer panel resizes (`ResizeObserver`)
- **HiDPI** — PDF pages render at `displayScale × devicePixelRatio` for crisp retina output
- **View / Edit modes** — Lock the canvas for read-only review or enable full editing
- **Framework-agnostic** — Plain DOM API; works in Angular, React, Vue, Svelte, or vanilla apps
- **Zero side-effects on import** — The PDF.js worker fallback is lazy (set inside `load()`), so consumer overrides of `pdfjsLib.GlobalWorkerOptions.workerSrc` are always preserved regardless of import order

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
  displayScale: 1.5,                                       // optional
  user: { id: 'u-haffiz', displayName: 'Haffiz Syed' },    // shown in log + threads
  // Reactive hook — fires after every annotation event, undo, redo, restore.
  onChange: () => {
    undoBtn.disabled = !annotator.canUndo();
    redoBtn.disabled = !annotator.canRedo();
  },
});

// Open a file
fileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await annotator.loadFile(file);
});

// Or open from a URL
await annotator.loadURL('/sample.pdf', 'pdf', 'Sample.pdf');

// ── Tool / style / mode ──
annotator.setTool('rectangle');
annotator.setColor('#e74c3c');         // stroke colour
annotator.setStrokeWidth(3);

// ── Fill (rect / ellipse / polygon / triangle) ──
annotator.setFillColor('#4a90e2');     // hex
annotator.setFillOpacity(0.3);         // 0 = transparent, 1 = fully opaque

// ── Dash pattern (any strokable shape) ──
annotator.setDashArray([10, 4, 2, 4]); // dash–dot
annotator.setDashArray([]);            // back to solid

// ── Cloud-border line style ──
annotator.setLineStyle('arc');         // rect / line / polygon → arc-chain
annotator.setLineStyle('solid');       // back to straight strokes

annotator.setMode('view');             // lock canvas for read-only review

// ── Save / restore ──
const xml = annotator.save();          // XFDF XML string
await annotator.restore(xml);          // hydrates pages + comments + log

// ── Undo / redo ──
if (annotator.canUndo()) await annotator.undo();
if (annotator.canRedo()) await annotator.redo();

// Tear down
annotator.destroy();
```

> **Tip** — `displayName` defaults to the first 8 characters of the id when only `userId` (legacy) is passed. Pass an explicit `user` object to surface real names in the activity log and comment threads.

---

## PDF.js Worker

`PDFRenderer` falls back to a CDN URL **only if `pdfjsLib.GlobalWorkerOptions.workerSrc` isn't already set when `load()` is first called**:

```text
https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.6.205/pdf.worker.min.mjs
```

The fallback is **lazy** (checked inside the `load()` method, not at module-load time), so consumers can override the worker URL anywhere before opening a document — order of imports doesn't matter:

```ts
import * as pdfjsLib from 'pdfjs-dist';
import { DocumentAnnotator } from 'xfdf-annotator';

// Either order works — the library will see your override at load() time.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

const a = new DocumentAnnotator();
await a.loadFile(file);   // worker URL is your local path, not the CDN
```

CDNs occasionally lag behind `pdfjs-dist` releases. The recommended pattern is to ship the worker with your app and pin it explicitly. Copy `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` into your app's static assets folder (`/public/`, `assets/`, etc.) as part of your build.

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

## Stroke, Fill, and Line Style

Every drawing tool reads its visual properties off four pieces of state. Setting any of them affects **new** annotations only — existing annotations are not retroactively restyled.

| Property | Setter | Default | Applies to |
|---|---|---|---|
| Stroke colour | `setColor(hex)` | `'#e74c3c'` | Every shape and freehand path |
| Stroke width | `setStrokeWidth(px)` | `3` | Every shape and freehand path |
| Stroke dash | `setDashArray(arr)` | `[]` (solid) | rect, ellipse, circle, polygon, triangle, line, freehand path, polyline |
| Fill colour | `setFillColor(hex)` | `'#4a90e2'` | rect, ellipse, circle, polygon, triangle |
| Fill opacity | `setFillOpacity(0–1)` | `0` (transparent) | rect, ellipse, circle, polygon, triangle |
| Line style | `setLineStyle('solid' \| 'arc')` | `'solid'` | rect, line, polygon |

### Dash patterns

Pass any standard SVG-style `strokeDashArray`. Common patterns:

```ts
annotator.setDashArray([]);                       // solid
annotator.setDashArray([2, 4]);                   // dotted
annotator.setDashArray([6, 4]);                   // short dashed
annotator.setDashArray([12, 6]);                  // long dashed
annotator.setDashArray([10, 4, 2, 4]);            // dash–dot
annotator.setDashArray([10, 4, 2, 4, 2, 4]);      // dash–dot–dot
annotator.setDashArray([16, 5, 3, 5]);            // long dash–dot
```

### Fill

Fill is opt-in — `fillOpacity` defaults to `0` so newly-drawn shapes are stroke-only by default. Set both colour and opacity to make fills visible:

```ts
annotator.setFillColor('#4a90e2');
annotator.setFillOpacity(0.3);     // 30% blue fill behind the stroke
```

The library renders fills as `rgba(r, g, b, opacity)` so the stroke remains fully opaque on top.

### Arc-cloud line style

`setLineStyle('arc')` swaps the natural geometry of `rect`, `line`, and `polygon` shapes for a Fabric `Path` whose perimeter is a chain of outward-bulging quadrant arcs (a "revision cloud" / scalloped border). The substitution happens at draw time inside `_makeFinalShape` / `_finalizePolygon` — no post-hoc events, no microtask swaps. The resulting path is centred on the source shape's bounding-box centre via `setPositionByOrigin` so origin/scale/rotation differences can't shift it.

```ts
annotator.setLineStyle('arc');
annotator.setTool('rectangle');
// User drags out a rectangle; the result is a cloud-bordered Path with
// the same objectId as a regular rect would have. Persists through XFDF
// save/restore via Fabric's standard toJSON() — no extra XFDF metadata.
```

Caveats:

- Ellipses, circles, and freehand paths fall back to `'solid'` rendering — they ignore `lineStyle: 'arc'`.
- The arcs are baked into the path geometry at draw time. Resizing afterwards scales the arcs with the path; they don't re-tile to keep a constant arc radius.

---

## Undo / Redo

Built-in XFDF snapshot stack. Every annotation event (`added` / `removed`) pushes a snapshot; the stack is capped at 50 entries.

```ts
annotator.canUndo();          // boolean
annotator.canRedo();          // boolean
await annotator.undo();       // restore the previous snapshot
await annotator.redo();       // re-apply the next snapshot
```

The stack is reset to a single baseline on every successful `loadFile()` / `loadURL()`. Undo / redo themselves don't pollute the stack — they suspend snapshotting via an internal `_suppressHistory` flag.

---

## Reactive Integration (`onChange`)

A `canUndo()` / `canRedo()` getter returns the current value, but a button with `[disabled]="!canUndo()"` won't refresh on its own — the framework needs a *push* signal to know when to re-evaluate. The library pushes one through the `onChange` callback option:

```ts
const annotator = new DocumentAnnotator({
  user,
  onChange: () => {
    // Fired after every annotation event, undo, redo, restore, and load.
    refreshUndoRedoButtons();
  },
});
```

`onChange` is fired after every operation that mutates the history stack:

- annotation added or removed by the user (via `_snapshot()`),
- `undo()` and `redo()` calls,
- `restore()` (and therefore `loadFile()` / `loadURL()`, since both restore a baseline).

Errors thrown inside the listener are caught and logged so a buggy listener can never derail the library's own state machine. See [§ Framework Integration](#framework-integration) for an Angular signal example.

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

### `userName` persistence

Both activity log entries and comment messages persist a `userName` alongside `userId`. When an XFDF file is reopened — even days later, on a different machine, with the original user no longer in your directory — the activity log and comment threads still render the human-readable name authored at the time. Legacy XFDF saved without a `userName` falls back to a truncated `userId`, so older files keep working.

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

  // Identity (preferred)
  user:              { id: 'u-1', displayName: 'Haffiz Syed' },

  // Identity (legacy — generates a User automatically)
  userId:            '',     // random UUID generated if both omitted

  // Reactive hook fired after annotation events, undo, redo, restore, load.
  onChange:          () => { /* refresh framework signals */ },
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
| `setColor(color: string): void` | Stroke colour (CSS hex) |
| `setStrokeWidth(width: number): void` | Stroke width in base units (px at scale 1) |
| `setFillColor(color: string): void` | Fill colour for new fillable shapes (rect, ellipse, polygon, triangle) |
| `setFillOpacity(opacity: number): void` | Fill opacity 0–1 (`0` = transparent / no fill) |
| `setDashArray(arr: number[]): void` | strokeDashArray for new strokable shapes (`[]` = solid) |
| `setLineStyle(style: 'solid' \| 'arc'): void` | Solid stroke or arc-cloud border for new rect / line / polygon |
| `getColor() / getStrokeWidth() / getFillColor() / getFillOpacity() / getDashArray() / getLineStyle()` | Read the current value of each style property |
| `insertImage(file: File): void` | Stamp an image onto the active page (no-op in view mode) |
| `save(): string` | Export annotations as XFDF XML |
| `restore(xfdfString: string): Promise<void>` | Import annotations from XFDF |
| `undo(): Promise<void>` | Revert to the previous snapshot (no-op if `canUndo()` is false) |
| `redo(): Promise<void>` | Re-apply the next snapshot (no-op if `canRedo()` is false) |
| `canUndo(): boolean` | True when there is an earlier state to revert to |
| `canRedo(): boolean` | True when there is a future state to re-apply |
| `clearLog(): void` | Empty the activity log |
| `destroy(): void` | Tear down all canvases and free resources |
| `user: User` *(readonly)* | The active user `{ id, displayName }` |
| `userId: string` *(readonly, deprecated — use `user.id`)* | Stable id of the active user |

### `AnnotationCanvas`

Internal class — managed by `DocumentAnnotator`. Exposed for advanced consumers who want to embed individual page canvases.

```ts
import { AnnotationCanvas } from 'xfdf-annotator';

const canvas = new AnnotationCanvas({ user, onEvent, onCommentPlace });
```

Key methods: `createCanvas`, `resize`, `destroy`, `setTool`, `setMode`, `setColor`, `setStrokeWidth`, `setFillColor`, `setFillOpacity`, `setDashArray`, `setLineStyle`, `insertImage`, `toJSON`, `loadFromData`.

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
  // Document & rendering
  DocumentType, PageDimensions, IRenderer,
  // Tools, modes, and the new line-style enum
  AnnotationTool, AnnotationMode, LineStyle,
  // User identity
  User,
  // XFDF data shapes
  XFDFRect, XFDFVertex, XFDFAnnotation, XFDFPageData,
  XFDFDocument, XFDFSerialiseInput,
  // Comments + activity log
  CommentMessage, CommentThread,
  ActivityEntry,
  // Constructor options + callbacks
  AnnotatorDOMOptions, DocumentAnnotatorOptions,
  AnnotationEventHandler,    // (entry: ActivityEntry) => void
  AnnotationChangeHandler,   // () => void — onChange notifier
  CommentPlaceHandler,
  AnnotationCanvasOptions,
} from 'xfdf-annotator';
```

Highlights:

```ts
type LineStyle = 'solid' | 'arc'

interface User {
  id: string
  displayName: string
}

interface ActivityEntry {
  // ...other fields...
  userId: string
  userName?: string   // captured at event time, persisted in XFDF
}

interface CommentMessage {
  id: string
  authorId: string
  authorName?: string
  text: string
  createdAt: number
}
```

---

## Framework Integration

### Angular

`DocumentAnnotator` queries the DOM by ID at construction, so initialise after `ngAfterViewInit` and tear down in `ngOnDestroy`. Wrap it in an injectable service so templates can react to state via signals:

```ts
import { Injectable, signal } from '@angular/core';
import {
  DocumentAnnotator, type AnnotationTool, type AnnotationMode,
  type User, type LineStyle,
} from 'xfdf-annotator';

@Injectable({ providedIn: 'root' })
export class AnnotatorService {
  private _annotator: DocumentAnnotator | null = null;

  // Signals that the toolbar binds to
  readonly tool        = signal<AnnotationTool>('select');
  readonly mode        = signal<AnnotationMode>('edit');
  readonly user        = signal<User | null>(null);
  readonly canUndo     = signal(false);
  readonly canRedo     = signal(false);

  init(user?: User) {
    if (this._annotator) return this._annotator;

    const a = new DocumentAnnotator({
      ...(user ? { user } : {}),
      // The library pushes a notification on every history-stack change.
      // Without this, canUndo()/canRedo() would only refresh inside our
      // own undo()/redo() calls — never when the user *drew* something —
      // so the buttons would stay [disabled] forever.
      onChange: () => this._refreshHistorySignals(),
    });
    this._annotator = a;
    this.user.set(a.user);
    return a;
  }

  async undo() { await this._annotator!.undo(); this._refreshHistorySignals(); }
  async redo() { await this._annotator!.redo(); this._refreshHistorySignals(); }

  private _refreshHistorySignals(): void {
    if (!this._annotator) return;
    this.canUndo.set(this._annotator.canUndo());
    this.canRedo.set(this._annotator.canRedo());
  }

  destroy() { this._annotator?.destroy(); this._annotator = null; }
}
```

Bind to the host component's lifecycle:

```ts
@Component({ selector: 'app-root', templateUrl: './app.html' })
export class App implements AfterViewInit, OnDestroy {
  readonly annotator = inject(AnnotatorService);
  ngAfterViewInit() {
    // Pass an explicit User so the activity log shows real names.
    this.annotator.init({ id: 'u-haffiz', displayName: 'Haffiz Syed' });
  }
  ngOnDestroy() { this.annotator.destroy(); }
}
```

A complete reference — including a fill/dash/line-style toolbar, undo/redo buttons, top-bar user badge, asset palette, drag-and-drop, theme toggle, PDF thumbnails, and zoom — lives at [`syedhaffiz/xfdf-annotator-angular`](https://github.com/syedhaffiz/xfdf-annotator-angular).

### React

Mount in a `useEffect` so the DOM scaffold exists before construction. Destroy in the cleanup. Use `onChange` to drive `canUndo` / `canRedo` state hooks:

```tsx
import { useEffect, useRef, useState } from 'react';
import { DocumentAnnotator, type User } from 'xfdf-annotator';

export function Annotator({ user }: { user: User }) {
  const ref = useRef<DocumentAnnotator | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const a = new DocumentAnnotator({
      user,
      onChange: () => {
        setCanUndo(a.canUndo());
        setCanRedo(a.canRedo());
      },
    });
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
