import type { DocumentType } from '../types/index'

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

export function getDocumentType(nameOrMime: string): DocumentType | null {
  if (!nameOrMime) return null
  const s = nameOrMime.toLowerCase()
  if (s.includes('pdf') || s.endsWith('.pdf')) return 'pdf'
  if (s.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/) || s.startsWith('image/')) return 'image'
  return null
}

export function toPdfDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0')
  return (
    `D:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  )
}

export function fromPdfDate(str: string): number {
  if (!str) return Date.now()
  const m = str.match(/^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
  if (m) {
    return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).getTime()
  }
  return new Date(str).getTime() || Date.now()
}
