import { formatTime } from '../utils/utils.js';

/**
 * ActivityLog — manages the right-hand sidebar activity feed.
 */
export class ActivityLog {
  /** @param {string} containerId */
  constructor(containerId) {
    this._container = document.getElementById(containerId);
    this._events    = [];
  }

  /**
   * Append a new event entry to the top of the log.
   * @param {{ action, tool, objectId, userId, timestamp, pageIndex }} eventData
   */
  addEvent(eventData) {
    this._events.push(eventData);
    this._removeEmptyPlaceholder();
    this._prependEntry(eventData);
  }

  clear() {
    this._events = [];
    this._container.innerHTML = '<div class="log-empty">No activity yet</div>';
  }

  repopulate(events) {
    this.clear();
    if (!events || events.length === 0) return;
    this._events = [...events];
    this._removeEmptyPlaceholder();
    [...events].reverse().forEach((e) => this._prependEntry(e));
  }

  getEvents() { return [...this._events]; }

  // ── Private ───────────────────────────────────────────────────────

  _removeEmptyPlaceholder() {
    this._container.querySelector('.log-empty')?.remove();
  }

  _prependEntry(ev) {
    const entry    = document.createElement('div');
    entry.className = `log-entry action-${ev.action}`;
    entry.dataset.objectId = ev.objectId;

    const shortId  = ev.userId ? ev.userId.slice(0, 8) : '????????';
    const pageLabel = ev.pageIndex !== undefined ? `Page ${ev.pageIndex + 1}` : '';
    const icon      = ev.action === 'added' ? '＋' : '−';

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
    `;
    this._container.prepend(entry);
  }

  _toolLabel(tool) {
    const map = {
      freehand: 'Freehand', rectangle: 'Rectangle', circle: 'Ellipse',
      line: 'Line', arrow: 'Arrow', polygon: 'Polygon', text: 'Text',
      comment: 'Comment', image: 'Image', eraser: 'Eraser',
    };
    return map[tool] || tool || 'Object';
  }
}
