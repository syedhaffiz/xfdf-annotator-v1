# xfdf-annotator

A lightweight, browser-based PDF and image annotation tool that saves and loads annotations using the **XFDF standard** (ISO 19444-1 / Adobe XFDF Specification).

Built with [Fabric.js](http://fabricjs.com/) for canvas rendering and [PDF.js](https://mozilla.github.io/pdf.js/) for PDF support.

---

## Features

- **Multi-format support** — Open PDFs (multi-page) and raster images (PNG, JPG, JPEG, GIF, WebP, SVG, BMP)
- **Annotation tools** — Freehand, Rectangle, Ellipse, Line, Arrow, Polygon, Text, Image stamp, Eraser
- **Figma-style comments** — Click anywhere to place a comment pin and start a thread
- **XFDF save/load** — Export annotations as standard XFDF XML; reload them on the same document
- **Activity log** — Real-time sidebar feed of every draw/erase action
- **Responsive** — Automatically re-renders at the correct scale when the viewer panel resizes
- **HiDPI** — PDF pages render at `displayScale × devicePixelRatio` for crisp retina output
- **View / Edit modes** — Lock the canvas for read-only review or enable full editing

---

## Project Structure

```
js/
├── main.js                     # Entry point — wires DOM events to DocumentAnnotator
├── core/
│   ├── DocumentAnnotator.js    # Top-level orchestrator (load, save, restore, resize)
│   ├── AnnotationCanvas.js     # Per-page Fabric.js canvas + all drawing tools
│   ├── PDFRenderer.js          # HiDPI PDF.js wrapper
│   ├── ImageRenderer.js        # Image loader (mirrors PDFRenderer interface)
│   ├── ActivityLog.js          # Sidebar event feed
│   └── CommentManager.js       # Comment pins + floating thread panel
└── utils/
    ├── utils.js                # UUID, debounce, date helpers, document-type detection
    └── xfdf.js                 # XFDF serialiser / deserialiser
```

---

## Getting Started

### Prerequisites

The tool runs entirely in the browser with no build step. You need a static file server (e.g. VS Code Live Server, `npx serve`, or any web server) because ES modules require HTTP/HTTPS.

Include these CDN scripts in your HTML **before** the module entry point:

```html
<!-- PDF.js -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<!-- Fabric.js -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js"></script>

<!-- App entry point -->
<script type="module" src="js/main.js"></script>
```

### Required DOM IDs

`DocumentAnnotator` and `main.js` expect the following IDs in your HTML:

| ID | Purpose |
|----|---------|
| `viewer-panel` | Outer panel observed by ResizeObserver |
| `pages-container` | Container where page wrappers are injected |
| `log-entries` | Activity log list |
| `empty-state` | "No document loaded" placeholder |
| `loading-overlay` | Spinner shown during load |
| `document-viewport` | Scrollable viewport shown after load |
| `comment-thread-panel` | Floating comment thread panel |
| `new-comment-popup` | Popup for composing a new comment |
| `user-id-display` | Badge showing the current session's user ID |
| `doc-title` | Document filename display |
| `doc-meta` | Page count / dimensions display |
| `file-input` | `<input type="file">` for opening documents |
| `image-insert-input` | `<input type="file" accept="image/*">` for stamping images |
| `xfdf-input` | `<input type="file" accept=".xfdf">` for loading annotations |
| `btn-open-file` | Open file button |
| `btn-open-empty` | Alternative open button |
| `btn-save` | Save XFDF button |
| `btn-load-xfdf` | Load XFDF button |
| `btn-clear-log` | Clear activity log button |
| `color-picker` | `<input type="color">` |
| `brush-size` | `<input type="range">` for stroke width |
| `brush-size-val` | Text display of current brush size |
| `polygon-hint` | Hint banner shown when polygon tool is active |
| `toast-container` | Container for toast notifications |
| `toolbar-panel` | Toolbar element (gets `.view-mode` class in view mode) |

Toolbar mode buttons use `data-mode="view"` / `data-mode="edit"` (class `.mode-btn`).  
Tool buttons use `data-tool="<tool>"` (class `.tool-btn`).

---

## Annotation Tools

| Key | Tool | Description |
|-----|------|-------------|
| `V` | Select | Move, resize, or delete existing annotations |
| `P` | Freehand | Free-draw ink strokes |
| `L` | Line | Straight line segment |
| `A` | Arrow | Line with arrowhead |
| `R` | Rectangle | Outlined rectangle |
| `C` | Circle | Outlined ellipse |
| `G` | Polygon | Click to place vertices; click near the first point (or press **Enter**) to close; **Escape** to cancel |
| `T` | Text | Click to place an editable text label |
| `M` | Comment | Click to drop a numbered comment pin |
| `E` | Eraser | Click an annotation to remove it |
| `I` | Image | Insert an image file onto the current page |

---

## XFDF Format

Annotations are persisted in standard XFDF XML with two sections:

### Standard `<annots>` block
Interoperable with Adobe Acrobat, Foxit, and other XFDF-aware readers. Contains basic geometry for:
`ink`, `square`, `circle`, `line`, `polyline`, `polygon`, `freetext`

### `ext:canvas-data` extension
A lossless Fabric.js JSON snapshot per page, embedded in `CDATA`. This is the primary restore path — guarantees pixel-perfect round-trips including images and styled text.

### `ext:comments` extension
Serialised comment threads (pin position, messages, resolved state).

### `ext:log` extension
Activity log entries for audit trails.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/"
      xmlns:ext="http://xfdf-annotator.example.com/ext/1.0"
      xml:space="preserve">
  <f href="my-document.pdf"/>
  <annots>
    <square page="0" name="..." color="#e74c3c" width="3" rect="50,700,200,650"/>
  </annots>
  <ext:canvas-data>
    <ext:page index="0"><![CDATA[{ ... fabric JSON ... }]]></ext:page>
  </ext:canvas-data>
  <ext:comments counter="1"> ... </ext:comments>
  <ext:log><![CDATA[[ ... log entries ... ]]]></ext:log>
</xfdf>
```

---

## API Reference

### `DocumentAnnotator`

```js
import { DocumentAnnotator } from './core/DocumentAnnotator.js';

const annotator = new DocumentAnnotator(options);
```

**Constructor options** (all optional, defaults shown):

```js
{
  viewerPanelId:      'viewer-panel',
  pagesContainerId:   'pages-container',
  logContainerId:     'log-entries',
  emptyStateId:       'empty-state',
  loadingId:          'loading-overlay',
  viewportId:         'document-viewport',
  threadPanelId:      'comment-thread-panel',
  newCommentPopupId:  'new-comment-popup',
}
```

**Methods:**

| Method | Description |
|--------|-------------|
| `loadFile(file: File): Promise<void>` | Open a PDF or image File object |
| `loadURL(url, type, label?): Promise<void>` | Open a document from a URL (`type`: `'pdf'` or `'image'`) |
| `setMode(mode: 'edit'|'view')` | Switch between edit and view mode |
| `getMode(): string` | Get current mode |
| `setTool(tool: string)` | Activate a drawing tool |
| `setColor(color: string)` | Set stroke/fill color (CSS hex) |
| `setStrokeWidth(width: number)` | Set stroke width in base units |
| `insertImage(file: File)` | Stamp an image onto the active page |
| `save(): string` | Export all annotations as an XFDF XML string |
| `restore(xfdfString: string): Promise<void>` | Import annotations from XFDF |
| `clearLog()` | Clear the activity log |
| `destroy()` | Tear down all canvases and free resources |

---

### `AnnotationCanvas`

Manages one `fabric.Canvas` instance per document page. Created internally by `DocumentAnnotator`.

```js
import { AnnotationCanvas } from './core/AnnotationCanvas.js';

const canvas = new AnnotationCanvas({ userId, onEvent, onCommentPlace });
```

Key methods: `createCanvas`, `resize`, `destroy`, `setTool`, `setMode`, `setColor`, `setStrokeWidth`, `insertImage`, `toJSON`, `loadFromData`.

---

### XFDF Utilities

```js
import { toXFDF, fromXFDF } from './utils/xfdf.js';

// Serialise
const xml = toXFDF({ docId, pages, comments, log });

// Deserialise
const { pages, comments, log } = fromXFDF(xmlString);
```

---

### Utility Functions (`utils/utils.js`)

| Function | Description |
|----------|-------------|
| `generateUUID()` | Returns a UUID v4 string |
| `debounce(fn, delay)` | Returns a debounced version of `fn` |
| `formatTime(ts)` | Formats a timestamp to a locale time string |
| `getDocumentType(nameOrMime)` | Returns `'pdf'`, `'image'`, or `null` |
| `toPdfDate(ts)` | Converts a JS timestamp to PDF date string (`D:YYYYMMDDHHmmss`) |
| `fromPdfDate(str)` | Parses a PDF date string back to a JS timestamp |

---

## Coordinate Systems

| System | Origin | Y direction | Units |
|--------|--------|-------------|-------|
| Screen / Fabric | Top-left | Down ↓ | px (= PDF pts at scale 1) |
| XFDF / PDF | Bottom-left | Up ↑ | PDF pts |

Conversion:
- **screen → PDF:** `pdfY = pageHeight − screenY`
- **PDF → screen:** `screenY = pageHeight − pdfY`

---

## Performance Notes

- **Parallel PDF page loading** — all page objects are fetched with `Promise.all` (O(1) vs sequential O(n))
- **Progressive rendering** — page 1 renders first so content is visible immediately; remaining pages render in parallel in the background
- **Dirty-page serialisation** — `AnnotationCanvas.toJSON()` only re-serialises pages that have been modified since the last save; clean pages return a cached JSON object
- **Cancellable render tasks** — stale PDF render tasks are cancelled on resize so rapid window resizing doesn't pile up work
- **XFDF string building** — uses array + `join` rather than DOM construction (10–50× faster for large annotation sets)
- **Single-reflow DOM build** — all page wrappers are collected into a `DocumentFragment` and appended in one operation

---

## Browser Support

Requires a modern browser with support for:
- ES Modules (`import`/`export`)
- `ResizeObserver`
- `DOMParser` / `XMLSerializer`
- `FileReader` / `Blob` / `URL.createObjectURL`
- `crypto.randomUUID` (falls back to `Math.random`-based UUID generation)

---

## License

MIT
