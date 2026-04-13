/**
 * main.js — Entry point
 *
 * Wires all DOM events (toolbar, mode toggle, file pickers, keyboard
 * shortcuts, toasts) to the DocumentAnnotator instance.
 *
 * Save/load uses XFDF (ISO 19444-1) instead of custom JSON.
 */

import { DocumentAnnotator } from './core/DocumentAnnotator.js';

// ── Boot ──────────────────────────────────────────────────────────────────────

const annotator = new DocumentAnnotator();

document.getElementById('user-id-display').textContent =
  annotator.userId.slice(0, 13) + '…';

// ── File Open ─────────────────────────────────────────────────────────────────

const fileInput    = document.getElementById('file-input');
const btnOpenFile  = document.getElementById('btn-open-file');
const btnOpenEmpty = document.getElementById('btn-open-empty');

function triggerOpen() { fileInput.click(); }
btnOpenFile.addEventListener('click',  triggerOpen);
btnOpenEmpty.addEventListener('click', triggerOpen);

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  fileInput.value = '';
  try {
    await annotator.loadFile(file);
    toast(`Loaded: ${file.name}`, 'success');
  } catch (err) {
    console.error(err);
    toast(`Error: ${err.message}`, 'error');
  }
});

// ── Mode Toggle ───────────────────────────────────────────────────────────────

const modeBtns = document.querySelectorAll('.mode-btn');

modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    modeBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    annotator.setMode(mode);
    toast(mode === 'view' ? 'View mode — canvas locked' : 'Edit mode — ready to annotate', 'info', 2000);
  });
});

// ── Toolbar Tools ─────────────────────────────────────────────────────────────

const toolBtns    = document.querySelectorAll('.tool-btn[data-tool]');
const polygonHint = document.getElementById('polygon-hint');

function activateTool(tool) {
  if (annotator.getMode() === 'view') return;

  toolBtns.forEach((b) => b.classList.remove('active'));
  const btn = document.querySelector(`.tool-btn[data-tool="${tool}"]`);
  if (btn) btn.classList.add('active');

  if (tool === 'image') {
    document.getElementById('image-insert-input').click();
    document.querySelector(`.tool-btn[data-tool="${annotator._canvas.currentTool}"]`)?.classList.add('active');
    return;
  }

  annotator.setTool(tool);
  polygonHint.style.display = (tool === 'polygon') ? 'flex' : 'none';
}

toolBtns.forEach((btn) => {
  btn.addEventListener('click', () => activateTool(btn.dataset.tool));
});

// Keyboard shortcuts
const keyMap = {
  v: 'select', p: 'freehand', l: 'line', a: 'arrow',
  r: 'rectangle', c: 'circle', g: 'polygon',
  t: 'text', m: 'comment', e: 'eraser', i: 'image',
};

document.addEventListener('keydown', (ev) => {
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const tool = keyMap[ev.key.toLowerCase()];
  if (tool) activateTool(tool);
});

// ── Color & Brush Size ────────────────────────────────────────────────────────

const colorPicker  = document.getElementById('color-picker');
const brushSlider  = document.getElementById('brush-size');
const brushSizeVal = document.getElementById('brush-size-val');

colorPicker.addEventListener('input', (e) => annotator.setColor(e.target.value));

brushSlider.addEventListener('input', (e) => {
  const w = parseInt(e.target.value, 10);
  brushSizeVal.textContent = w + 'px';
  annotator.setStrokeWidth(w);
});

// ── Insert Image ──────────────────────────────────────────────────────────────

const imageInsertInput = document.getElementById('image-insert-input');

imageInsertInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  imageInsertInput.value = '';
  annotator.insertImage(file);
  toast(`Image inserted on page ${annotator._activePageIndex + 1}`, 'success');
  activateTool('select');
});

// ── Save XFDF ────────────────────────────────────────────────────────────────

document.getElementById('btn-save').addEventListener('click', () => {
  try {
    const xfdf = annotator.save();
    const blob = new Blob([xfdf], { type: 'application/vnd.adobe.xfdf' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: `annotations-${Date.now()}.xfdf`,
    });
    a.click();
    URL.revokeObjectURL(url);
    toast('Saved as XFDF!', 'success');
  } catch (err) {
    console.error(err);
    toast('Save failed: ' + err.message, 'error');
  }
});

// ── Load XFDF ────────────────────────────────────────────────────────────────

const xfdfInput   = document.getElementById('xfdf-input');
const btnLoadXFDF = document.getElementById('btn-load-xfdf');

btnLoadXFDF.addEventListener('click', () => xfdfInput.click());

xfdfInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  xfdfInput.value = '';
  try {
    const text = await file.text();
    await annotator.restore(text);
    toast('Annotations restored from XFDF!', 'success');
  } catch (err) {
    console.error(err);
    toast('Load failed — make sure a document is loaded first.', 'error');
  }
});

// ── Activity Log ──────────────────────────────────────────────────────────────

document.getElementById('btn-clear-log').addEventListener('click', () => {
  annotator.clearLog();
});

// ── Close comment thread / popup on outside click ────────────────────────────

document.addEventListener('click', (e) => {
  const cm = annotator._comments;

  if (cm._ignoreNextDocClick) {
    cm._ignoreNextDocClick = false;
    return;
  }

  const panel = document.getElementById('comment-thread-panel');
  const popup = document.getElementById('new-comment-popup');

  if (panel && panel.style.display !== 'none') {
    const onPin   = e.target.closest('.comment-pin');
    const inPanel = panel.contains(e.target);
    if (!onPin && !inPanel) cm.closeThread();
  }

  if (popup && popup.style.display !== 'none') {
    const inPopup  = popup.contains(e.target);
    const onCanvas = e.target.closest('.page-layers');
    if (!inPopup && !onCanvas) cm._hidePopup();
  }
});

// ── Toast utility ─────────────────────────────────────────────────────────────

function toast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  const el        = Object.assign(document.createElement('div'), {
    className:   `toast ${type}`,
    textContent: message,
  });
  container.appendChild(el);
  setTimeout(() => {
    el.style.cssText = 'opacity:0;transition:opacity .3s;';
    setTimeout(() => el.remove(), 350);
  }, duration);
}

// Dev handle
window.__annotator = annotator;
