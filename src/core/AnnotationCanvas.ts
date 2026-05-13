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
import type { AnnotationCanvasOptions, AnnotationTool, AnnotationMode, ActivityEntry, User } from '../types/index'

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

/**
 * Special line styles — non-dash rendering modes.
 * `'arc'` produces a "revision cloud" border whose perimeter is a chain of
 * outward-facing arcs. Anything else falls back to a regular straight stroke
 * (optionally with a dash pattern).
 */
export type LineStyle = 'solid' | 'arc'

/** Inline arc-radius for cloud-style strokes (in fabric design-space units). */
const ARC_RADIUS = 6

// ── Arc-cloud SVG path generators ─────────────────────────────────
//
// Each helper returns SVG path-data tracing the requested geometry as a
// chain of outward-bulging quadrant arcs. Path data is in *local* coords
// (origin at 0,0); callers position the resulting fabric.Path object via
// setPositionByOrigin so a rotated/flipped/scaled source shape rebuilds
// at exactly the same centre point.

function _arcEdge(
  segs: string[], x1: number, y1: number, x2: number, y2: number,
  radius: number, sweep: 0 | 1,
): void {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy)
  const n   = Math.max(1, Math.round(len / (radius * 2)))
  for (let i = 1; i <= n; i++) {
    const t  = i / n
    const ex = (x1 + t * dx).toFixed(2)
    const ey = (y1 + t * dy).toFixed(2)
    segs.push(`A ${radius} ${radius} 0 0 ${sweep} ${ex} ${ey}`)
  }
}

function rectArcPath(w: number, h: number, radius = ARC_RADIUS): string {
  const segs: string[] = ['M 0 0']
  // Walk clockwise; sweep=0 makes arcs bulge outward.
  _arcEdge(segs, 0, 0, w, 0, radius, 0)
  _arcEdge(segs, w, 0, w, h, radius, 0)
  _arcEdge(segs, w, h, 0, h, radius, 0)
  _arcEdge(segs, 0, h, 0, 0, radius, 0)
  segs.push('Z')
  return segs.join(' ')
}

function lineArcPath(dx: number, dy: number, radius = ARC_RADIUS): string {
  const segs: string[] = ['M 0 0']
  _arcEdge(segs, 0, 0, dx, dy, radius, 1)
  return segs.join(' ')
}

function polygonArcPath(
  points: ReadonlyArray<{ x: number; y: number }>, radius = ARC_RADIUS,
): string {
  if (points.length < 2) return ''
  const minX = Math.min(...points.map(p => p.x))
  const minY = Math.min(...points.map(p => p.y))
  const local = points.map(p => ({ x: p.x - minX, y: p.y - minY }))
  const segs: string[] = [`M ${local[0].x.toFixed(2)} ${local[0].y.toFixed(2)}`]
  for (let i = 0; i < local.length - 1; i++) {
    _arcEdge(segs, local[i].x, local[i].y, local[i + 1].x, local[i + 1].y, radius, 0)
  }
  _arcEdge(
    segs,
    local[local.length - 1].x, local[local.length - 1].y,
    local[0].x,                  local[0].y,
    radius, 0,
  )
  segs.push('Z')
  return segs.join(' ')
}

export class AnnotationCanvas {
  user:           User
  onEvent:        (entry: ActivityEntry) => void
  onCommentPlace: (pageIndex: number, x: number, y: number, e: MouseEvent) => void

  /** @deprecated read `user.id` instead. */
  get userId(): string { return this.user.id }

  private _pages:      Array<PageState | undefined>
  private _dirtyPages: Set<number>
  private _jsonCache:  Map<number, FabricCanvasJSON>

  currentTool: AnnotationTool = 'select'
  strokeColor  = '#e74c3c'
  strokeWidth  = 3
  mode:         AnnotationMode = 'edit'

  // ── Fill / dash / line-style state ────────────────────────────────
  /** Hex fill colour applied to newly-drawn fillable shapes. */
  fillColor   = '#4a90e2'
  /** Fill opacity 0–1. 0 (default) means "no fill" — stroke only. */
  fillOpacity = 0
  /** strokeDashArray applied to new strokable shapes ([] = solid). */
  dashArray:  number[] = []
  /** Special non-dash rendering style. `'arc'` triggers cloud-border substitution. */
  lineStyle:  LineStyle = 'solid'

  constructor({ user, onEvent, onCommentPlace }: AnnotationCanvasOptions) {
    this.user           = user
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

  /** Hex fill colour for new fillable shapes (rect, ellipse, polygon, …). */
  setFillColor(color: string): void {
    this.fillColor = color
    this._applyFillToSelection()
  }

  /**
   * Fill opacity 0–1 for new fillable shapes. `0` (default) is treated as
   * "no fill" — the resulting Fabric object gets `fill: 'transparent'`.
   */
  setFillOpacity(opacity: number): void {
    this.fillOpacity = Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 0))
    this._applyFillToSelection()
  }

  /** Stroke dash pattern for new strokable shapes. `[]` (or omitted) = solid. */
  setDashArray(arr: number[]): void {
    this.dashArray = Array.isArray(arr) ? [...arr] : []
  }

  /**
   * Line rendering style for new shapes/lines/polygons.
   *  - `'solid'` (default) — regular straight stroke, optionally dashed.
   *  - `'arc'`             — cloud-border: perimeter is a chain of arcs.
   */
  setLineStyle(style: LineStyle): void { this.lineStyle = style }

  /** Compute the CSS fill string from fillColor + fillOpacity. */
  private _computeFill(): string {
    if (this.fillOpacity <= 0) return 'transparent'
    const hex = this.fillColor
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return 'transparent'
    return `rgba(${r},${g},${b},${this.fillOpacity})`
  }

  /** strokeDashArray value for new objects — null when solid. */
  private _activeDash(): number[] | null {
    return this.dashArray.length > 0 ? [...this.dashArray] : null
  }

  private readonly FILL_EXEMPT = new Set(['line', 'arrow', 'freehand', 'text', 'image', 'comment'])

  /** Apply the current fill to any selected fillable shape on any page. */
  private _applyFillToSelection(): void {
    const fill = this._computeFill()
    this._pages.forEach((p, pageIndex) => {
      if (!p) return
      const obj = p.fc.getActiveObject() as AnnotationObject | undefined
      if (!obj || obj._helper || this.FILL_EXEMPT.has(obj.tool ?? '')) return
      obj.set({ fill })
      p.fc.renderAll()
      this._markDirty(pageIndex)
      this._fireEvent('modified', obj.tool ?? 'select', obj, pageIndex)
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

  insertImageAt(fileOrUrl: File | string, pageIndex: number, x: number, y: number): void {
    const p = this._pages[pageIndex]
    if (!p) return
    if (typeof fileOrUrl === 'string') {
      void this._placeImage(fileOrUrl, p, pageIndex, x, y)
    } else {
      const reader   = new FileReader()
      reader.onload  = (e) => { void this._placeImage(e.target?.result as string, p, pageIndex, x, y) }
      reader.onerror = () => console.error('Failed to read image file')
      reader.readAsDataURL(fileOrUrl)
    }
  }

  private async _placeImage(dataUrl: string, p: PageState, pageIndex: number, cx?: number, cy?: number): Promise<void> {
    try {
      const img = await FabricImage.fromURL(dataUrl)
      const maxW = p.baseW * 0.4
      if ((img.width ?? 0) > maxW) img.scale(maxW / (img.width ?? 1))

      const w = img.getScaledWidth()
      const h = img.getScaledHeight()
      img.set({
        left: cx !== undefined ? cx - w / 2 : (p.baseW - w) / 2,
        top:  cy !== undefined ? cy - h / 2 : (p.baseH - h) / 2,
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
        userId:      this.user.id,
        userName:    this.user.displayName,
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
      // Freehand strokes inherit the active dash pattern. Fill is left
      // untouched (freehand is a stroke, not a closed shape).
      const dash = this._activeDash()
      if (dash) (path as FabricObject).set({ strokeDashArray: dash })
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

    fc.on('object:modified', (e: { target?: FabricObject }) => {
      const obj = e.target as AnnotationObject | undefined
      if (!obj || obj._helper) return
      this._markDirty(pageIndex)
      this._fireEvent('modified', obj.tool ?? 'select', obj, pageIndex)
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
      userId:      this.user.id,
      userName:    this.user.displayName,
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
    // Preview shows the chosen stroke/fill/dash so the user has a live
    // sense of the final shape. We deliberately *don't* swap to arc-cloud
    // during the preview — it's regenerated continuously on mouse-move
    // and would be expensive to keep rebuilding. The swap happens once at
    // mouse-up via `_makeFinalShape`.
    const base = {
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill: this._computeFill(),
      strokeDashArray: this._activeDash(),
      objectCaching: false,
      selectable: false, evented: false,
      strokeUniform: true, _helper: true,
    }
    switch (tool) {
      case 'rectangle':
        return new Rect({ ...base, left: start.x, top: start.y, width: 0, height: 0, originX: 'left', originY: 'top' })
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
      const dw = current.x - start.x
      const dh = current.y - start.y
      shape.set({
        left:   dw >= 0 ? start.x : current.x,
        top:    dh >= 0 ? start.y : current.y,
        width:  Math.abs(dw),
        height: Math.abs(dh),
        originX: 'left',
        originY: 'top',
      })
    } else if (tool === 'circle') {
      const rx = Math.abs(current.x - start.x)
      const ry = Math.abs(current.y - start.y)
      ;(shape as Ellipse).set({
        left: start.x - rx,
        top:  start.y - ry,
        rx,
        ry,
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
    const fill = this._computeFill()
    const dash = this._activeDash()
    const base = {
      stroke: this.strokeColor, strokeWidth: this.strokeWidth,
      fill,
      strokeDashArray: dash,
      selectable: false, evented: false, strokeUniform: true,
    }

    // ── Arc-cloud line style ────────────────────────────────────────
    // Replace the natural rect/line geometry with a Fabric.Path whose
    // perimeter is a chain of outward-bulging arcs. We emit local-coord
    // path data and centre the result on the source bounding box, so
    // origin/scale/rotation quirks don't shift the result around.
    if (this.lineStyle === 'arc' && (tool === 'rectangle' || tool === 'line')) {
      const minX = Math.min(start.x, end.x)
      const minY = Math.min(start.y, end.y)
      const w    = Math.abs(end.x - start.x)
      const h    = Math.abs(end.y - start.y)
      const cx   = minX + w / 2
      const cy   = minY + h / 2

      const pathData = tool === 'rectangle'
        ? rectArcPath(w, h)
        : lineArcPath(end.x - start.x, end.y - start.y)

      if (!pathData) return null
      const arc = new Path(pathData, {
        ...base,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      })
      arc.setPositionByOrigin({ x: cx, y: cy } as never, 'center', 'center')
      arc.setCoords()
      return arc
    }

    switch (tool) {
      case 'rectangle': {
        const dw = end.x - start.x
        const dh = end.y - start.y
        return new Rect({
          ...base,
          left:   dw >= 0 ? start.x : end.x,
          top:    dh >= 0 ? start.y : end.y,
          width:  Math.abs(dw),
          height: Math.abs(dh),
          originX: 'left', originY: 'top',
        })
      }
      case 'circle': {
        const rx = Math.abs(end.x - start.x)
        const ry = Math.abs(end.y - start.y)
        return new Ellipse({
          ...base,
          left: start.x - rx,
          top:  start.y - ry,
          rx, ry,
          originX: 'left', originY: 'top',
        })
      }
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
      fill: 'transparent',
      strokeDashArray: this._activeDash(),
      strokeLineCap: 'round', strokeLineJoin: 'round',
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

    const fill = this._computeFill()
    const dash = this._activeDash()

    let finalShape: FabricObject

    if (this.lineStyle === 'arc') {
      // Arc-cloud border: emit local-coord arc-chain path, centre the
      // resulting Path on the polygon's bounding-box centre.
      const minX = Math.min(...poly.points.map(p => p.x))
      const maxX = Math.max(...poly.points.map(p => p.x))
      const minY = Math.min(...poly.points.map(p => p.y))
      const maxY = Math.max(...poly.points.map(p => p.y))
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2

      const pathData = polygonArcPath(poly.points)
      const arc = new Path(pathData, {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth,
        fill, strokeDashArray: dash,
        strokeLineCap: 'round', strokeLineJoin: 'round',
        strokeUniform: true,
        selectable: false, evented: false,
      })
      arc.setPositionByOrigin({ x: cx, y: cy } as never, 'center', 'center')
      arc.setCoords()
      finalShape = arc
    } else {
      finalShape = new Polygon(poly.points, {
        stroke: this.strokeColor, strokeWidth: this.strokeWidth,
        fill, strokeDashArray: dash, strokeUniform: true,
        selectable: false, evented: false,
        objectCaching: false, strokeLineJoin: 'round',
      })
    }

    this._attachMeta(finalShape as AnnotationObject, 'polygon', pageIndex)
    finalShape.selectable = (this.currentTool === 'select')

    fc.add(finalShape)
    fc.renderAll()

    this._fireEvent('added', 'polygon', finalShape as AnnotationObject, pageIndex)

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
    obj.createdBy  = this.user.id
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
      userId:    this.user.id,
      userName:  this.user.displayName,
      timestamp: obj.timestamp ?? Date.now(),
      pageIndex,
    }
    if (obj.objectId !== undefined) base.objectId = obj.objectId
    this.onEvent(base)
  }
}
