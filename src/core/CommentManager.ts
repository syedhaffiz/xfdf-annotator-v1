import { generateUUID, formatTime } from '../utils/utils'
import type { XFDFCommentData, XFDFCommentMessage, XFDFCommentsState } from '../utils/xfdf'

interface CommentManagerOptions {
  userId:           string
  pagesContainerId: string
  threadPanelId:    string
  newPopupId:       string
}

export class CommentManager {
  private userId:            string
  private _pagesContainerId: string
  private _comments:         Map<string, XFDFCommentData>
  private _pinEls:           Map<string, HTMLElement>
  private _counter:          number
  private _scale:            number
  private _activeId:         string | null
  private _pendingPlacement: { pageIndex: number; baseX: number; baseY: number } | null
  private _panel: HTMLElement | null
  private _popup: HTMLElement | null

  constructor({ userId, pagesContainerId, threadPanelId, newPopupId }: CommentManagerOptions) {
    this.userId            = userId
    this._pagesContainerId = pagesContainerId
    this._comments         = new Map()
    this._pinEls           = new Map()
    this._counter          = 0
    this._scale            = 1
    this._activeId         = null
    this._pendingPlacement = null
    this._panel = document.getElementById(threadPanelId)
    this._popup = document.getElementById(newPopupId)
    this._bindPanelEvents()
    this._bindPopupEvents()
  }

  // ── Public API ────────────────────────────────────────────────────

  startPlacement(pageIndex: number, baseX: number, baseY: number, nativeEvent: MouseEvent): void {
    this._closeThreadSilent()
    this._pendingPlacement = { pageIndex, baseX, baseY }
    this._showPopup(nativeEvent.clientX, nativeEvent.clientY)
  }

  repositionAll(scale: number): void {
    this._scale = scale
    this._comments.forEach((c, id) => {
      const pin = this._pinEls.get(id)
      if (pin) this._positionPin(pin, c)
    })
    if (this._activeId) this._repositionOpenPanel()
  }

  setInteractive(interactive: boolean): void {
    this._pinEls.forEach((pin) => {
      pin.style.pointerEvents = interactive ? 'all' : 'none'
    })
  }

  openThread(commentId: string): void {
    const c = this._comments.get(commentId)
    if (!c) return
    this._activeId = commentId
    this._pinEls.forEach((el, id) => el.classList.toggle('active', id === commentId))
    this._renderThread(c)
    if (this._panel) this._panel.style.display = 'flex'
    this._repositionOpenPanel()
  }

  closeThread(): void { this._closeThreadSilent() }

  rebuildPins(scale: number): void {
    this._scale = scale
    this._pinEls.forEach((el) => el.remove())
    this._pinEls.clear()
    this._comments.forEach((c) => this._createPin(c))
  }

  clearAll(): void {
    this._pinEls.forEach((el) => el.remove())
    this._pinEls.clear()
    this._comments.clear()
    this._counter  = 0
    this._activeId = null
    this._closeThreadSilent()
    this._hidePopup()
  }

  // ── Serialization ─────────────────────────────────────────────────

  toJSON(): XFDFCommentsState {
    return {
      counter:  this._counter,
      comments: Array.from(this._comments.values()),
    }
  }

  fromJSON(data: XFDFCommentsState, scale: number): void {
    this.clearAll()
    this._scale   = scale
    this._counter = data.counter ?? 0;
    (data.comments ?? []).forEach((c) => {
      this._comments.set(c.id ?? '', c)
      this._createPin(c)
    })
  }

  // ── Private: close ────────────────────────────────────────────────

  private _closeThreadSilent(): void {
    this._activeId = null
    if (this._panel) this._panel.style.display = 'none'
    this._pinEls.forEach((el) => el.classList.remove('active'))
  }

  // ── Private: pin DOM ──────────────────────────────────────────────

  private _createPin(comment: XFDFCommentData): void {
    const container = this._getPageLayersEl(comment.pageIndex)
    if (!container) return

    const pin             = document.createElement('div')
    pin.className         = 'comment-pin'
    pin.dataset['commentId'] = comment.id ?? ''
    pin.title = `#${comment.number} — ${comment.messages[0]?.text?.slice(0, 60) ?? ''}`
    pin.innerHTML = `
      <div class="comment-pin-badge">${comment.number}</div>
      <div class="comment-pin-tip"></div>
    `
    pin.addEventListener('click', (e) => {
      e.stopPropagation()
      if (this._activeId === comment.id) {
        this._closeThreadSilent()
      } else {
        this.openThread(comment.id ?? '')
      }
    })
    container.appendChild(pin)
    this._pinEls.set(comment.id ?? '', pin)
    this._positionPin(pin, comment)
  }

  private _positionPin(pinEl: HTMLElement, comment: XFDFCommentData): void {
    pinEl.style.left = Math.round(comment.baseX * this._scale) + 'px'
    pinEl.style.top  = Math.round(comment.baseY * this._scale) + 'px'
  }

  private _getPageLayersEl(pageIndex: number): Element | null {
    return document.querySelector(
      `#${this._pagesContainerId} [data-page-index="${pageIndex}"] .page-layers`
    )
  }

  // ── Private: thread panel ─────────────────────────────────────────

  private _renderThread(comment: XFDFCommentData): void {
    if (!this._panel) return
    const numEl = this._panel.querySelector('.ctp-pin-num')
    const msgEl = this._panel.querySelector('.ctp-messages')
    if (numEl) numEl.textContent = `#${comment.number}`
    if (!msgEl) return

    msgEl.innerHTML = comment.messages.map((m: XFDFCommentMessage) => `
      <div class="ctp-message">
        <div class="ctp-msg-header">
          <span class="ctp-msg-user">${this._shortId(m.userId)}</span>
          <span class="ctp-msg-time">${formatTime(m.timestamp)}</span>
        </div>
        <div class="ctp-msg-text">${this._safe(m.text ?? '')}</div>
      </div>
    `).join('')

    msgEl.scrollTop = (msgEl as HTMLElement).scrollHeight
  }

  private _repositionOpenPanel(): void {
    if (!this._activeId) return
    const c = this._comments.get(this._activeId)
    if (!c) return
    const { x, y } = this._pinTipClientPos(c.pageIndex, c.baseX, c.baseY)
    if (this._panel) this._positionFloating(this._panel, x, y, 308, 400)
  }

  private _pinTipClientPos(pageIndex: number, baseX: number, baseY: number): { x: number; y: number } {
    const layersEl = this._getPageLayersEl(pageIndex)
    if (!layersEl) return { x: 0, y: 0 }
    const rect = layersEl.getBoundingClientRect()
    return {
      x: rect.left + Math.round(baseX * this._scale),
      y: rect.top  + Math.round(baseY * this._scale),
    }
  }

  private _positionFloating(el: HTMLElement, tipX: number, tipY: number, elW: number, elH: number): void {
    const MARGIN   = 12
    const PIN_HALF = 13
    const GAP      = 10

    let left = tipX + PIN_HALF + GAP
    let top  = tipY - elH / 2 - PIN_HALF

    if (left + elW > window.innerWidth - MARGIN) left = tipX - PIN_HALF - GAP - elW
    if (top  + elH > window.innerHeight - MARGIN) top  = window.innerHeight - elH - MARGIN
    if (top  < MARGIN) top  = MARGIN
    if (left < MARGIN) left = MARGIN

    el.style.left = Math.round(left) + 'px'
    el.style.top  = Math.round(top)  + 'px'
  }

  private _bindPanelEvents(): void {
    if (!this._panel) return

    this._panel.querySelector('.ctp-close')?.addEventListener('click', (e) => {
      e.stopPropagation()
      this._closeThreadSilent()
    })

    const input = this._panel.querySelector('.ctp-reply-input') as HTMLInputElement | null
    const btn   = this._panel.querySelector('.ctp-reply-btn')

    const submit = () => {
      const text = input?.value?.trim()
      if (!text || !this._activeId) return
      const comment = this._comments.get(this._activeId)
      if (!comment) return
      comment.messages.push({
        id:        generateUUID(),
        userId:    this.userId,
        text,
        timestamp: Date.now(),
      })
      if (input) input.value = ''
      this._renderThread(comment)
      const pin = this._pinEls.get(this._activeId)
      if (pin) pin.title = `#${comment.number} — ${comment.messages[0]?.text?.slice(0, 60) ?? ''}`
    }

    btn?.addEventListener('click', (e) => { e.stopPropagation(); submit() })
    input?.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent
      if (ke.key === 'Enter' && !ke.shiftKey) { ke.preventDefault(); submit() }
    })
    this._panel.addEventListener('click', (e) => e.stopPropagation())
  }

  // ── Private: new-comment popup ────────────────────────────────────

  private _showPopup(cursorX: number, cursorY: number): void {
    if (!this._popup) return
    const PW = 288, PH = 140, MARGIN = 12, GAP = 14

    let left = cursorX + GAP
    let top  = cursorY - PH / 2

    if (left + PW > window.innerWidth  - MARGIN) left = cursorX - PW - GAP
    if (top  + PH > window.innerHeight - MARGIN) top  = window.innerHeight - PH - MARGIN
    if (top  < MARGIN) top  = MARGIN
    if (left < MARGIN) left = MARGIN

    this._popup.style.left    = Math.round(left) + 'px'
    this._popup.style.top     = Math.round(top)  + 'px'
    this._popup.style.display = 'flex'

    const ta = this._popup.querySelector('textarea') as HTMLTextAreaElement | null
    if (ta) { ta.value = ''; ta.focus() }
  }

  private _hidePopup(): void {
    if (this._popup) this._popup.style.display = 'none'
    this._pendingPlacement = null
  }

  private _bindPopupEvents(): void {
    if (!this._popup) return

    const ta        = this._popup.querySelector('textarea') as HTMLTextAreaElement | null
    const postBtn   = this._popup.querySelector('#btn-post-comment')
    const cancelBtn = this._popup.querySelector('#btn-cancel-comment')

    const submit = () => {
      const text = ta?.value?.trim()
      if (!text || !this._pendingPlacement) { this._hidePopup(); return }
      this._submitComment(text)
    }

    postBtn?.addEventListener('click',   (e) => { e.stopPropagation(); submit() })
    cancelBtn?.addEventListener('click', (e) => { e.stopPropagation(); this._hidePopup() })

    ta?.addEventListener('keydown', (e: Event) => {
      const ke = e as KeyboardEvent
      if (ke.key === 'Enter' && !ke.shiftKey) { ke.preventDefault(); submit() }
      if (ke.key === 'Escape') this._hidePopup()
    })
    this._popup.addEventListener('click', (e) => e.stopPropagation())
  }

  private _submitComment(text: string): void {
    if (!this._pendingPlacement) return
    const { pageIndex, baseX, baseY } = this._pendingPlacement
    this._counter++
    const comment: XFDFCommentData = {
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
    }
    this._comments.set(comment.id ?? '', comment)
    this._createPin(comment)
    this._hidePopup()
    this.openThread(comment.id ?? '')
  }

  // ── Private: helpers ──────────────────────────────────────────────

  private _shortId(id: string | null): string {
    return id ? id.slice(0, 8) + '…' : '?'
  }

  private _safe(str: string): string {
    const d = document.createElement('div')
    d.textContent = str
    return d.innerHTML
  }
}
