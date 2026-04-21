/**
 * XFDF (XML Forms Data Format) serialiser / deserialiser.
 * Standard:  ISO 19444-1 / Adobe XFDF Specification
 * Extension: http://xfdf-annotator.example.com/ext/1.0  (ext:*)
 */

import type { ActivityEntry } from '../types/index'

const XFDF_NS = 'http://ns.adobe.com/xfdf/'
const EXT_NS  = 'http://xfdf-annotator.example.com/ext/1.0'

// ── Internal data shapes (Fabric-serialized objects) ──────────────

interface FabricPoint { x: number; y: number }

interface FabricPathCmd extends Array<string | number> {
  0: string
}

interface FabricSerializedObject {
  tool?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  objectId?: string
  timestamp?: number
  path?: FabricPathCmd[]
  left?: number
  top?: number
  width?: number
  height?: number
  rx?: number
  ry?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  points?: FabricPoint[]
  text?: string
  fontSize?: number
}

export interface FabricCanvasJSON {
  version?: string
  objects: FabricSerializedObject[]
}

export interface XFDFPageInput {
  pageIndex: number
  pageHPts: number
  canvasJSON: FabricCanvasJSON | null
}

export interface XFDFCommentMessage {
  id: string | null
  userId: string | null
  text: string | null
  timestamp: number
}

export interface XFDFCommentData {
  id: string | null
  pageIndex: number
  baseX: number
  baseY: number
  number: number
  resolved: boolean
  messages: XFDFCommentMessage[]
}

export interface XFDFCommentsState {
  counter?: number
  comments?: XFDFCommentData[]
}

export interface XFDFInput {
  docId: string
  pages: XFDFPageInput[]
  comments: XFDFCommentsState | null
  log: ActivityEntry[] | null
}

export interface ParsedXFDF {
  pages: Array<{ pageIndex: number; canvasJSON: FabricCanvasJSON }>
  comments: XFDFCommentsState | null
  log: ActivityEntry[]
}

// ── XML string helpers ─────────────────────────────────────────────

function esc(s: string | number | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function r(v: number): number { return Math.round(v * 100) / 100 }
function flipY(y: number, pageH: number): number { return pageH - y }

function rectStr(x1: number, y1: number, x2: number, y2: number, pageH: number): string {
  const left   = Math.min(x1, x2)
  const right  = Math.max(x1, x2)
  const top    = Math.min(y1, y2)
  const bottom = Math.max(y1, y2)
  return `${r(left)},${r(flipY(bottom, pageH))},${r(right)},${r(flipY(top, pageH))}`
}

function ptStr(x: number, y: number, pageH: number): string {
  return `${r(x)},${r(flipY(y, pageH))}`
}

function toPdfDate(ts: number): string {
  const d = new Date(ts)
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return (
    `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}

function fromPdfDate(str: string | null): number {
  if (!str) return Date.now()
  const m = str.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).getTime()
  return new Date(str).getTime() || Date.now()
}

// ── Common annotation attributes ──────────────────────────────────

function commonAttrs(obj: FabricSerializedObject, pageIndex: number): string {
  const color = esc(obj.stroke ?? '#000000')
  const width = r(obj.strokeWidth ?? 1)
  const date  = toPdfDate(obj.timestamp ?? Date.now())
  const name  = esc(obj.objectId ?? '')
  let s = ` page="${pageIndex}" name="${name}" date="${date}" color="${color}" width="${width}"`
  if (obj.opacity != null && obj.opacity < 1) s += ` opacity="${r(obj.opacity)}"`
  return s
}

// ── Path → XFDF gesture ──────────────────────────────────────────

function pathToGesture(obj: FabricSerializedObject, pageH: number): string {
  if (!obj.path) return ''
  const pts: string[] = []
  for (const cmd of obj.path) {
    switch (cmd[0]) {
      case 'M': case 'L':
        pts.push(ptStr(cmd[1] as number, cmd[2] as number, pageH))
        break
      case 'Q':
        pts.push(ptStr(cmd[3] as number, cmd[4] as number, pageH))
        break
      case 'C':
        pts.push(ptStr(cmd[5] as number, cmd[6] as number, pageH))
        break
    }
  }
  return pts.join(';')
}

function bboxOf(obj: FabricSerializedObject): { x1: number; y1: number; x2: number; y2: number } {
  const l = obj.left  ?? 0
  const t = obj.top   ?? 0
  const w = obj.width ?? 0
  const h = obj.height ?? 0
  return { x1: l, y1: t, x2: l + w, y2: t + h }
}

// ── Per-tool serialisers ──────────────────────────────────────────

function serObjStr(obj: FabricSerializedObject, pageIndex: number, pageH: number): string {
  const ca   = commonAttrs(obj, pageIndex)
  const tool = obj.tool

  switch (tool) {
    case 'freehand': {
      const gesture = pathToGesture(obj, pageH)
      if (!gesture) return ''
      const bb = bboxOf(obj)
      return (
        `<ink${ca} rect="${rectStr(bb.x1, bb.y1, bb.x2, bb.y2, pageH)}">` +
        `<gesture>${esc(gesture)}</gesture></ink>`
      )
    }
    case 'rectangle': {
      const l = obj.left ?? 0, t = obj.top ?? 0
      const w = obj.width ?? 0, h = obj.height ?? 0
      return `<square${ca} rect="${rectStr(l, t, l + w, t + h, pageH)}"/>`
    }
    case 'circle': {
      const x1 = obj.left ?? 0, y1 = obj.top ?? 0
      const x2 = x1 + (obj.rx ?? 0) * 2
      const y2 = y1 + (obj.ry ?? 0) * 2
      return `<circle${ca} rect="${rectStr(x1, y1, x2, y2, pageH)}"/>`
    }
    case 'line': {
      const ax1 = (obj.left ?? 0) + (obj.x1 ?? 0)
      const ay1 = (obj.top  ?? 0) + (obj.y1 ?? 0)
      const ax2 = (obj.left ?? 0) + (obj.x2 ?? 0)
      const ay2 = (obj.top  ?? 0) + (obj.y2 ?? 0)
      return (
        `<line${ca} rect="${rectStr(ax1, ay1, ax2, ay2, pageH)}"` +
        ` l1="${ptStr(ax1, ay1, pageH)}" l2="${ptStr(ax2, ay2, pageH)}"/>`
      )
    }
    case 'arrow': {
      const bb  = bboxOf(obj)
      const pts = pathToGesture(obj, pageH)
      return (
        `<polyline${ca} rect="${rectStr(bb.x1, bb.y1, bb.x2, bb.y2, pageH)}"` +
        ` vertices="${esc(pts)}"><lineending>None;OpenArrow</lineending></polyline>`
      )
    }
    case 'polygon': {
      if (!obj.points?.length) return ''
      const lx = obj.left ?? 0, ly = obj.top ?? 0
      const verts = obj.points.map((p) => ptStr(p.x + lx, p.y + ly, pageH)).join(';')
      const xs = obj.points.map((p) => p.x + lx)
      const ys = obj.points.map((p) => p.y + ly)
      return (
        `<polygon${ca} rect="${rectStr(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), pageH)}"` +
        ` vertices="${esc(verts)}"/>`
      )
    }
    case 'text': {
      const fs = obj.fontSize ?? 14
      const w  = (obj.width  ?? 100) + 20
      const h  = (obj.height ?? fs * 1.4) + 10
      const l  = obj.left ?? 0, t = obj.top ?? 0
      return (
        `<freetext${ca} rect="${rectStr(l, t, l + w, t + h, pageH)}">` +
        `<contents>${esc(obj.text ?? '')}</contents>` +
        `<defaultappearance>/Helvetica ${fs} Tf</defaultappearance></freetext>`
      )
    }
    default: return ''
  }
}

// ── Public: toXFDF ────────────────────────────────────────────────

export function toXFDF({ docId, pages, comments, log }: XFDFInput): string {
  const parts: string[] = []

  parts.push('<?xml version="1.0" encoding="UTF-8"?>')
  parts.push(`<xfdf xmlns="${XFDF_NS}" xmlns:ext="${EXT_NS}" xml:space="preserve">`)
  parts.push(`<f href="${esc(docId ?? '')}"/>`)

  parts.push('<annots>')
  for (const { pageIndex, pageHPts, canvasJSON } of pages) {
    if (!canvasJSON?.objects) continue
    for (const obj of canvasJSON.objects) {
      const s = serObjStr(obj, pageIndex, pageHPts)
      if (s) parts.push(s)
    }
  }
  parts.push('</annots>')

  parts.push('<ext:canvas-data>')
  for (const { pageIndex, canvasJSON } of pages) {
    if (!canvasJSON) continue
    const json = JSON.stringify(canvasJSON)
    parts.push(`<ext:page index="${pageIndex}"><![CDATA[${json}]]></ext:page>`)
  }
  parts.push('</ext:canvas-data>')

  if (comments) {
    parts.push(`<ext:comments counter="${comments.counter ?? 0}">`)
    for (const c of (comments.comments ?? [])) {
      parts.push(
        `<ext:comment id="${esc(c.id)}" page="${c.pageIndex}"` +
        ` baseX="${r(c.baseX)}" baseY="${r(c.baseY)}"` +
        ` number="${c.number}" resolved="${c.resolved ? 1 : 0}">`
      )
      for (const m of c.messages) {
        parts.push(
          `<ext:message id="${esc(m.id)}" userId="${esc(m.userId)}"` +
          ` timestamp="${toPdfDate(m.timestamp)}">${esc(m.text)}</ext:message>`
        )
      }
      parts.push('</ext:comment>')
    }
    parts.push('</ext:comments>')
  }

  if (log?.length) {
    parts.push(`<ext:log><![CDATA[${JSON.stringify(log)}]]></ext:log>`)
  }

  parts.push('</xfdf>')
  return parts.join('\n')
}

// ── Public: fromXFDF ──────────────────────────────────────────────

export function fromXFDF(xmlString: string): ParsedXFDF {
  const xml = new DOMParser().parseFromString(xmlString, 'application/xml')
  const parseErr = xml.querySelector('parsererror')
  if (parseErr) throw new Error('XFDF parse error: ' + (parseErr.textContent ?? '').slice(0, 200))

  const result: ParsedXFDF = { pages: [], comments: null, log: [] }

  const cdEl = xml.getElementsByTagNameNS(EXT_NS, 'canvas-data')[0]
  if (cdEl) {
    const pageEls = cdEl.getElementsByTagNameNS(EXT_NS, 'page')
    for (const pEl of pageEls) {
      const pageIndex = parseInt(pEl.getAttribute('index') ?? '0', 10)
      try {
        result.pages.push({ pageIndex, canvasJSON: JSON.parse(pEl.textContent ?? '') as FabricCanvasJSON })
      } catch { /* skip malformed */ }
    }
  }

  const commentsEl = xml.getElementsByTagNameNS(EXT_NS, 'comments')[0]
  if (commentsEl) {
    const counter  = parseInt(commentsEl.getAttribute('counter') ?? '0', 10)
    const comments: XFDFCommentData[] = []
    for (const cEl of commentsEl.getElementsByTagNameNS(EXT_NS, 'comment')) {
      const messages: XFDFCommentMessage[] = []
      for (const mEl of cEl.getElementsByTagNameNS(EXT_NS, 'message')) {
        messages.push({
          id:        mEl.getAttribute('id'),
          userId:    mEl.getAttribute('userId'),
          text:      mEl.textContent,
          timestamp: fromPdfDate(mEl.getAttribute('timestamp')),
        })
      }
      comments.push({
        id:        cEl.getAttribute('id'),
        pageIndex: parseInt(cEl.getAttribute('page') ?? '0', 10),
        baseX:     parseFloat(cEl.getAttribute('baseX') ?? '0'),
        baseY:     parseFloat(cEl.getAttribute('baseY') ?? '0'),
        number:    parseInt(cEl.getAttribute('number') ?? '0', 10),
        resolved:  cEl.getAttribute('resolved') === '1',
        messages,
      })
    }
    result.comments = { counter, comments }
  }

  const logEl = xml.getElementsByTagNameNS(EXT_NS, 'log')[0]
  if (logEl) {
    try { result.log = JSON.parse(logEl.textContent ?? '') as ActivityEntry[] } catch { /* ignore */ }
  }

  if (result.pages.length === 0) {
    result.pages = parseStandardAnnots(xml)
  }

  return result
}

// ── Fallback: minimal standard XFDF parser ────────────────────────

function parseStandardAnnots(
  xml: Document
): Array<{ pageIndex: number; canvasJSON: FabricCanvasJSON }> {
  const annotsEl = xml.getElementsByTagNameNS(XFDF_NS, 'annots')[0]
  if (!annotsEl) return []

  const byPage: Record<number, FabricCanvasJSON> = Object.create(null) as Record<number, FabricCanvasJSON>

  function ensurePage(idx: number): FabricCanvasJSON {
    if (!byPage[idx]) byPage[idx] = { version: '5.3.0', objects: [] }
    return byPage[idx]
  }

  function baseStyle(el: Element): FabricSerializedObject {
    return {
      stroke:      el.getAttribute('color') ?? '#e74c3c',
      strokeWidth: parseFloat(el.getAttribute('width') ?? '2'),
      objectId:    el.getAttribute('name') ?? '',
      timestamp:   fromPdfDate(el.getAttribute('date')),
    }
  }

  function parseRect(str: string | null): { left: number; bottom: number; right: number; top: number } | null {
    if (!str) return null
    const [left, bottom, right, top] = str.split(',').map(Number)
    return { left, bottom, right, top }
  }

  function toScreen(pdfRect: { left: number; bottom: number; right: number; top: number }): {
    x: number; y: number; w: number; h: number; estH: number
  } {
    const estPageH = pdfRect.top + 50
    return {
      x:    pdfRect.left,
      y:    estPageH - pdfRect.top,
      w:    pdfRect.right - pdfRect.left,
      h:    pdfRect.top   - pdfRect.bottom,
      estH: estPageH,
    }
  }

  for (const el of annotsEl.children) {
    const tag       = el.localName
    const pageIndex = parseInt(el.getAttribute('page') ?? '0', 10)
    const base      = baseStyle(el)
    const pdfRect   = parseRect(el.getAttribute('rect'))
    if (!pdfRect) continue

    const s      = toScreen(pdfRect)
    const canvas = ensurePage(pageIndex)

    switch (tag) {
      case 'square':
        canvas.objects.push({ ...base, tool: 'rectangle', left: s.x, top: s.y, width: s.w, height: s.h })
        break
      case 'circle':
        canvas.objects.push({ ...base, tool: 'circle', left: s.x, top: s.y, rx: s.w / 2, ry: s.h / 2 })
        break
      case 'line': {
        const parse2 = (a: string | null): number[] | null =>
          a ? a.split(',').map(Number) : null
        const l1 = parse2(el.getAttribute('l1'))
        const l2 = parse2(el.getAttribute('l2'))
        if (l1 && l2) {
          canvas.objects.push({ ...base, tool: 'line', x1: l1[0], y1: s.estH - l1[1], x2: l2[0], y2: s.estH - l2[1], left: 0, top: 0 })
        }
        break
      }
      case 'freetext': {
        const contEl = el.getElementsByTagNameNS(XFDF_NS, 'contents')[0]
        canvas.objects.push({ ...base, tool: 'text', left: s.x, top: s.y, text: contEl?.textContent ?? '', fontSize: 14 })
        break
      }
      case 'ink': {
        const gEl = el.getElementsByTagNameNS(XFDF_NS, 'gesture')[0]
        if (!gEl) break
        const pts = (gEl.textContent ?? '')
          .split(';')
          .map((seg) => { const [x, y] = seg.split(',').map(Number); return { x, y: s.estH - y } })
          .filter((p) => !isNaN(p.x))
        if (pts.length < 2) break
        canvas.objects.push({
          ...base, tool: 'freehand', left: 0, top: 0,
          path: pts.map((p, i) => (i === 0 ? ['M', p.x, p.y] : ['L', p.x, p.y]) as FabricPathCmd),
        })
        break
      }
      case 'polygon': {
        const vertsStr = el.getAttribute('vertices')
        if (!vertsStr) break
        const points = vertsStr
          .split(';')
          .map((seg) => { const [x, y] = seg.split(',').map(Number); return { x, y: s.estH - y } })
          .filter((p) => !isNaN(p.x))
        if (points.length >= 3) {
          canvas.objects.push({ ...base, tool: 'polygon', points, left: 0, top: 0 })
        }
        break
      }
    }
  }

  return Object.entries(byPage).map(([idx, json]) => ({
    pageIndex: parseInt(idx, 10),
    canvasJSON: json,
  }))
}
