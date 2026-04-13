/**
 * xfdf.js — XFDF (XML Forms Data Format) serialiser / deserialiser
 *
 * Standard:  ISO 19444-1 / Adobe XFDF Specification
 * Namespace: http://ns.adobe.com/xfdf/
 * Extension: http://xfdf-annotator.example.com/ext/1.0  (ext:*)
 *
 * ── Performance design ──────────────────────────────────────────────
 *  toXFDF() uses string concatenation into an array (parts.push / join).
 *  DOM-based XML building (createElement / setAttribute / appendChild) is
 *  10–50× slower for large annotation sets because each call crosses into
 *  the DOM subsystem.  String building stays in JS heap.
 *
 * ── Coordinate systems ──────────────────────────────────────────────
 *  Screen (Fabric base):  origin top-left,    y ↓,  units = PDF pts
 *  XFDF / PDF:            origin bottom-left,  y ↑,  units = PDF pts
 *
 *    screen → pdf:   pdfY  = pageH − screenY
 *    pdf → screen:   screenY = pageH − pdfY
 *
 * ── Round-trip strategy ─────────────────────────────────────────────
 *  <ext:canvas-data> embeds the full Fabric.js canvas JSON per page
 *  (lossless).  The standard <annots> block provides basic XFDF records
 *  for interoperability with Acrobat / Foxit — those tools ignore ext:*.
 */

const XFDF_NS = 'http://ns.adobe.com/xfdf/';
const EXT_NS  = 'http://xfdf-annotator.example.com/ext/1.0';

// ── XML string helpers ─────────────────────────────────────────────

/** Escape special XML characters in an attribute value or text node. */
function esc(s) {
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function r(v)    { return Math.round(v * 100) / 100; }
function flipY(y, pageH) { return pageH - y; }

/**
 * Format a PDF rect attribute string.
 * XFDF rect = "left,bottom,right,top"  (PDF coords, y-up).
 */
function rectStr(x1, y1, x2, y2, pageH) {
  const left   = Math.min(x1, x2);
  const right  = Math.max(x1, x2);
  const top    = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return `${r(left)},${r(flipY(bottom, pageH))},${r(right)},${r(flipY(top, pageH))}`;
}

function ptStr(x, y, pageH) { return `${r(x)},${r(flipY(y, pageH))}`; }

function toPdfDate(ts) {
  const d = new Date(ts);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function fromPdfDate(str) {
  if (!str) return Date.now();
  const m = str.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).getTime();
  return new Date(str).getTime() || Date.now();
}

// ── Common annotation attribute string ────────────────────────────

function commonAttrs(obj, pageIndex) {
  const color = esc(obj.stroke || '#000000');
  const width  = r(obj.strokeWidth || 1);
  const date   = toPdfDate(obj.timestamp || Date.now());
  const name   = esc(obj.objectId || '');
  let s = ` page="${pageIndex}" name="${name}" date="${date}" color="${color}" width="${width}"`;
  if (obj.opacity != null && obj.opacity < 1) s += ` opacity="${r(obj.opacity)}"`;
  return s;
}

// ── Path → XFDF gesture string ────────────────────────────────────

/**
 * Convert a Fabric Path's point array to XFDF gesture format ("x,y;x,y;…").
 * Control points of bezier curves are approximated by the endpoint — good
 * enough for ink annotations in standard readers.
 */
function pathToGesture(obj, pageH) {
  if (!obj.path) return '';
  const pts = [];
  for (const cmd of obj.path) {
    switch (cmd[0]) {
      case 'M': case 'L': pts.push(ptStr(cmd[1], cmd[2], pageH)); break;
      case 'Q':            pts.push(ptStr(cmd[3], cmd[4], pageH)); break;
      case 'C':            pts.push(ptStr(cmd[5], cmd[6], pageH)); break;
    }
  }
  return pts.join(';');
}

function bboxOf(obj) {
  const l = obj.left  || 0, t = obj.top    || 0;
  const w = obj.width || 0, h = obj.height || 0;
  return { x1: l, y1: t, x2: l + w, y2: t + h };
}

// ── Per-tool serialisers (return XML string or '') ─────────────────

function serObjStr(obj, pageIndex, pageH) {
  const ca  = commonAttrs(obj, pageIndex);
  const tool = obj.tool;

  switch (tool) {
    case 'freehand': {
      const gesture = pathToGesture(obj, pageH);
      if (!gesture) return '';
      const bb = bboxOf(obj);
      return `<ink${ca} rect="${rectStr(bb.x1, bb.y1, bb.x2, bb.y2, pageH)}">` +
             `<gesture>${esc(gesture)}</gesture></ink>`;
    }
    case 'rectangle': {
      return `<square${ca} rect="${rectStr(obj.left, obj.top, obj.left + obj.width, obj.top + obj.height, pageH)}"/>`;
    }
    case 'circle': {
      const x1 = obj.left, y1 = obj.top;
      const x2 = obj.left + (obj.rx || 0) * 2;
      const y2 = obj.top  + (obj.ry || 0) * 2;
      return `<circle${ca} rect="${rectStr(x1, y1, x2, y2, pageH)}"/>`;
    }
    case 'line': {
      const ax1 = (obj.left || 0) + (obj.x1 || 0);
      const ay1 = (obj.top  || 0) + (obj.y1 || 0);
      const ax2 = (obj.left || 0) + (obj.x2 || 0);
      const ay2 = (obj.top  || 0) + (obj.y2 || 0);
      return `<line${ca} rect="${rectStr(ax1, ay1, ax2, ay2, pageH)}"` +
             ` l1="${ptStr(ax1, ay1, pageH)}" l2="${ptStr(ax2, ay2, pageH)}"/>`;
    }
    case 'arrow': {
      const bb  = bboxOf(obj);
      const pts = pathToGesture(obj, pageH);
      return `<polyline${ca} rect="${rectStr(bb.x1, bb.y1, bb.x2, bb.y2, pageH)}"` +
             ` vertices="${esc(pts)}"><lineending>None;OpenArrow</lineending></polyline>`;
    }
    case 'polygon': {
      if (!obj.points?.length) return '';
      const lx = obj.left || 0, ly = obj.top || 0;
      const verts = obj.points.map((p) => ptStr(p.x + lx, p.y + ly, pageH)).join(';');
      const xs = obj.points.map((p) => p.x + lx);
      const ys = obj.points.map((p) => p.y + ly);
      return `<polygon${ca} rect="${rectStr(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), pageH)}"` +
             ` vertices="${esc(verts)}"/>`;
    }
    case 'text': {
      const fs = obj.fontSize || 14;
      const w  = (obj.width  || 100) + 20;
      const h  = (obj.height || fs * 1.4) + 10;
      return `<freetext${ca} rect="${rectStr(obj.left, obj.top, obj.left + w, obj.top + h, pageH)}">` +
             `<contents>${esc(obj.text || '')}</contents>` +
             `<defaultappearance>/Helvetica ${fs} Tf</defaultappearance></freetext>`;
    }
    default: return '';
  }
}

// ── Public: toXFDF ─────────────────────────────────────────────────

/**
 * Serialise the current annotation state to an XFDF XML string.
 *
 * Uses string array + join (fast) instead of DOM construction (slow).
 *
 * @param {{
 *   docId:    string,
 *   pages:    Array<{ pageIndex: number, pageHPts: number, canvasJSON: object|null }>,
 *   comments: object,
 *   log:      Array,
 * }} data
 * @returns {string} XFDF XML
 */
export function toXFDF({ docId, pages, comments, log }) {
  const parts = [];

  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(`<xfdf xmlns="${XFDF_NS}" xmlns:ext="${EXT_NS}" xml:space="preserve">`);
  parts.push(`<f href="${esc(docId || '')}"/>`);

  // ── Standard XFDF <annots> (interop) ──────────────────────────────
  parts.push('<annots>');
  for (const { pageIndex, pageHPts, canvasJSON } of pages) {
    if (!canvasJSON?.objects) continue;
    for (const obj of canvasJSON.objects) {
      const s = serObjStr(obj, pageIndex, pageHPts);
      if (s) parts.push(s);
    }
  }
  parts.push('</annots>');

  // ── ext:canvas-data (lossless Fabric round-trip) ──────────────────
  parts.push('<ext:canvas-data>');
  for (const { pageIndex, canvasJSON } of pages) {
    if (!canvasJSON) continue;
    // JSON.stringify once; embed in CDATA so no further escaping needed
    const json = JSON.stringify(canvasJSON);
    parts.push(`<ext:page index="${pageIndex}"><![CDATA[${json}]]></ext:page>`);
  }
  parts.push('</ext:canvas-data>');

  // ── ext:comments ──────────────────────────────────────────────────
  if (comments) {
    parts.push(`<ext:comments counter="${comments.counter || 0}">`);
    for (const c of (comments.comments || [])) {
      parts.push(
        `<ext:comment id="${esc(c.id)}" page="${c.pageIndex}"` +
        ` baseX="${r(c.baseX)}" baseY="${r(c.baseY)}"` +
        ` number="${c.number}" resolved="${c.resolved ? 1 : 0}">`
      );
      for (const m of (c.messages || [])) {
        parts.push(
          `<ext:message id="${esc(m.id)}" userId="${esc(m.userId)}"` +
          ` timestamp="${toPdfDate(m.timestamp)}">${esc(m.text)}</ext:message>`
        );
      }
      parts.push('</ext:comment>');
    }
    parts.push('</ext:comments>');
  }

  // ── ext:log ────────────────────────────────────────────────────────
  if (log?.length) {
    parts.push(`<ext:log><![CDATA[${JSON.stringify(log)}]]></ext:log>`);
  }

  parts.push('</xfdf>');
  return parts.join('\n');
}

// ── Public: fromXFDF ──────────────────────────────────────────────

/**
 * Deserialise an XFDF XML string back to annotation state.
 *
 * Primary: reads from <ext:canvas-data> (lossless Fabric round-trip).
 * Fallback: parses standard <annots> for files from other tools.
 *
 * DOMParser is the fastest XML parser available in the browser;
 * we read from it once and walk the result, avoiding repeated querySelector.
 *
 * @param {string} xmlString
 * @returns {{ pages: Array, comments: object|null, log: Array }}
 */
export function fromXFDF(xmlString) {
  const xml = new DOMParser().parseFromString(xmlString, 'application/xml');
  const parseErr = xml.querySelector('parsererror');
  if (parseErr) throw new Error('XFDF parse error: ' + parseErr.textContent.slice(0, 200));

  const result = { pages: [], comments: null, log: [] };

  // ── ext:canvas-data (primary, lossless) ───────────────────────────
  const cdEl = xml.getElementsByTagNameNS(EXT_NS, 'canvas-data')[0];
  if (cdEl) {
    const pageEls = cdEl.getElementsByTagNameNS(EXT_NS, 'page');
    for (const pEl of pageEls) {
      const pageIndex = parseInt(pEl.getAttribute('index') || '0', 10);
      try {
        result.pages.push({ pageIndex, canvasJSON: JSON.parse(pEl.textContent) });
      } catch { /* skip malformed */ }
    }
  }

  // ── ext:comments ──────────────────────────────────────────────────
  const commentsEl = xml.getElementsByTagNameNS(EXT_NS, 'comments')[0];
  if (commentsEl) {
    const counter  = parseInt(commentsEl.getAttribute('counter') || '0', 10);
    const comments = [];
    for (const cEl of commentsEl.getElementsByTagNameNS(EXT_NS, 'comment')) {
      const messages = [];
      for (const mEl of cEl.getElementsByTagNameNS(EXT_NS, 'message')) {
        messages.push({
          id:        mEl.getAttribute('id'),
          userId:    mEl.getAttribute('userId'),
          text:      mEl.textContent,
          timestamp: fromPdfDate(mEl.getAttribute('timestamp')),
        });
      }
      comments.push({
        id:        cEl.getAttribute('id'),
        pageIndex: parseInt(cEl.getAttribute('page') || '0', 10),
        baseX:     parseFloat(cEl.getAttribute('baseX') || '0'),
        baseY:     parseFloat(cEl.getAttribute('baseY') || '0'),
        number:    parseInt(cEl.getAttribute('number') || '0', 10),
        resolved:  cEl.getAttribute('resolved') === '1',
        messages,
      });
    }
    result.comments = { counter, comments };
  }

  // ── ext:log ────────────────────────────────────────────────────────
  const logEl = xml.getElementsByTagNameNS(EXT_NS, 'log')[0];
  if (logEl) {
    try { result.log = JSON.parse(logEl.textContent); } catch { /* ignore */ }
  }

  // ── Fallback: parse standard <annots> ─────────────────────────────
  if (result.pages.length === 0) {
    result.pages = parseStandardAnnots(xml);
  }

  return result;
}

// ── Fallback: minimal standard XFDF parser ────────────────────────

function parseStandardAnnots(xml) {
  const annotsEl = xml.getElementsByTagNameNS(XFDF_NS, 'annots')[0];
  if (!annotsEl) return [];

  const byPage = Object.create(null);

  function ensurePage(idx) {
    return (byPage[idx] ??= { version: '5.3.0', objects: [] });
  }

  function baseStyle(el) {
    return {
      stroke:        el.getAttribute('color') || '#e74c3c',
      strokeWidth:   parseFloat(el.getAttribute('width') || '2'),
      fill:          'transparent',
      selectable:    true,
      evented:       true,
      strokeUniform: true,
      objectId:      el.getAttribute('name') || '',
      timestamp:     fromPdfDate(el.getAttribute('date')),
      pageIndex:     parseInt(el.getAttribute('page') || '0', 10),
    };
  }

  function parseRect(str) {
    if (!str) return null;
    const [left, bottom, right, top] = str.split(',').map(Number);
    return { left, bottom, right, top };
  }

  // Estimate screen coords from PDF rect (we don't know the page height here,
  // so use the rect top as an estimate of page height lower bound)
  function toScreen(pdfRect) {
    const estPageH = pdfRect.top + 50;
    return {
      x: pdfRect.left,
      y: estPageH - pdfRect.top,           // screen top
      w: pdfRect.right - pdfRect.left,
      h: pdfRect.top   - pdfRect.bottom,
      estH: estPageH,
    };
  }

  for (const el of annotsEl.children) {
    const tag       = el.localName;
    const pageIndex = parseInt(el.getAttribute('page') || '0', 10);
    const base      = baseStyle(el);
    const pdfRect   = parseRect(el.getAttribute('rect'));
    if (!pdfRect) continue;

    const s      = toScreen(pdfRect);
    const canvas = ensurePage(pageIndex);

    switch (tag) {
      case 'square':
        canvas.objects.push({ type: 'rect', ...base, tool: 'rectangle', left: s.x, top: s.y, width: s.w, height: s.h });
        break;
      case 'circle':
        canvas.objects.push({ type: 'ellipse', ...base, tool: 'circle', left: s.x, top: s.y, rx: s.w / 2, ry: s.h / 2, originX: 'left', originY: 'top' });
        break;
      case 'line': {
        const parse2 = (a) => a?.split(',').map(Number);
        const l1 = parse2(el.getAttribute('l1'));
        const l2 = parse2(el.getAttribute('l2'));
        if (l1 && l2) {
          canvas.objects.push({ type: 'line', ...base, tool: 'line', x1: l1[0], y1: s.estH - l1[1], x2: l2[0], y2: s.estH - l2[1], left: 0, top: 0 });
        }
        break;
      }
      case 'freetext': {
        const contEl = el.getElementsByTagNameNS(XFDF_NS, 'contents')[0];
        canvas.objects.push({ type: 'i-text', ...base, tool: 'text', left: s.x, top: s.y, text: contEl?.textContent || '', fontSize: 14, fill: base.stroke, stroke: 'transparent' });
        break;
      }
      case 'ink': {
        const gEl = el.getElementsByTagNameNS(XFDF_NS, 'gesture')[0];
        if (!gEl) break;
        const pts = gEl.textContent.split(';').map((seg) => {
          const [x, y] = seg.split(',').map(Number);
          return { x, y: s.estH - y };
        }).filter((p) => !isNaN(p.x));
        if (pts.length < 2) break;
        canvas.objects.push({ type: 'path', ...base, tool: 'freehand', left: 0, top: 0, path: pts.map((p, i) => i === 0 ? ['M', p.x, p.y] : ['L', p.x, p.y]) });
        break;
      }
      case 'polygon': {
        const vertsStr = el.getAttribute('vertices');
        if (!vertsStr) break;
        const points = vertsStr.split(';').map((seg) => {
          const [x, y] = seg.split(',').map(Number);
          return { x, y: s.estH - y };
        }).filter((p) => !isNaN(p.x));
        if (points.length >= 3) {
          canvas.objects.push({ type: 'polygon', ...base, tool: 'polygon', points, left: 0, top: 0 });
        }
        break;
      }
    }
  }

  return Object.entries(byPage).map(([idx, json]) => ({
    pageIndex: parseInt(idx, 10),
    canvasJSON: json,
  }));
}
