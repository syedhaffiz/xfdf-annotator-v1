import {
  Canvas,
  Rect,
  Ellipse,
  Line,
  Path,
  Polygon,
  IText,
  Circle,
  FabricImage,
  FabricObject,
  PencilBrush,
} from 'fabric'
import type { TPointerEventInfo, TPointerEvent } from 'fabric'
import { generateUUID } from '../utils/utils'
import type { FabricCanvasJSON } from '../utils/xfdf'
import type { AnnotationCanvasOptions, AnnotationTool, AnnotationMode, ActivityEntry } from '../types/index'

// ── Custom fabric object properties ──────────────────────────────

interface AnnotationObject extends FabricObject {
  objectId?:   string
  createdBy?:  string
  timestamp?:  number
  actionType?: string
  tool?:       string
  pageIndex?:  number
  _helper?:    boolean
  // IText / text shapes
  text?:       string
  // Polygon shape
  points?:     Array<{ x: number; y: number }>
}

// ── Page state ────────────────────────────────────────────────────

interface PolyState {
  active:     boolean
  points:     Array<{ x: number; y: number }>
  helpers:    FabricObject[]
  rubberband: Line | null
}

interface DrawState {
  active: boolean
  start:  { x: number; y: number } | null
  shape:  FabricObject | null
}

interface EraseState { active: boolean }

interface PageState {
  fc:           Canvas
  baseW:        number
  baseH:        number
  poly:         PolyState
  draw:         DrawState
  erase:        EraseState
  _keyHandler?: (e: KeyboardEvent) => void
}

const CUSTOM_PROPS: string[] = ['objectId', 'createdBy', 'timestamp', 'actionType', 'tool', 'pageIndex']
const MIN_SIZE    = 4
const ARROW_HEAD  = 14

export class AnnotationCanvas {
  userId:         string
  onEvent:        (entry: ActivityEntry) => void
  onCommentPlace: (pageIndex: number, x: number, y: number, e: MouseEvent) => void

  private _pages:      Array<PageState | undefined>
  private _dirtyPages: Set<number>
  private _jsonCache:  Map<number, FabricCanvasJSON>

  currentTool: AnnotationTool = 'select'
  strokeColor  = '#e74c3c'
  strokeWidth  = 3
  mode:         AnnotationMode = 'edit'

  constructor({ userId, onEvent, onCommentPlace }: AnnotationCanvasOptions) {
    this.userId         = userId
    this.onEvent        = onEvent
    this.onCommentPlace = onCommentPlace ?? (() => { /* noop */ })
    this._pages      = []
    this._dirtyPages = new Set()
    this._jsonCache  = new Map()
  }

  // ── Page lifecycle ────────────────────────────────────────────────

  createCanvas(
    canvasEl: HTMLCanvasElement,
    baseW:    number,
    baseH:    number,
    pageIndex: number,
    scale:    number
  ): Canvas {
    const physW = Math.round(baseW * scale)
    const physH = Math.round(baseH * scale)

    const fc = new Canvas(canvasEl, {
      width:  physW,
      height: physH,
      selection: true,
      preserveObjectStacking: true,
    })

    // wrapperEl is properly typed as HTMLDivElement on SelectableCanvas in fabric 7
    fc.wrapperEl.style.cssText = 'position:absolute;top:0;left:0;'
    fc.setZoom(scale)

    const pageState: PageState = {
      fc, baseW, baseH,
      poly:  { active: false, points: [], helpers: [], rubberband: null },
      draw:  { active: false, start: null, shape: null },
      erase: { active: false },
    }

    this._pages[pageIndex] = pageState
    this._setupEvents(pageState, pageIndex)
    this._applyToolTo(fc)

    return fc
  }

  resize(pageIndex: number, newScale: number): void {
    const p = this._pages[pageIndex]
    if (!p) return
    p.fc.setZoom(newScale)
    p.fc.setDimensions({
      width:  Math.round(p.baseW * newScale),
      height: Math.round(p.baseH * newScale),
    })
    p.fc.renderAll()
  }

  destroy(): void {
    this._pages.forEach((p) => {
      if (!p) return
      if (p._keyHandler) document.removeEventListener('keydown', p._keyHandler)
      p.fc.dispose()
    })
    this._pages      = []
    this._dirtyPages = new Set()
    this._jsonCache  = new Map()
  }

  // ── Tool / style control ──────────────────────────────────────────

  setTool(tool: AnnotationTool): void {
    this.currentTool = tool
    this._pages.forEach((p) => {
      if (!p) return
      this._cancelPolygon(p)
      this._applyToolTo(p.fc)
    })
  }

  setMode(mode: AnnotationMode): void {
    this.mode = mode
    this._pages.forEach((p) => {
      if (!p) return
      this._cancelPolygon(p)
      this._applyModeTo(p.fc)
    })
  }

  setColor(color: string): void {
    this.strokeColor = color
    this._pages.forEach((p) => {
      if (!p) return
      if (p.fc.isDrawingMode && p.fc.freeDrawingBrush) {
        p.fc.freeDrawingBrush.color = color
      }
    })
  }

  setStrokeWidth(w: number): void {
    this.strokeWidth = w
    this._pages.forEach((p) => {
      if (!p) return
      if (p.fc.isDrawingMode && p.fc.freeDrawingBrush) {
        p.fc.freeDrawingBrush.width = w
      }
    })
  }

  insertImage(fileOrUrl: File | string, pageIndex: number): void {
    const p = this._pages[pageIndex]
    if (!p) return
    if (typeof fileOrUrl === 'string') {
      void this._placeImage(fileOrUrl, p, pageIndex)
    } else {
      const reader   = new FileReader()
      reader.onload  = (e) => { void this._placeImage(e.target?.result as string, p, pageIndex) }
      reader.onerror = () => console.error('Failed to read image file')
      reader.readAsDataURL(fileOrUrl)
    }
  }

  private async _placeImage(dataUrl: string, p: PageState, pageIndex: number): Promise<void> {
    try {
      const img = await FabricImage.fromURL(dataUrl)
      const maxW = p.baseW * 0.4
      if ((img.width ?? 0) > maxW) img.scale(maxW / (img.width ?? 1))

      img.set({
        left: (p.baseW - img.getScaledWidth())  / 2,
        top:  (p.baseH - img.getScaledHeight()) / 2,
      })

      this._attachMeta(img as AnnotationObject, 'image', pageIndex)
      img.selectable = this.mode === 'edit' && this.currentTool === 'select'
      img.evented    = this.mode === 'edit'

      p.fc.add(img)
      p.fc.setActiveObject(img)
      p.fc.renderAll()

      const meta = img as AnnotationObject
      const imgEntry: ActivityEntry = {
        id:          meta.objectId ?? generateUUID(),
        description: `Inserted image on page ${pageIndex + 1}`,
        action:      'added',
        tool:        'image',
        userId:      this.userId,
        timestamp:   meta.timestamp ?? Date.now(),
        pageIndex,
      }
      if (meta.objectId !== undefined) imgEntry.objectId = meta.objectId
      this.onEvent(imgEntry)
    } catch (err) {
      console.error('Failed to load image:', err)
    }
  }

  // ── Serialization ─────────────────────────────────────────────────

  toJSON(): Array<{ pageIndex: number; canvasJSON: FabricCanvasJSON | null }> {
    return this._pages.map((p, i) => {
      if (!p) return { pageIndex: i, canvasJSON: null }
      if (!this._dirtyPages.has(i) && this._jsonCache.has(i)) {
        return { pageIndex: i, canvasJSON: this._jsonCache.get(i) ?? null }
      }
      // fabric 7: toJSON() takes no args; use toObject(propertiesToInclude) for custom props
      const json = p.fc.toObject(CUSTOM_PROPS) as FabricCanvasJSON
      this._jsonCache.set(i, json)
      this._dirtyPages.delete(i)
      return { pageIndex: i, canvasJSON: json }
    })
  }

  async loadFromData(pagesData: Array<{ pageIndex: number; canvasJSON: FabricCanvasJSON }>): Promise<void> {
    this._dirtyPages.clear()
    this._jsonCache.clear()

    const promises = pagesData.map(async ({ pageIndex, canvasJSON }) => {
      if (!canvasJSON) return
      const p = this._pages[pageIndex]
      if (!p) return

      await p.fc.loadFromJSON(
        canvasJSON as unknown as Record<string, unknown>,
        <T>(serialized: Record<string, unknown>, instance: T | undefined) => {
          if (!instance) return
          CUSTOM_PROPS.forEach((prop) => {
            if (serialized[prop] !== undefined) {
              (instance as unknown as Record<string, unknown>)[prop] = serialized[prop]
            }
          })
        }
      )

      const isEdit = this.mode === 'edit'
      p.fc.getObjects().forEach((obj) => {
        obj.selectable = isEdit && this.currentTool === 'select'
        obj.evented    = isEdit
      })
      p.fc.renderAll()
      this._jsonCache.set(pageIndex, canvasJSON)
    })
    await Promise.all(promises)
  }

  // ── Private: tool application ─────────────────────────────────────

  private _applyToolTo(fc: Canvas): void {
    if (this.mode === 'view') { this._applyModeTo(fc); return }

    const tool    = this.currentTool
    const isShape = ['rectangle', 'circle', 'line', 'arrow', 'polygon'].includes(tool)

    fc.isDrawingMode = (tool === 'freehand')
    fc.selection     = (tool === 'select')

    if (tool === 'freehand') {
      fc.freeDrawingBrush       = new PencilBrush(fc)
      fc.freeDrawingBrush.color = this.strokeColor
      fc.freeDrawingBrush.width = this.strokeWidth
      fc.defaultCursor          = 'crosshair'
      fc.hoverCursor            = 'crosshair'
    } else if (isShape || tool === 'text' || tool === 'comment') {
      fc.defaultCursor = 'crosshair'
      fc.hoverCursor   = 'crosshair'
    } else if (tool === 'eraser') {
      fc.defaultCursor =
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' " +
        "viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='2'%3E%3Cpath d='M20 20H7L3 16l10-10 7 7-3.5 3.5'/%3E" +
        "%3Cpath d='M6 11l7 7'/%3E%3C/svg%3E\") 4 20, crosshair"
      fc.hoverCursor = 'crosshair'
    } else {
      fc.defaultCursor = 'default'
      fc.hoverCursor   = 'move'
    }

    fc.getObjects().forEach((obj) => {
      if ((obj as AnnotationObject)._helper) return
      obj.selectable = (tool === 'select')
      obj.evented    = (tool === 'select' || tool === 'eraser')
    })
    fc.renderAll()
  }

  private _applyModeTo(fc: Canvas): void {
    fc.isDrawingMode = false
    fc.selection     = false
    fc.getObjects().forEach((obj) => {
      if ((obj as AnnotationObject)._helper) return
      obj.selectable = false
      obj.evented    = false
    })
    fc.renderAll()
  }

  // ── Private: events ───────────────────────────────────────────────

  private _setupEvents(pageState: PageState, pageIndex: number): void {
    const { fc, poly, draw, erase } = pageState

    fc.on('path:created', (e: { path: FabricObject }) => {
      const path = e.path as AnnotationObject
      if (!path) return
      this._attachMeta(path, 'freehand', pageIndex)
      path.selectable = (this.currentTool === 'select')
      path.evented    = true
      this._fireEvent('added', 'freehand', path, pageIndex)
    })

    fc.on('mouse:down', (opt: TPointerEventInfo) => {
      if (this.mode === 'view') return
      const ptr = opt.scenePoint

      switch (this.currentTool) {
        case 'eraser':
          erase.active = true
          this._eraseAt(fc, opt.e, pageIndex)
          break
        case 'rectangle':
        case 'circle':
        case 'line':
        case 'arrow':
          draw.active = true
          draw.start  = { x: ptr.x, y: ptr.y }
          draw.shape  = this._makeShapePreview(this.currentTool, draw.start)
          if (draw.shape) fc.add(draw.shape)
          break
        case 'polygon':
          this._polygonClick(pageState, pageIndex, { x: ptr.x, y: ptr.y }, opt.e as MouseEvent)
          break
        case 'text':
          if ((opt.target as AnnotationObject | undefined)?.type === 'i-text') break
          this._placeText(fc, { x: ptr.x, y: ptr.y }, pageIndex)
          break
        case 'comment':
          if (opt.target) break
          this.onCommentPlace(pageIndex, ptr.x, ptr.y, opt.e as MouseEvent)
          break
      }
    })

    fc.on('mouse:move', (opt: TPointerEventInfo) => {
      if (this.mode === 'view') return

      if (this.currentTool === 'eraser' && erase.active) {
        this._eraseAt(fc, opt.e, pageIndex)
        return
      }

      if (!draw.active || !draw.shape) {
        if (this.currentTool === 'polygon' && poly.active && poly.rubberband) {
          const ptr = opt.scenePoint
          poly.rubberband.set({ x2: ptr.x, y2: ptr.y })
          fc.renderAll()
        }
        return
      }

      const ptr = opt.scenePoint
      if (draw.start) this._updateShapePreview(draw.shape, this.currentTool, draw.start, { x: ptr.x, y: ptr.y })
      fc.renderAll()
    })

    fc.on('mouse:up', (opt: TPointerEventInfo) => {
      if (this.mode === 'view') return

      erase.active = false
      if (!draw.active) return
      draw.active = false

      const ptr   = opt.scenePoint
      if (draw.shape) { fc.remove(draw.shape); draw.shape = null }

      const tool  = this.currentTool
      const start = draw.start
      draw.start  = null

      if (!(['rectangle', 'circle', 'line', 'arrow'] as AnnotationTool[]).includes(tool)) return
      if (!start) return

      const finalShape = this._makeFinalShape(tool, start, { x: ptr.x, y: ptr.y })
      if (!finalShape || !this._isValidShape(finalShape, tool)) return

      this._attachMeta(finalShape as AnnotationObject, tool, pageIndex)
      finalShape.selectable = (tool === 'select')
      finalShape.evented    = true

      fc.add(finalShape)
      fc.renderAll()

      this._fireEvent('added', tool, finalShape as AnnotationObject, pageIndex)
    })

    const keyHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this.currentTool === 'polygon') this._cancelPolygon(pageState)
      if (e.key === 'Enter' && this.currentTool === 'polygon' && poly.points.length >= 3) {
        this._finalizePolygon(pageState, fc, pageIndex)
      }
    }
    document.addEventListener('keydown', keyHandler)
    pageState._keyHandler = keyHandler
  }

  // ── Private: eraser ───────────────────────────────────────────────

  private _eraseAt(fc: Canvas, nativeEvent: TPointerEvent, pageIndex: number): void {
    const result = fc.findTarget(nativeEvent)
    const target = result?.target as AnnotationObject | undefined
    if (!target || target._helper) return

    const meta: ActivityEntry = {
      id:          target.objectId ?? generateUUID(),
      description: `Erased on page ${pageIndex + 1}`,
      action:      'removed',
      tool:        target.tool ?? 'eraser',
      userId:      this.userId,
      timestamp:   Date.now(),
      pageIndex,
    }
    if (target.objectId !== undefined) meta.objectId = target.objectId

    fc.discardActiveObject()
    fc.remove(target)
    fc.renderAll()
    this._markDirty(pageIndex)
    this.onEvent(meta)
  }

  // ── Private: shape preview ────────────────────────────────────────

  private _makeShapePreview(
    tool:  AnnotationTool,
    start: { x: number; y: number }
  ): FabricObject | null {
    const base = {
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: 'transparent', selectable: false, evented: false,
      strokeUniform: true, _helper: true,
    }
    switch (tool) {
      case 'rectangle':
        return new Rect({ ...base, left: start.x, top: start.y, width: 0, height: 0 })
      case 'circle':
        return new Ellipse({ ...base, left: start.x, top: start.y, rx: 0, ry: 0, originX: 'left', originY: 'top' })
      case 'line':
      case 'arrow':
        return new Line([start.x, start.y, start.x, start.y], { ...base, fill: null })
      default:
        return null
    }
  }

  private _updateShapePreview(
    shape:   FabricObject,
    tool:    AnnotationTool,
    start:   { x: number; y: number },
    current: { x: number; y: number }
  ): void {
    if (tool === 'rectangle') {
      shape.set({
        left:   Math.min(start.x, current.x),
        top:    Math.min(start.y, current.y),
        width:  Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      })
    } else if (tool === 'circle') {
      const ellipse = shape as Ellipse
      ellipse.set({
        left: Math.min(start.x, current.x),
        top:  Math.min(start.y, current.y),
        rx:   Math.abs(current.x - start.x) / 2,
        ry:   Math.abs(current.y - start.y) / 2,
      })
    } else if (tool === 'line' || tool === 'arrow') {
      (shape as Line).set({ x2: current.x, y2: current.y })
    }
    shape.setCoords()
  }

  // ── Private: final shape ──────────────────────────────────────────

  private _makeFinalShape(
    tool:  AnnotationTool,
    start: { x: number; y: number },
    end:   { x: number; y: number }
  ): FabricObject | null {
    const base = {
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: 'transparent', selectable: false, evented: false, strokeUniform: true,
    }
    switch (tool) {
      case 'rectangle':
        return new Rect({
          ...base,
          left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
          width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
        })
      case 'circle':
        return new Ellipse({
          ...base,
          left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
          rx: Math.abs(end.x - start.x) / 2, ry: Math.abs(end.y - start.y) / 2,
          originX: 'left', originY: 'top',
        })
      case 'line':
        return new Line([start.x, start.y, end.x, end.y], {
          ...base, fill: null, strokeLineCap: 'round',
        })
      case 'arrow':
        return this._makeArrow(start, end)
      default:
        return null
    }
  }

  private _makeArrow(
    start: { x: number; y: number },
    end:   { x: number; y: number }
  ): FabricObject | null {
    const dx  = end.x - start.x
    const dy  = end.y - start.y
    const len = Math.hypot(dx, dy)
    if (len < MIN_SIZE) return null

    const ux   = dx / len,  uy = dy / len
    const px   = -uy,       py = ux
    const head = Math.max(ARROW_HEAD, this.strokeWidth * 4)

    const stopX = end.x - ux * head * 0.7
    const stopY = end.y - uy * head * 0.7
    const bx = end.x - ux * head,  by = end.y - uy * head
    const lx = bx + px * head * 0.4, ly = by + py * head * 0.4
    const rx = bx - px * head * 0.4, ry = by - py * head * 0.4

    const d = `M ${start.x} ${start.y} L ${stopX} ${stopY} M ${lx} ${ly} L ${end.x} ${end.y} L ${rx} ${ry}`
    return new Path(d, {
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: 'transparent', strokeLineCap: 'round', strokeLineJoin: 'round',
      strokeUniform: true, selectable: false, evented: false,
    })
  }

  private _isValidShape(shape: FabricObject, tool: AnnotationTool): boolean {
    if (!shape) return false
    if (tool === 'rectangle') return (shape.width  ?? 0) > MIN_SIZE || (shape.height ?? 0) > MIN_SIZE
    if (tool === 'circle') {
      const e = shape as Ellipse
      return (e.rx ?? 0) > MIN_SIZE || (e.ry ?? 0) > MIN_SIZE
    }
    if (tool === 'line') {
      const l = shape as Line
      const dx = (l.x2 ?? 0) - (l.x1 ?? 0)
      const dy = (l.y2 ?? 0) - (l.y1 ?? 0)
      return Math.hypot(dx, dy) > MIN_SIZE
    }
    return true
  }

  // ── Private: polygon ──────────────────────────────────────────────

  private _polygonClick(
    pageState:    PageState,
    pageIndex:    number,
    ptr:          { x: number; y: number },
    _nativeEvent: MouseEvent
  ): void {
    const { fc, poly } = pageState
    const zoom = fc.getZoom()

    if (poly.active && poly.points.length >= 3) {
      const first = poly.points[0]
      const screenDist = Math.hypot(ptr.x - first.x, ptr.y - first.y) * zoom
      if (screenDist < 18) {
        this._finalizePolygon(pageState, fc, pageIndex)
        return
      }
    }

    poly.active = true
    poly.points.push({ x: ptr.x, y: ptr.y })

    const dotR = 4 / zoom
    const dot  = new Circle({
      left: ptr.x - dotR, top: ptr.y - dotR, radius: dotR,
      fill: this.strokeColor, stroke: '#fff', strokeWidth: 1 / zoom,
      selectable: false, evented: false,
    });
    (dot as AnnotationObject)._helper = true
    fc.add(dot)
    poly.helpers.push(dot)

    if (poly.points.length > 1) {
      const prev = poly.points[poly.points.length - 2]
      const seg  = new Line([prev.x, prev.y, ptr.x, ptr.y], {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth,
        selectable: false, evented: false, strokeLineCap: 'round',
      });
      (seg as AnnotationObject)._helper = true
      fc.add(seg)
      poly.helpers.push(seg)
    }

    if (!poly.rubberband) {
      poly.rubberband = new Line([ptr.x, ptr.y, ptr.x, ptr.y], {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth,
        strokeDashArray: [6 / zoom, 4 / zoom],
        selectable: false, evented: false,
      });
      (poly.rubberband as AnnotationObject)._helper = true
      fc.add(poly.rubberband)
    } else {
      poly.rubberband.set({ x1: ptr.x, y1: ptr.y, x2: ptr.x, y2: ptr.y })
    }

    fc.renderAll()

    if (poly.points.length === 3) {
      this._hintPolygonClose(fc, poly.points[0], zoom, pageState)
    }
  }

  private _hintPolygonClose(
    fc:       Canvas,
    firstPt:  { x: number; y: number },
    zoom:     number,
    pageState: PageState
  ): void {
    const r    = 10 / zoom
    const hint = new Circle({
      left: firstPt.x - r, top: firstPt.y - r, radius: r,
      fill: 'transparent', stroke: this.strokeColor,
      strokeWidth: 1.5 / zoom, strokeDashArray: [3 / zoom, 3 / zoom],
      selectable: false, evented: false,
    });
    (hint as AnnotationObject)._helper = true
    fc.add(hint)
    pageState.poly.helpers.push(hint)
    fc.renderAll()
  }

  private _finalizePolygon(pageState: PageState, fc: Canvas, pageIndex: number): void {
    const { poly } = pageState
    if (poly.points.length < 3) { this._cancelPolygon(pageState); return }

    poly.helpers.forEach((h) => fc.remove(h))
    if (poly.rubberband) fc.remove(poly.rubberband)

    const polygon = new Polygon(poly.points, {
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: 'transparent', strokeUniform: true,
      selectable: false, evented: false,
      objectCaching: false, strokeLineJoin: 'round',
    })

    this._attachMeta(polygon as AnnotationObject, 'polygon', pageIndex)
    polygon.selectable = (this.currentTool === 'select')

    fc.add(polygon)
    fc.renderAll()

    this._fireEvent('added', 'polygon', polygon as AnnotationObject, pageIndex)

    poly.active = false; poly.points = []; poly.helpers = []; poly.rubberband = null
  }

  private _cancelPolygon(pageState: PageState): void {
    const { fc, poly } = pageState
    poly.helpers.forEach((h) => fc.remove(h))
    if (poly.rubberband) fc.remove(poly.rubberband)
    poly.active = false; poly.points = []; poly.helpers = []; poly.rubberband = null
    fc.renderAll()
  }

  // ── Private: text tool ────────────────────────────────────────────

  private _placeText(fc: Canvas, ptr: { x: number; y: number }, pageIndex: number): void {
    const itext = new IText('', {
      left: ptr.x, top: ptr.y,
      fontFamily: 'Inter, -apple-system, sans-serif',
      fontSize: 18, fill: this.strokeColor,
      selectable: true, evented: true, editable: true,
      cursorColor: this.strokeColor, padding: 4,
    })

    fc.add(itext)
    fc.setActiveObject(itext)
    itext.enterEditing()

    let committed = false
    itext.on('editing:exited', () => {
      if (committed) return
      committed = true
      if (!itext.text || !itext.text.trim()) {
        fc.remove(itext)
        fc.renderAll()
        return
      }
      this._attachMeta(itext as AnnotationObject, 'text', pageIndex)
      this._fireEvent('added', 'text', itext as AnnotationObject, pageIndex)
    })
  }

  // ── Private: metadata ─────────────────────────────────────────────

  private _attachMeta(obj: AnnotationObject, tool: string, pageIndex: number): void {
    obj.objectId   = generateUUID()
    obj.createdBy  = this.userId
    obj.timestamp  = Date.now()
    obj.actionType = 'draw'
    obj.tool       = tool
    obj.pageIndex  = pageIndex
    this._dirtyPages.add(pageIndex)
  }

  private _markDirty(pageIndex: number): void {
    this._dirtyPages.add(pageIndex)
  }

  private _fireEvent(
    action:    string,
    tool:      string,
    obj:       AnnotationObject,
    pageIndex: number
  ): void {
    const id = obj.objectId ?? generateUUID()
    const base: ActivityEntry = {
      id,
      description: `${action === 'added' ? 'Drew' : 'Removed'} ${tool} on page ${pageIndex + 1}`,
      action,
      tool,
      userId:    this.userId,
      timestamp: obj.timestamp ?? Date.now(),
      pageIndex,
    }
    if (obj.objectId !== undefined) base.objectId = obj.objectId
    this.onEvent(base)
  }
}
