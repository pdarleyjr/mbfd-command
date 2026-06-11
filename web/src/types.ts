/** Domain model for the MBFD Command board. Kept deliberately small. */

export type ApparatusType =
  | 'command'
  | 'engine'
  | 'ladder'
  | 'rescue'
  | 'fireboat'
  | 'special'

export interface Unit {
  /** Stable id — the radio designator, e.g. "E1", "R44", "Capt. 5". */
  id: string
  /** Display label (what shows on the card). Usually same as id. */
  label: string
  type: ApparatusType
}

/** A command column / assignment group (Command, Staging, Fire Attack, …). */
export interface Column {
  id: string
  title: string
  /** Optional geographic / tactical note: "Alpha side", "Roof", "Division 2". */
  location: string
  /** Ordered unit ids currently assigned to this column. */
  unitIds: string[]
}

export interface UnitTimer {
  columnId: string
  startedAt: string
}

export interface IncidentTimer {
  startedAt: string | null
  accumulatedMs: number
  running: boolean
}

/** Placement of every unit: either in the bank pool or inside a column. */
export type Placement = { kind: 'bank' } | { kind: 'column'; columnId: string }

export interface IncidentMarker {
  lat: number
  lng: number
}

export interface BoardState {
  /** Column order is the array order. */
  columns: Column[]
  /** Units currently sitting in the left-hand bank (ordered). */
  bankUnitIds: string[]
  /** Units added on scene that are not part of the default roster. */
  customUnits?: Unit[]
  /** Per-unit timer that starts whenever a unit is dropped into a column. */
  unitTimers?: Record<string, UnitTimer>
}

export interface Incident {
  id: string
  name: string
  /** Free-text incident address shown on the map header. */
  address: string
  marker: IncidentMarker | null
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
  closedAt: string | null
  timer?: IncidentTimer
  board: BoardState
}

// ── Live transcription ──────────────────────────────────────────────────────

export type MessagePriority = 'routine' | 'important' | 'urgent' | 'emergency'

export type MessageType =
  | 'fire_attack'
  | 'search'
  | 'rescue'
  | 'water_supply'
  | 'command'
  | 'size_up'
  | 'par'
  | 'mayday'
  | 'medical'
  | 'staging'
  | 'ventilation'
  | 'rehab'
  | 'status'
  | 'unknown'

/** A finalized, AI-parsed radio transmission line. */
export interface TranscriptEntry {
  id: string
  /** ISO timestamp the line was finalized. */
  at: string
  speaker: string | null
  recipient: string | null
  /** Short token shown before the line: "E1" or "inaudible". */
  displayPrefix: string
  rawText: string
  correctedText: string
  messageType: MessageType
  priority: MessagePriority
  /** 0..1 — combined ASR/parse confidence. */
  confidence: number
  flags: string[]
}

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'reconnecting'
  | 'error'
