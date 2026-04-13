import { generateUUID } from '../utils/utils.js';

const CUSTOM_PROPS = ['objectId', 'createdBy', 'timestamp', 'actionType', 'tool', 'pageIndex'];
const MIN_SIZE     = 4;   // px — shapes smaller than this are discarded
const ARROW_HEAD   = 14;  // arrowhead size in base coords

/**
 * AnnotationCanvas
 *
 * Manages one fabric.Canvas per document page.
 *
 * Tools: select | freehand | rectangle | circle | line | arrow |
 *        polygon | text | eraser | comment | image
 *
 * Coordinate space: all objects stored in base (zoom=1) units.
 * For PDF documents, base units = PDF points (PDF.js scale=1 → 1px/pt).
 * Visual scaling is applied via canvas.setZoom(scale) — no object
 * coordinate math is needed when the scale changes.
 */
export class AnnotationCanvas {
  constructor({ userId, onEvent, onCommentPlace }) {
    this.userId         = userId;
    this.onEvent        = onEvent;
    this.onCommentPlace = onCommentPlace || (() => {});

    /** @type {Array<PageState>} */
    this._pages = [];

    // Dirty tracking: only re-serialise pages that have been modified.
    // Populated by _attachMeta and eraser events; cleared by loadFromData.
    this._dirtyPages = new Set();

    // JSON cache: last serialised output per page (reused when page is clean)
    this._jsonCache  = new Map();   // pageIndex → canvasJSON

    this.currentTool = 'select';
    this.strokeColor = '#e74c3c';
    this.strokeWidth = 3;
    this.mode        = 'edit';
  }

  // ── Page lifecycle ────────────────────────────────────────────────

  createCanvas(canvasEl, baseW, baseH, pageIndex, scale) {
    const physW = Math.round(baseW * scale);
    const physH = Math.round(baseH * scale);

    const fc = new fabric.Canvas(canvasEl, {
      width: physW, height: physH,
      selection: true,
      preserveObjectStacking: true,
    });

    fc.wrapperEl.style.cssText = 'position:absolute;top:0;left:0;';
    fc.setZoom(scale);

    const pageState = {
      fc, baseW, baseH,
      poly:  { active: false, points: [], helpers: [], rubberband: null },
      draw:  { active: false, start: null, shape: null },
      erase: { active: false },
    };

    this._pages[pageIndex] = pageState;
    this._setupEvents(pageState, pageIndex);
    this._applyToolTo(fc);

    return fc;
  }

  resize(pageIndex, newScale) {
    const p = this._pages[pageIndex];
    if (!p) return;
    p.fc.setZoom(newScale);
    p.fc.setDimensions({
      width:  Math.round(p.baseW * newScale),
      height: Math.round(p.baseH * newScale),
    });
    p.fc.renderAll();
  }

  destroy() {
    this._pages.forEach((p) => {
      if (!p) return;
      if (p._keyHandler) document.removeEventListener('keydown', p._keyHandler);
      p.fc.dispose();
    });
    this._pages      = [];
    this._dirtyPages = new Set();
    this._jsonCache  = new Map();
  }

  // ── Tool / style control ──────────────────────────────────────────

  setTool(tool) {
    this.currentTool = tool;
    this._pages.forEach((p) => {
      if (!p) return;
      this._cancelPolygon(p);
      this._applyToolTo(p.fc);
    });
  }

  setMode(mode) {
    this.mode = mode;
    this._pages.forEach((p) => {
      if (!p) return;
      this._cancelPolygon(p);
      this._applyModeTo(p.fc);
    });
  }

  setColor(color) {
    this.strokeColor = color;
    this._pages.forEach((p) => {
      if (!p) return;
      if (p.fc.isDrawingMode && p.fc.freeDrawingBrush) {
        p.fc.freeDrawingBrush.color = color;
      }
    });
  }

  setStrokeWidth(w) {
    this.strokeWidth = w;
    this._pages.forEach((p) => {
      if (!p) return;
      if (p.fc.isDrawingMode && p.fc.freeDrawingBrush) {
        p.fc.freeDrawingBrush.width = w;
      }
    });
  }

  insertImage(fileOrUrl, pageIndex) {
    const p = this._pages[pageIndex];
    if (!p) return;

    if (typeof fileOrUrl === 'string') {
      this._placeImage(fileOrUrl, p, pageIndex);
    } else {
      const reader = new FileReader();
      reader.onload  = (e) => this._placeImage(e.target.result, p, pageIndex);
      reader.onerror = () => console.error('Failed to read image file');
      reader.readAsDataURL(fileOrUrl);
    }
  }

  /** @private */
  _placeImage(dataUrl, p, pageIndex) {
    fabric.Image.fromURL(dataUrl, (img) => {
      const maxW = p.baseW * 0.4;
      if (img.width > maxW) img.scale(maxW / img.width);

      img.set({
        left: (p.baseW - img.getScaledWidth())  / 2,
        top:  (p.baseH - img.getScaledHeight()) / 2,
      });

      this._attachMeta(img, 'image', pageIndex);
      img.selectable = this.mode === 'edit' && this.currentTool === 'select';
      img.evented    = this.mode === 'edit';

      p.fc.add(img);
      p.fc.setActiveObject(img);
      p.fc.renderAll();

      this.onEvent({
        action: 'added', tool: 'image',
        objectId: img.objectId, userId: this.userId,
        timestamp: img.timestamp, pageIndex,
      });
    });
  }

  // ── Serialization ─────────────────────────────────────────────────

  /**
   * Export all pages as Fabric canvas JSON.
   *
   * Dirty-page optimisation: Fabric's toJSON() is O(objects) — expensive for
   * large canvases.  We cache the output per page and only re-serialise pages
   * that have been modified since the last save.
   *
   * @returns {Array<{ pageIndex: number, canvasJSON: object|null }>}
   */
  toJSON() {
    return this._pages.map((p, i) => {
      if (!p) return { pageIndex: i, canvasJSON: null };

      // Return cached JSON if this page hasn't been touched
      if (!this._dirtyPages.has(i) && this._jsonCache.has(i)) {
        return { pageIndex: i, canvasJSON: this._jsonCache.get(i) };
      }

      const json = p.fc.toJSON(CUSTOM_PROPS);
      this._jsonCache.set(i, json);
      this._dirtyPages.delete(i);
      return { pageIndex: i, canvasJSON: json };
    });
  }

  /**
   * Load annotations from previously serialised page data.
   * All pages are loaded in parallel (Promise.all).
   * @param {Array<{ pageIndex: number, canvasJSON: object }>} pagesData
   * @returns {Promise<void>}
   */
  loadFromData(pagesData) {
    // Clear caches on restore so stale data doesn't survive
    this._dirtyPages.clear();
    this._jsonCache.clear();

    const promises = pagesData.map(({ pageIndex, canvasJSON }) => {
      if (!canvasJSON) return Promise.resolve();
      const p = this._pages[pageIndex];
      if (!p) return Promise.resolve();

      return new Promise((resolve) => {
        p.fc.loadFromJSON(
          canvasJSON,
          () => {
            const isEdit = this.mode === 'edit';
            p.fc.getObjects().forEach((obj) => {
              obj.selectable = isEdit && this.currentTool === 'select';
              obj.evented    = isEdit;
            });
            p.fc.renderAll();
            // Seed the cache so the first save after restore is also fast
            this._jsonCache.set(pageIndex, canvasJSON);
            resolve();
          },
          (serialized, obj) => {
            CUSTOM_PROPS.forEach((prop) => {
              if (serialized[prop] !== undefined) obj[prop] = serialized[prop];
            });
          }
        );
      });
    });
    return Promise.all(promises);
  }

  // ── Private: tool application ─────────────────────────────────────

  _applyToolTo(fc) {
    if (this.mode === 'view') { this._applyModeTo(fc); return; }

    const tool    = this.currentTool;
    const isShape = ['rectangle', 'circle', 'line', 'arrow', 'polygon'].includes(tool);

    fc.isDrawingMode = (tool === 'freehand');
    fc.selection     = (tool === 'select');

    if (tool === 'freehand') {
      fc.freeDrawingBrush       = new fabric.PencilBrush(fc);
      fc.freeDrawingBrush.color = this.strokeColor;
      fc.freeDrawingBrush.width = this.strokeWidth;
      fc.defaultCursor          = 'crosshair';
      fc.hoverCursor            = 'crosshair';
    } else if (isShape || tool === 'text' || tool === 'comment') {
      fc.defaultCursor = 'crosshair';
      fc.hoverCursor   = 'crosshair';
    } else if (tool === 'eraser') {
      fc.defaultCursor = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='2'%3E%3Cpath d='M20 20H7L3 16l10-10 7 7-3.5 3.5'/%3E%3Cpath d='M6 11l7 7'/%3E%3C/svg%3E\") 4 20, crosshair";
      fc.hoverCursor   = 'crosshair';
    } else {
      fc.defaultCursor = 'default';
      fc.hoverCursor   = 'move';
    }

    fc.getObjects().forEach((obj) => {
      if (obj._helper) return;
      obj.selectable = (tool === 'select');
      obj.evented    = (tool === 'select' || tool === 'eraser');
    });

    fc.renderAll();
  }

  _applyModeTo(fc) {
    fc.isDrawingMode = false;
    fc.selection     = false;
    fc.getObjects().forEach((obj) => {
      if (obj._helper) return;
      obj.selectable = false;
      obj.evented    = false;
    });
    fc.renderAll();
  }

  // ── Private: events ───────────────────────────────────────────────

  _setupEvents(pageState, pageIndex) {
    const { fc, poly, draw, erase } = pageState;

    fc.on('path:created', (e) => {
      const path = e.path;
      this._attachMeta(path, 'freehand', pageIndex);
      path.selectable = (this.currentTool === 'select');
      path.evented    = true;
      this.onEvent({
        action: 'added', tool: 'freehand',
        objectId: path.objectId, userId: this.userId,
        timestamp: path.timestamp, pageIndex,
      });
    });

    fc.on('mouse:down', (opt) => {
      if (this.mode === 'view') return;
      const ptr = fc.getPointer(opt.e);

      switch (this.currentTool) {
        case 'eraser':
          erase.active = true;
          this._eraseAt(fc, opt.e, pageIndex);
          break;

        case 'rectangle':
        case 'circle':
        case 'line':
        case 'arrow':
          draw.active = true;
          draw.start  = ptr;
          draw.shape  = this._makeShapePreview(this.currentTool, ptr);
          if (draw.shape) fc.add(draw.shape);
          break;

        case 'polygon':
          this._polygonClick(pageState, pageIndex, ptr, opt.e);
          break;

        case 'text':
          if (opt.target?.type === 'i-text') break;
          this._placeText(fc, ptr, pageIndex);
          break;

        case 'comment':
          if (opt.target) break;
          this.onCommentPlace(pageIndex, ptr.x, ptr.y, opt.e);
          break;
      }
    });

    fc.on('mouse:move', (opt) => {
      if (this.mode === 'view') return;

      if (this.currentTool === 'eraser' && erase.active) {
        this._eraseAt(fc, opt.e, pageIndex);
        return;
      }

      if (!draw.active || !draw.shape) {
        if (this.currentTool === 'polygon' && poly.active && poly.rubberband) {
          const ptr = fc.getPointer(opt.e);
          poly.rubberband.set({ x2: ptr.x, y2: ptr.y });
          fc.renderAll();
        }
        return;
      }

      const ptr = fc.getPointer(opt.e);
      this._updateShapePreview(draw.shape, this.currentTool, draw.start, ptr);
      fc.renderAll();
    });

    fc.on('mouse:up', (opt) => {
      if (this.mode === 'view') return;

      erase.active = false;

      if (!draw.active) return;
      draw.active = false;

      const ptr = fc.getPointer(opt.e);

      if (draw.shape) { fc.remove(draw.shape); draw.shape = null; }

      const tool  = this.currentTool;
      const start = draw.start;
      draw.start  = null;

      if (!['rectangle', 'circle', 'line', 'arrow'].includes(tool)) return;

      const finalShape = this._makeFinalShape(tool, start, ptr);
      if (!finalShape || !this._isValidShape(finalShape, tool)) return;

      this._attachMeta(finalShape, tool, pageIndex);
      finalShape.selectable = (tool === 'select');
      finalShape.evented    = true;

      fc.add(finalShape);
      fc.renderAll();

      this.onEvent({
        action: 'added', tool,
        objectId: finalShape.objectId, userId: this.userId,
        timestamp: finalShape.timestamp, pageIndex,
      });
    });

    const keyHandler = (e) => {
      if (e.key === 'Escape' && this.currentTool === 'polygon') {
        this._cancelPolygon(pageState);
      }
      if (e.key === 'Enter' && this.currentTool === 'polygon' && poly.points.length >= 3) {
        this._finalizePolygon(pageState, fc, pageIndex);
      }
    };
    document.addEventListener('keydown', keyHandler);
    pageState._keyHandler = keyHandler;
  }

  // ── Private: eraser ───────────────────────────────────────────────

  _eraseAt(fc, nativeEvent, pageIndex) {
    const target = fc.findTarget(nativeEvent, false);
    if (!target || target._helper) return;

    const meta = {
      action:    'removed',
      tool:      target.tool     || 'unknown',
      objectId:  target.objectId || generateUUID(),
      userId:    this.userId,
      timestamp: Date.now(),
      pageIndex,
    };
    fc.discardActiveObject();
    fc.remove(target);
    fc.renderAll();
    this._markDirty(pageIndex);
    this.onEvent(meta);
  }

  // ── Private: shape preview ────────────────────────────────────────

  _makeShapePreview(tool, start) {
    const base = {
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: 'transparent', selectable: false, evented: false,
      strokeUniform: true, _helper: true,
    };
    switch (tool) {
      case 'rectangle':
        return new fabric.Rect({ ...base, left: start.x, top: start.y, width: 0, height: 0 });
      case 'circle':
        return new fabric.Ellipse({ ...base, left: start.x, top: start.y, rx: 0, ry: 0, originX: 'left', originY: 'top' });
      case 'line':
      case 'arrow':
        return new fabric.Line([start.x, start.y, start.x, start.y], { ...base, fill: undefined });
      default:
        return null;
    }
  }

  _updateShapePreview(shape, tool, start, current) {
    if (tool === 'rectangle') {
      shape.set({
        left:   Math.min(start.x, current.x),
        top:    Math.min(start.y, current.y),
        width:  Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      });
    } else if (tool === 'circle') {
      shape.set({
        left: Math.min(start.x, current.x),
        top:  Math.min(start.y, current.y),
        rx:   Math.abs(current.x - start.x) / 2,
        ry:   Math.abs(current.y - start.y) / 2,
      });
    } else if (tool === 'line' || tool === 'arrow') {
      shape.set({ x2: current.x, y2: current.y });
    }
    shape.setCoords();
  }

  // ── Private: final shape creation ────────────────────────────────

  _makeFinalShape(tool, start, end) {
    const base = {
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: 'transparent', selectable: false, evented: false, strokeUniform: true,
    };

    switch (tool) {
      case 'rectangle':
        return new fabric.Rect({
          ...base,
          left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
        });
      case 'circle':
        return new fabric.Ellipse({
          ...base,
          left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
          rx: Math.abs(end.x - start.x) / 2, ry: Math.abs(end.y - start.y) / 2,
          originX: 'left', originY: 'top',
        });
      case 'line':
        return new fabric.Line([start.x, start.y, end.x, end.y], {
          ...base, fill: undefined, strokeLineCap: 'round',
        });
      case 'arrow':
        return this._makeArrow(start, end, base);
      default:
        return null;
    }
  }

  _makeArrow(start, end, baseStyle) {
    const dx  = end.x - start.x;
    const dy  = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < MIN_SIZE) return null;

    const ux   = dx / len,  uy = dy / len;
    const px   = -uy,       py = ux;
    const head = Math.max(ARROW_HEAD, this.strokeWidth * 4);

    const stopX = end.x - ux * head * 0.7;
    const stopY = end.y - uy * head * 0.7;
    const bx = end.x - ux * head,  by = end.y - uy * head;
    const lx = bx + px * head * 0.4, ly = by + py * head * 0.4;
    const rx = bx - px * head * 0.4, ry = by - py * head * 0.4;

    const d = `M ${start.x} ${start.y} L ${stopX} ${stopY} M ${lx} ${ly} L ${end.x} ${end.y} L ${rx} ${ry}`;

    return new fabric.Path(d, {
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: 'transparent', strokeLineCap: 'round', strokeLineJoin: 'round',
      strokeUniform: true, selectable: false, evented: false,
    });
  }

  _isValidShape(shape, tool) {
    if (!shape) return false;
    if (tool === 'rectangle') return (shape.width || 0) > MIN_SIZE || (shape.height || 0) > MIN_SIZE;
    if (tool === 'circle')    return (shape.rx    || 0) > MIN_SIZE || (shape.ry     || 0) > MIN_SIZE;
    if (tool === 'line') {
      const dx = (shape.x2 || 0) - (shape.x1 || 0);
      const dy = (shape.y2 || 0) - (shape.y1 || 0);
      return Math.hypot(dx, dy) > MIN_SIZE;
    }
    if (tool === 'arrow') return !!shape;
    return true;
  }

  // ── Private: polygon ──────────────────────────────────────────────

  _polygonClick(pageState, pageIndex, ptr, nativeEvent) {
    const { fc, poly } = pageState;
    const zoom = fc.getZoom();

    if (poly.active && poly.points.length >= 3) {
      const first = poly.points[0];
      const screenDist = Math.hypot(ptr.x - first.x, ptr.y - first.y) * zoom;
      if (screenDist < 18) {
        this._finalizePolygon(pageState, fc, pageIndex);
        return;
      }
    }

    poly.active = true;
    poly.points.push({ x: ptr.x, y: ptr.y });

    const r   = 4 / zoom;
    const dot = new fabric.Circle({
      left: ptr.x - r, top: ptr.y - r, radius: r,
      fill: this.strokeColor, stroke: '#fff', strokeWidth: 1 / zoom,
      selectable: false, evented: false, _helper: true,
    });
    fc.add(dot);
    poly.helpers.push(dot);

    if (poly.points.length > 1) {
      const prev = poly.points[poly.points.length - 2];
      const seg  = new fabric.Line([prev.x, prev.y, ptr.x, ptr.y], {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth,
        selectable: false, evented: false, _helper: true, strokeLineCap: 'round',
      });
      fc.add(seg);
      poly.helpers.push(seg);
    }

    if (!poly.rubberband) {
      poly.rubberband = new fabric.Line([ptr.x, ptr.y, ptr.x, ptr.y], {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth,
        strokeDashArray: [6 / zoom, 4 / zoom],
        selectable: false, evented: false, _helper: true,
      });
      fc.add(poly.rubberband);
    } else {
      poly.rubberband.set({ x1: ptr.x, y1: ptr.y, x2: ptr.x, y2: ptr.y });
    }

    fc.renderAll();

    if (poly.points.length === 3) {
      this._hintPolygonClose(fc, poly.points[0], zoom, pageState);
    }
  }

  _hintPolygonClose(fc, firstPt, zoom, pageState) {
    const r = 10 / zoom;
    const hint = new fabric.Circle({
      left: firstPt.x - r, top: firstPt.y - r, radius: r,
      fill: 'transparent', stroke: this.strokeColor,
      strokeWidth: 1.5 / zoom, strokeDashArray: [3 / zoom, 3 / zoom],
      selectable: false, evented: false, _helper: true,
    });
    fc.add(hint);
    pageState.poly.helpers.push(hint);
    fc.renderAll();
  }

  _finalizePolygon(pageState, fc, pageIndex) {
    const { poly } = pageState;
    if (poly.points.length < 3) { this._cancelPolygon(pageState); return; }

    poly.helpers.forEach((h) => fc.remove(h));
    if (poly.rubberband) fc.remove(poly.rubberband);

    const polygon = new fabric.Polygon(poly.points, {
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: 'transparent', strokeUniform: true,
      selectable: false, evented: false,
      objectCaching: false, strokeLineJoin: 'round',
    });

    this._attachMeta(polygon, 'polygon', pageIndex);
    polygon.selectable = (this.currentTool === 'select');

    fc.add(polygon);
    fc.renderAll();

    this.onEvent({
      action: 'added', tool: 'polygon',
      objectId: polygon.objectId, userId: this.userId,
      timestamp: polygon.timestamp, pageIndex,
    });

    poly.active = false; poly.points = []; poly.helpers = []; poly.rubberband = null;
  }

  _cancelPolygon(pageState) {
    const { fc, poly } = pageState;
    poly.helpers.forEach((h) => fc.remove(h));
    if (poly.rubberband) fc.remove(poly.rubberband);
    poly.active = false; poly.points = []; poly.helpers = []; poly.rubberband = null;
    fc.renderAll();
  }

  // ── Private: text tool ────────────────────────────────────────────

  _placeText(fc, ptr, pageIndex) {
    const itext = new fabric.IText('', {
      left: ptr.x, top: ptr.y,
      fontFamily: 'Inter, -apple-system, sans-serif',
      fontSize: 18, fill: this.strokeColor,
      selectable: true, evented: true, editable: true,
      cursorColor: this.strokeColor, padding: 4,
    });

    fc.add(itext);
    fc.setActiveObject(itext);
    itext.enterEditing();

    let committed = false;
    itext.on('editing:exited', () => {
      if (committed) return;
      committed = true;
      if (!itext.text || !itext.text.trim()) {
        fc.remove(itext);
        fc.renderAll();
        return;
      }
      this._attachMeta(itext, 'text', pageIndex);
      this.onEvent({
        action: 'added', tool: 'text',
        objectId: itext.objectId, userId: this.userId,
        timestamp: itext.timestamp, pageIndex,
      });
    });
  }

  // ── Private: metadata ─────────────────────────────────────────────

  _attachMeta(obj, tool, pageIndex) {
    obj.objectId   = generateUUID();
    obj.createdBy  = this.userId;
    obj.timestamp  = Date.now();
    obj.actionType = 'draw';
    obj.tool       = tool;
    obj.pageIndex  = pageIndex;
    // Mark this page dirty so toJSON() re-serialises it on next save
    this._dirtyPages.add(pageIndex);
  }

  /** Mark a page dirty from outside (e.g. eraser). */
  _markDirty(pageIndex) {
    this._dirtyPages.add(pageIndex);
  }
}
