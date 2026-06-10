import type { Incident, TranscriptEntry } from '@/types'
import { UNIT_BY_ID } from '@/data/units'
import { clockTime, pct, stamp } from '@/lib/format'

/** Trigger a client-side file download. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function slug(s: string): string {
  return (s || 'incident').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40)
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function transcriptToCsv(entries: TranscriptEntry[]): string {
  const header = [
    'time',
    'iso',
    'display_prefix',
    'speaker',
    'recipient',
    'message_type',
    'priority',
    'confidence_pct',
    'raw_text',
    'corrected_text',
    'flags',
  ]
  const rows = entries.map((e) =>
    [
      clockTime(e.at),
      e.at,
      e.displayPrefix,
      e.speaker ?? '',
      e.recipient ?? '',
      e.messageType,
      e.priority,
      pct(e.confidence),
      e.rawText,
      e.correctedText,
      e.flags.join('|'),
    ]
      .map(csvCell)
      .join(','),
  )
  return [header.join(','), ...rows].join('\n')
}

/** A single structured object combining incident + board + transcript. */
export function buildIncidentExport(incident: Incident, entries: TranscriptEntry[]) {
  return {
    app: 'MBFD Command',
    schema: 1,
    exportedAt: new Date().toISOString(),
    incident: {
      id: incident.id,
      name: incident.name,
      address: incident.address,
      marker: incident.marker,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      closedAt: incident.closedAt,
    },
    board: {
      columns: incident.board.columns.map((c) => ({
        title: c.title,
        location: c.location,
        units: c.unitIds.map((id) => UNIT_BY_ID[id]?.label ?? id),
      })),
      unassigned: incident.board.bankUnitIds.map((id) => UNIT_BY_ID[id]?.label ?? id),
    },
    transcript: entries.map((e) => ({
      at: e.at,
      displayPrefix: e.displayPrefix,
      speaker: e.speaker,
      recipient: e.recipient,
      messageType: e.messageType,
      priority: e.priority,
      confidence: e.confidence,
      rawText: e.rawText,
      correctedText: e.correctedText,
      flags: e.flags,
    })),
  }
}

export function exportIncidentJson(incident: Incident, entries: TranscriptEntry[]): void {
  const data = buildIncidentExport(incident, entries)
  downloadFile(
    `mbfd-command-${slug(incident.name)}.json`,
    JSON.stringify(data, null, 2),
    'application/json',
  )
}

export function exportTranscriptCsv(incident: Incident, entries: TranscriptEntry[]): void {
  downloadFile(
    `mbfd-transcript-${slug(incident.name)}.csv`,
    transcriptToCsv(entries),
    'text/csv;charset=utf-8',
  )
}

export function exportBoardJson(incident: Incident): void {
  const board = buildIncidentExport(incident, []).board
  downloadFile(
    `mbfd-board-${slug(incident.name)}.json`,
    JSON.stringify({ incident: incident.name, board }, null, 2),
    'application/json',
  )
}

/** Open the print dialog (print.css lays the page out flat for PDF). */
export function printIncident(): void {
  window.print()
}

export { stamp }
