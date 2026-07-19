/** Domain model for the MBFD Command board. Kept deliberately small. */

export type ApparatusType =
  | 'command'
  | 'engine'
  | 'ladder'
  | 'rescue'
  | 'fireboat'
  | 'special'

export type IncidentMode = 'scene' | 'special_event'

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
  lat?: number
  lng?: number
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

export interface GeoLocation {
  label: string
  address: string
  lat: number | null
  lng: number | null
}

export type IncidentLifecycleStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'closed'

export interface IncidentSchedule {
  scheduledStartAt: string | null
  scheduledEndAt: string | null
  actualStartAt: string | null
  actualEndAt: string | null
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

export interface ChecklistItem {
  id: string
  text: string
  category: 'benchmarks' | 'tactical'
  completed: boolean
}

export interface Incident {
  schemaVersion: 2
  id: string
  mode: IncidentMode
  name: string
  /** Free-text incident address shown on the map header. */
  address: string
  marker: IncidentMarker | null
  commandPost: GeoLocation | null
  lifecycleStatus: IncidentLifecycleStatus
  schedule: IncidentSchedule
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
  closedAt: string | null
  revision: number
  timer?: IncidentTimer
  board: BoardState
  checklist?: ChecklistItem[]
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

export interface SharedTranscriptionState {
  incidentId: string
  enabled: boolean
  captureClientId: string | null
  captureLabel: string | null
  leaseId: string | null
  leaseExpiresAt: string | null
  startedAt: string | null
  lastAudioAt: string | null
}

export type UnitOperationalStatus = 'unassigned' | 'staged' | 'responding' | 'on_scene' | 'transporting' | 'available' | 'out_of_service'
export type RunSource = 'pulsepoint' | 'manual'
export type RunCategory = 'medical' | 'fire' | 'other'
export type RunSubtype = 'medical' | 'fire' | 'rescue' | 'vehicle' | 'hazmat' | 'alarm' | 'service' | 'marine' | 'other'
export type RunStatus = 'pending' | 'active' | 'clearing' | 'cleared' | 'cancelled'
export type MedicalDisposition = 'transport' | 'refusal' | 'no_patient' | 'assist_only' | 'not_applicable'

export interface StagingLocation {
  id: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  notes?: string
  isDefault: boolean
}

export interface IncidentUnitState {
  unitId: string
  status: UnitOperationalStatus
  stagingLocationId: string | null
  currentRunId: string | null
  previousStagingLocationId: string | null
  manualHold: boolean
  statusUpdatedAt: string
}

export interface RunUnitAssignment {
  runId: string
  unitId: string
  assignedAt: string
  enrouteAt: string | null
  onSceneAt: string | null
  transportAt: string | null
  clearedAt: string | null
  disposition: MedicalDisposition | null
  transportDestination: string
  patientCount: number | null
  notes: string
  assignmentSource: 'operator' | 'pulsepoint'
}

export interface EventRun {
  id: string
  incidentId: string
  source: RunSource
  sourceExternalId: string | null
  sourcePayload: Record<string, unknown> | null
  incidentNumber: string
  callTypeCode: string
  callTypeLabel: string
  category: RunCategory
  subtype: RunSubtype
  classificationOverridden: boolean
  address: string
  lat: number | null
  lng: number | null
  receivedAt: string
  activatedAt: string | null
  clearedAt: string | null
  status: RunStatus
  notes: string
  updatedAt: string
  unitAssignments: RunUnitAssignment[]
}

export interface SpecialEventState {
  incidentId: string
  stagingLocations: StagingLocation[]
  units: IncidentUnitState[]
  runs: EventRun[]
}
