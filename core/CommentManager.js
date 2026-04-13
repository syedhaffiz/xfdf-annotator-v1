import { generateUUID, formatTime } from '../utils/utils.js';

/**
 * CommentManager — Figma-style comment pins + thread panel.
 *
 * Pin positioning contract
 * ────────────────────────
 * • Comments store baseX / baseY in zoom-1.0 coordinates (PDF pts for PDFs,
 *   pixels for images).
 * • Physical position = baseX * scale, baseY * scale — relative to .page-layers.
 * • The pin element uses  transform: translate(-50%, -100%)  so its bottom-centre
 *   sits EXACTLY on the physical click point (like a map pushpin).
 * • Thread panel position is computed from the page-layers getBoundingClientRect
 *   + physical offsets — never from the pin element's own bounding box, which
 *   is affected by CSS transforms and unreliable.
 */
export class CommentManager {
  constructor({ userId, pagesContainerId, threadPanelId, newPopupId }) {
    this.userId            = userId;
    this._pagesContainerId = pagesContainerId;

    this._comments  = new Map();   // id → CommentData
    this._pinEls    = new Map();   // id → HTMLElement

    this._counter          = 0;
    this._scale            = 1;
    this._activeId         = null;
    this._pendingPlacement = null;
    this._ignoreNextDocClick = false;

    this._panel = document.getElementById(threadPanelId);
    this._popup = document.getElementById(newPopupId);

    this._bindPanelEvents();
    this._bindPopupEvents();
  }

  // ── Public API ────────────────────────────────────────────────────

  startPlacement(pageIndex, baseX, baseY, nativeEvent) {
    this._closeThreadSilent();
    this._pendingPlacement = { pageIndex, baseX, baseY };
    this._ignoreNextDocClick = true;
    this._showPopup(nativeEvent.clientX, nativeEvent.clientY);
  }

  repositionAll(scale) {
    this._scale = scale;
    this._comments.forEach((c, id) => {
      const pin = this._pinEls.get(id);
      if (pin) this._positionPin(pin, c);
    });
    if (this._activeId) this._repositionOpenPanel();
  }

  setInteractive(interactive) {
    this._pinEls.forEach((pin) => {
      pin.style.pointerEvents = interactive ? 'all' : 'none';
    });
  }

  openThread(commentId) {
    const c = this._comments.get(commentId);
    if (!c) return;

    this._activeId = commentId;
    this._ignoreNextDocClick = true;

    this._pinEls.forEach((el, id) =>
      el.classList.toggle('active', id === commentId)
    );

    this._renderThread(c);
    this._panel.style.display = 'flex';
    this._repositionOpenPanel();
  }

  closeThread() { this._closeThreadSilent(); }

  rebuildPins(scale) {
    this._scale = scale;
    this._pinEls.forEach((el) => el.remove());
    this._pinEls.clear();
    this._comments.forEach((c) => this._createPin(c));
  }

  clearAll() {
    this._pinEls.forEach((el) => el.remove());
    this._pinEls.clear();
    this._comments.clear();
    this._counter  = 0;
    this._activeId = null;
    this._closeThreadSilent();
    this._hidePopup();
  }

  // ── Serialization ─────────────────────────────────────────────────

  toJSON() {
    return {
      counter:  this._counter,
      comments: Array.from(this._comments.values()),
    };
  }

  fromJSON(data, scale) {
    this.clearAll();
    this._scale   = scale;
    this._counter = data.counter || 0;
    (data.comments || []).forEach((c) => {
      this._comments.set(c.id, c);
      this._createPin(c);
    });
  }

  // ── Private: close ────────────────────────────────────────────────

  _closeThreadSilent() {
    this._activeId = null;
    if (this._panel) this._panel.style.display = 'none';
    this._pinEls.forEach((el) => el.classList.remove('active'));
  }

  // ── Private: pin DOM ──────────────────────────────────────────────

  _createPin(comment) {
    const container = this._getPageLayersEl(comment.pageIndex);
    if (!container) return;

    const pin = document.createElement('div');
    pin.className         = 'comment-pin';
    pin.dataset.commentId = comment.id;
    pin.title = `#${comment.number} — ${comment.messages[0]?.text?.slice(0, 60) || ''}`;

    pin.innerHTML = `
      <div class="comment-pin-badge">${comment.number}</div>
      <div class="comment-pin-tip"></div>
    `;

    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._activeId === comment.id) {
        this._closeThreadSilent();
      } else {
        this.openThread(comment.id);
      }
    });

    container.appendChild(pin);
    this._pinEls.set(comment.id, pin);
    this._positionPin(pin, comment);
  }

  _positionPin(pinEl, comment) {
    pinEl.style.left = Math.round(comment.baseX * this._scale) + 'px';
    pinEl.style.top  = Math.round(comment.baseY * this._scale) + 'px';
  }

  _getPageLayersEl(pageIndex) {
    return document.querySelector(
      `#${this._pagesContainerId} [data-page-index="${pageIndex}"] .page-layers`
    );
  }

  // ── Private: thread panel ─────────────────────────────────────────

  _renderThread(comment) {
    const numEl = this._panel.querySelector('.ctp-pin-num');
    const msgEl = this._panel.querySelector('.ctp-messages');
    if (numEl) numEl.textContent = `#${comment.number}`;

    msgEl.innerHTML = comment.messages.map((m) => `
      <div class="ctp-message">
        <div class="ctp-msg-header">
          <span class="ctp-msg-user">${this._shortId(m.userId)}</span>
          <span class="ctp-msg-time">${formatTime(m.timestamp)}</span>
        </div>
        <div class="ctp-msg-text">${this._safe(m.text)}</div>
      </div>
    `).join('');

    msgEl.scrollTop = msgEl.scrollHeight;
  }

  _repositionOpenPanel() {
    if (!this._activeId) return;
    const c = this._comments.get(this._activeId);
    if (!c) return;
    const { x, y } = this._pinTipClientPos(c.pageIndex, c.baseX, c.baseY);
    this._positionFloating(this._panel, x, y, 308, 400);
  }

  _pinTipClientPos(pageIndex, baseX, baseY) {
    const layersEl = this._getPageLayersEl(pageIndex);
    if (!layersEl) return { x: 0, y: 0 };
    const rect = layersEl.getBoundingClientRect();
    return {
      x: rect.left + Math.round(baseX * this._scale),
      y: rect.top  + Math.round(baseY * this._scale),
    };
  }

  _positionFloating(el, tipX, tipY, elW, elH) {
    const MARGIN   = 12;
    const PIN_HALF = 13;
    const GAP      = 10;

    let left = tipX + PIN_HALF + GAP;
    let top  = tipY - elH / 2 - PIN_HALF;

    if (left + elW > window.innerWidth - MARGIN) {
      left = tipX - PIN_HALF - GAP - elW;
    }

    if (top + elH > window.innerHeight - MARGIN) top = window.innerHeight - elH - MARGIN;
    if (top < MARGIN) top = MARGIN;
    if (left < MARGIN) left = MARGIN;

    el.style.left = Math.round(left) + 'px';
    el.style.top  = Math.round(top)  + 'px';
  }

  _bindPanelEvents() {
    if (!this._panel) return;

    this._panel.querySelector('.ctp-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeThreadSilent();
    });

    const input = this._panel.querySelector('.ctp-reply-input');
    const btn   = this._panel.querySelector('.ctp-reply-btn');

    const submit = () => {
      const text = input?.value?.trim();
      if (!text || !this._activeId) return;
      const comment = this._comments.get(this._activeId);
      if (!comment) return;

      comment.messages.push({
        id:        generateUUID(),
        userId:    this.userId,
        text,
        timestamp: Date.now(),
      });
      input.value = '';
      this._renderThread(comment);
      const pin = this._pinEls.get(this._activeId);
      if (pin) pin.title = `#${comment.number} — ${comment.messages[0]?.text?.slice(0, 60) || ''}`;
    };

    btn?.addEventListener('click',  (e) => { e.stopPropagation(); submit(); });
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });

    this._panel.addEventListener('click', (e) => e.stopPropagation());
  }

  // ── Private: new-comment popup ────────────────────────────────────

  _showPopup(cursorX, cursorY) {
    if (!this._popup) return;
    const PW = 288, PH = 140, MARGIN = 12, GAP = 14;

    let left = cursorX + GAP;
    let top  = cursorY - PH / 2;

    if (left + PW > window.innerWidth  - MARGIN) left = cursorX - PW - GAP;
    if (top  + PH > window.innerHeight - MARGIN) top  = window.innerHeight - PH - MARGIN;
    if (top  < MARGIN) top = MARGIN;
    if (left < MARGIN) left = MARGIN;

    this._popup.style.left    = Math.round(left) + 'px';
    this._popup.style.top     = Math.round(top)  + 'px';
    this._popup.style.display = 'flex';

    const ta = this._popup.querySelector('textarea');
    if (ta) { ta.value = ''; ta.focus(); }
  }

  _hidePopup() {
    if (this._popup) this._popup.style.display = 'none';
    this._pendingPlacement = null;
  }

  _bindPopupEvents() {
    if (!this._popup) return;

    const ta        = this._popup.querySelector('textarea');
    const postBtn   = this._popup.querySelector('#btn-post-comment');
    const cancelBtn = this._popup.querySelector('#btn-cancel-comment');

    const submit = () => {
      const text = ta?.value?.trim();
      if (!text || !this._pendingPlacement) { this._hidePopup(); return; }
      this._submitComment(text);
    };

    postBtn?.addEventListener('click',   (e) => { e.stopPropagation(); submit(); });
    cancelBtn?.addEventListener('click', (e) => { e.stopPropagation(); this._hidePopup(); });

    ta?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
      if (e.key === 'Escape') this._hidePopup();
    });

    this._popup.addEventListener('click', (e) => e.stopPropagation());
  }

  _submitComment(text) {
    if (!this._pendingPlacement) return;
    const { pageIndex, baseX, baseY } = this._pendingPlacement;
    this._counter++;

    const comment = {
      id:       generateUUID(),
      pageIndex, baseX, baseY,
      number:   this._counter,
      resolved: false,
      messages: [{
        id:        generateUUID(),
        userId:    this.userId,
        text,
        timestamp: Date.now(),
      }],
    };

    this._comments.set(comment.id, comment);
    this._createPin(comment);
    this._hidePopup();
    this.openThread(comment.id);
  }

  // ── Private: helpers ──────────────────────────────────────────────

  _shortId(id) { return id ? id.slice(0, 8) + '…' : '?'; }

  _safe(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}
