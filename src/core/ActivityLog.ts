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

    const shortId   = ev.userId ? ev.userId.slice(0, 8) : '????????'
    const pageLabel = ev.pageIndex !== undefined ? `Page ${ev.pageIndex + 1}` : ''
    const icon      = ev.action === 'added' ? '＋' : '−'

    entry.innerHTML = `
      <div class="log-entry-header">
        <span class="log-badge ${ev.action}">${icon} ${ev.action}</span>
        <span class="log-time">${formatTime(ev.timestamp)}</span>
      </div>
      <div class="log-detail">
        <span class="log-tool-name">${this._toolLabel(ev.tool)}</span>
        <span class="log-page">${pageLabel}</span>
      </div>
      <div class="log-user" title="User ID: ${ev.userId}">${shortId}…</div>
    `
    this._container.prepend(entry)
  }

  private _toolLabel(tool: string): string {
    const map: Record<string, string> = {
      freehand: 'Freehand', rectangle: 'Rectangle', circle: 'Ellipse',
      line: 'Line', arrow: 'Arrow', polygon: 'Polygon', text: 'Text',
      comment: 'Comment', image: 'Image', eraser: 'Eraser',
    }
    return map[tool] ?? tool ?? 'Object'
  }
}
