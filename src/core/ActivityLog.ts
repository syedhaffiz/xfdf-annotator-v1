import { formatTime } from '../utils/utils'
import type { ActivityEntry } from '../types/index'

export class ActivityLog {
  private _container: HTMLElement | null
  private _events: ActivityEntry[] = []

  constructor(containerId: string) {
    this._container = document.getElementById(containerId)
  }

  addEvent(eventData: ActivityEntry): void {
    this._events.push(eventData)
    this._removeEmptyPlaceholder()
    this._prependEntry(eventData)
  }

  clear(): void {
    this._events = []
    if (this._container) this._container.innerHTML = '<div class="log-empty">No activity yet</div>'
  }

  repopulate(events: ActivityEntry[]): void {
    this.clear()
    if (!events || events.length === 0) return
    this._events = [...events];
    [...events].reverse().forEach((e) => this._prependEntry(e))
  }

  getEvents(): ActivityEntry[] { return [...this._events] }

  private _removeEmptyPlaceholder(): void {
    this._container?.querySelector('.log-empty')?.remove()
  }

  private _prependEntry(ev: ActivityEntry): void {
    if (!this._container) return
    const entry        = document.createElement('div')
    entry.className    = `log-entry action-${ev.action}`
    entry.dataset['objectId'] = ev.objectId ?? ''

    // Prefer the persisted display name; fall back to a truncated user id
    // for legacy entries (saved before userName became part of the schema).
    const userLabel = (ev.userName && ev.userName.trim())
      ? ev.userName
      : (ev.userId ? ev.userId.slice(0, 8) + '…' : '????????')
    const pageLabel = ev.pageIndex !== undefined ? `Page ${ev.pageIndex + 1}` : ''
    const icon      = ev.action === 'added' ? '＋' : '−'
    const actionLabel = ev.tool === 'eraser' || ev.tool === 'erase-all' ? 'erased' : ev.action

    entry.innerHTML = `
      <div class="log-entry-header">
        <span class="log-badge ${ev.action}">${icon} ${actionLabel}</span>
        <span class="log-time">${formatTime(ev.timestamp)}</span>
      </div>
      <div class="log-detail">
        <span class="log-tool-name">${this._toolLabel(ev.tool)}</span>
        <span class="log-page">${pageLabel}</span>
      </div>
      ${ev.text ? `<div class="log-text" style="margin:2px 0;font-style:italic;word-break:break-word;">“${this._safe(ev.text)}”</div>` : ''}
      <div class="log-user" title="User ID: ${this._safe(ev.userId ?? '')}">${this._safe(userLabel)}</div>
    `
    this._container.prepend(entry)
  }

  /** Defensive HTML escape — entry text comes from arbitrary user input. */
  private _safe(s: string): string {
    const d = document.createElement('div')
    d.textContent = s
    return d.innerHTML
  }

  private _toolLabel(tool: string): string {
    const map: Record<string, string> = {
      freehand: 'Freehand', rectangle: 'Rectangle', circle: 'Ellipse',
      line: 'Line', arrow: 'Arrow', polygon: 'Polygon', text: 'Text',
      comment: 'Comment', image: 'Image', eraser: 'Eraser',
      'erase-all': 'Erase All',
    }
    return map[tool] ?? tool ?? 'Object'
  }
}
