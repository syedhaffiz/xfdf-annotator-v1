/** Generate a UUID v4 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Debounce a function */
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Format a timestamp to a locale time string */
export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString();
}

/**
 * Detect document type from filename or MIME type string.
 * @param {string} nameOrMime
 * @returns {'pdf'|'image'|null}
 */
export function getDocumentType(nameOrMime) {
  if (!nameOrMime) return null;
  const s = nameOrMime.toLowerCase();
  if (s.includes('pdf') || s.endsWith('.pdf')) return 'pdf';
  if (s.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/) || s.startsWith('image/')) return 'image';
  return null;
}

/**
 * Format a JS timestamp as a PDF date string: D:YYYYMMDDHHmmss
 * @param {number} ts
 * @returns {string}
 */
export function toPdfDate(ts) {
  const d = new Date(ts);
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
         `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Parse a PDF date string back to a JS timestamp.
 * Supports D:YYYYMMDDHHmmss or ISO-8601 fallback.
 * @param {string} str
 * @returns {number}
 */
export function fromPdfDate(str) {
  if (!str) return Date.now();
  const m = str.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (m) {
    return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).getTime();
  }
  return new Date(str).getTime() || Date.now();
}
