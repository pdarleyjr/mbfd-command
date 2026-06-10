/** Formatting helpers shared across the board and transcript. */

/** "14:32:07" in the viewer's local time. */
export function clockTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour12: false })
}

/** "Jun 10, 2026 14:32" */
export function stamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Elapsed wall-clock since an ISO instant, as "H:MM:SS" or "M:SS". */
export function elapsedSince(iso: string, nowMs: number): string {
  const start = new Date(iso).getTime()
  let s = Math.max(0, Math.floor((nowMs - start) / 1000))
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`
}

/** Confidence as a 0–100 integer percent. */
export function pct(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100)
}
