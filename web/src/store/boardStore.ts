import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ApparatusType, BoardState, Incident, IncidentMarker, Placement } from '@/types'
import { DEFAULT_COLUMN_TITLES, DEFAULT_UNIT_ORDER, DEFAULT_CHECKLIST_ITEMS } from '@/data/units'
import * as ops from '@/store/boardOps'
import { uid } from '@/lib/id'
import { stamp } from '@/lib/format'

const STORAGE_KEY = 'mbfd-command-v1'

function nowIso(): string {
  return new Date().toISOString()
}

function freshBoard(): BoardState {
  return ops.emptyBoard(DEFAULT_COLUMN_TITLES, DEFAULT_UNIT_ORDER)
}

function newIncident(name?: string): Incident {
  const at = nowIso()
  return {
    schemaVersion: 2,
    id: uid('inc'),
    mode: 'scene',
    name: name?.trim() || `Incident — ${stamp(at)}`,
    address: '',
    marker: null,
    commandPost: null,
    lifecycleStatus: 'active',
    schedule: {
      scheduledStartAt: null,
      scheduledEndAt: null,
      actualStartAt: at,
      actualEndAt: null,
    },
    createdAt: at,
    updatedAt: at,
    closedAt: null,
    revision: 0,
    timer: { startedAt: null, accumulatedMs: 0, running: false },
    board: freshBoard(),
    checklist: DEFAULT_CHECKLIST_ITEMS.map((item) => ({
      id: uid('chk'),
      text: item.text,
      category: item.category,
      completed: false,
    })),
  }
}

export function normalizeIncidentV2(incident: Partial<Incident> & Pick<Incident, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'board'>): Incident {
  const closedAt = incident.closedAt ?? null
  const timer = incident.timer ?? { startedAt: null, accumulatedMs: 0, running: false }
  return {
    ...incident,
    schemaVersion: 2,
    mode: incident.mode ?? 'scene',
    address: incident.address ?? '',
    marker: incident.marker ?? null,
    commandPost: incident.commandPost ?? null,
    lifecycleStatus: incident.lifecycleStatus ?? (closedAt ? 'closed' : 'active'),
    schedule: incident.schedule ?? {
      scheduledStartAt: null,
      scheduledEndAt: null,
      actualStartAt: timer.startedAt ?? incident.createdAt,
      actualEndAt: closedAt,
    },
    closedAt,
    revision: Math.max(0, incident.revision ?? 0),
    timer,
    board: ops.reconcileRoster(incident.board, DEFAULT_UNIT_ORDER),
    checklist: incident.checklist ?? DEFAULT_CHECKLIST_ITEMS.map((item) => ({
      id: uid('chk'),
      text: item.text,
      category: item.category,
      completed: false,
    })),
  }
}

interface CommandStore {
  incidents: Incident[]
  activeIncidentId: string | null

  getActive: () => Incident | null

  // ── Incident lifecycle ────────────────────────────────────────────
  createIncident: (name?: string) => string
  resumeIncident: (id: string) => void
  renameIncident: (id: string, name: string) => void
  closeIncident: (id: string) => void
  reopenIncident: (id: string) => void
  deleteIncident: (id: string) => void
  applyRemoteIncident: (incident: Incident) => void

  // ── Active incident details ───────────────────────────────────────
  setAddress: (address: string) => void
  setMarker: (marker: IncidentMarker | null) => void
  startIncidentTimer: () => void
  stopIncidentTimer: () => void
  resetIncidentTimer: () => void

  // ── Board operations (active incident) ────────────────────────────
  moveUnit: (unitId: string, to: Placement, index?: number) => void
  addUnit: (label: string, type: ApparatusType) => void
  editUnit: (unitId: string, label: string, type: ApparatusType) => void
  addColumn: (title?: string) => void
  renameColumn: (id: string, title: string) => void
  setColumnLocation: (id: string, location: string) => void
  setColumnMarker: (columnId: string, lat: number | null, lng: number | null) => void
  deleteColumn: (id: string, dest?: Placement) => void
  moveColumnById: (id: string, toIndex: number) => void
  recoverUnitsToBank: () => void
  resetBoard: () => void
  importBoard: (board: BoardState) => void
  syncPulsePointUnits: (units: { id: string }[]) => void

  // ── Checklist operations ──────────────────────────────────────────
  toggleChecklistItem: (itemId: string) => void
  addChecklistItem: (text: string, category: 'benchmarks' | 'tactical') => void
  completeAllChecklistItems: (category: 'benchmarks' | 'tactical') => void
}

export const useBoard = create<CommandStore>()(
  persist(
    (set, get) => {
      /** Apply an immutable update to the active incident + bump updatedAt. */
      const patchActive = (fn: (inc: Incident) => Incident) =>
        set((state) => {
          const id = state.activeIncidentId
          if (!id) return state
          return {
            incidents: state.incidents.map((inc) =>
              inc.id === id ? { ...fn(inc), updatedAt: nowIso() } : inc,
            ),
          }
        })

      const patchBoard = (fn: (board: BoardState) => BoardState) =>
        patchActive((inc) => ({ ...inc, board: fn(inc.board) }))

      return {
        incidents: [],
        activeIncidentId: null,

        getActive: () => {
          const { incidents, activeIncidentId } = get()
          return incidents.find((i) => i.id === activeIncidentId) ?? null
        },

        createIncident: (name) => {
          const inc = newIncident(name)
          set((state) => ({
            incidents: [inc, ...state.incidents],
            activeIncidentId: inc.id,
          }))
          return inc.id
        },

        resumeIncident: (id) =>
          set((state) =>
            state.incidents.some((i) => i.id === id) ? { activeIncidentId: id } : state,
          ),

        renameIncident: (id, name) =>
          set((state) => ({
            incidents: state.incidents.map((inc) =>
              inc.id === id
                ? { ...inc, name: name.trim() || inc.name, updatedAt: nowIso() }
                : inc,
            ),
          })),

        closeIncident: (id) =>
          set((state) => {
            const incidents = state.incidents.map((inc) =>
              inc.id === id ? { ...inc, closedAt: nowIso(), updatedAt: nowIso() } : inc,
            )
            // If we closed the active incident, fall back to the newest open one.
            let activeIncidentId = state.activeIncidentId
            if (activeIncidentId === id) {
              const open = incidents.find((i) => !i.closedAt)
              activeIncidentId = open ? open.id : null
            }
            return { incidents, activeIncidentId }
          }),

        reopenIncident: (id) =>
          set((state) => ({
            incidents: state.incidents.map((inc) =>
              inc.id === id ? { ...inc, closedAt: null, updatedAt: nowIso() } : inc,
            ),
            activeIncidentId: id,
          })),

        deleteIncident: (id) =>
          set((state) => {
            const incidents = state.incidents.filter((i) => i.id !== id)
            let activeIncidentId = state.activeIncidentId
            if (activeIncidentId === id) {
              activeIncidentId = incidents[0]?.id ?? null
            }
            return { incidents, activeIncidentId }
          }),

        applyRemoteIncident: (incident) => {
          const remote = normalizeIncidentV2(incident)
          set((state) => {
            const exists = state.incidents.some((inc) => inc.id === remote.id)
            return {
              incidents: exists
                ? state.incidents.map((inc) => (inc.id === remote.id ? remote : inc))
                : [remote, ...state.incidents],
            }
          })
        },

        setAddress: (address) => patchActive((inc) => ({ ...inc, address })),
        setMarker: (marker) => patchActive((inc) => ({ ...inc, marker })),

        startIncidentTimer: () =>
          patchActive((inc) => {
            const timer = inc.timer ?? { startedAt: null, accumulatedMs: 0, running: false }
            if (timer.running) return inc
            return { ...inc, timer: { ...timer, startedAt: nowIso(), running: true } }
          }),
        stopIncidentTimer: () =>
          patchActive((inc) => {
            const timer = inc.timer ?? { startedAt: null, accumulatedMs: 0, running: false }
            if (!timer.running || !timer.startedAt) return inc
            return {
              ...inc,
              timer: {
                startedAt: null,
                accumulatedMs: timer.accumulatedMs + Math.max(0, Date.now() - new Date(timer.startedAt).getTime()),
                running: false,
              },
            }
          }),
        resetIncidentTimer: () =>
          patchActive((inc) => ({
            ...inc,
            timer: { startedAt: null, accumulatedMs: 0, running: false },
          })),

        moveUnit: (unitId, to, index) =>
          patchBoard((b) => ops.moveUnit(b, unitId, to, index)),
        addUnit: (label, type) => {
          const id = label.trim()
          if (!id) return
          patchBoard((b) => ops.addUnit(b, { id, label: id, type }))
        },
        editUnit: (unitId, label, type) => {
          const next = label.trim()
          if (!next) return
          patchBoard((b) => ops.editUnit(b, unitId, { id: unitId, label: next, type }))
        },
        addColumn: (title) => patchBoard((b) => ops.addColumn(b, title)),
        renameColumn: (id, title) => patchBoard((b) => ops.renameColumn(b, id, title)),
        setColumnLocation: (id, location) =>
          patchBoard((b) => ops.setColumnLocation(b, id, location)),
        setColumnMarker: (columnId, lat, lng) =>
          patchBoard((b) => ({
            ...b,
            columns: b.columns.map((c) =>
              c.id === columnId
                ? { ...c, lat: lat ?? undefined, lng: lng ?? undefined }
                : c,
            ),
          })),
        deleteColumn: (id, dest) => patchBoard((b) => ops.deleteColumn(b, id, dest)),
        moveColumnById: (id, toIndex) => patchBoard((b) => ops.moveColumnById(b, id, toIndex)),
        recoverUnitsToBank: () =>
          patchBoard((b) => ops.recoverUnitsToBank(b, DEFAULT_UNIT_ORDER)),
        resetBoard: () => patchActive((inc) => ({ ...inc, board: freshBoard() })),
        importBoard: (board) => patchBoard(() => ops.reconcileRoster(board, DEFAULT_UNIT_ORDER)),
        syncPulsePointUnits: (units) =>
          patchBoard((b) => {
            let columns = [...b.columns]
            // Find or create "Dispatch" column
            let dispatchCol = columns.find(
              (c) => c.title.toLowerCase() === 'dispatch'
            )
            if (!dispatchCol) {
              dispatchCol = ops.makeColumn('Dispatch')
              columns = [dispatchCol, ...columns]
            } else {
              // Copy to avoid raw mutation of nested arrays
              dispatchCol = { ...dispatchCol, unitIds: [...dispatchCol.unitIds] }
              columns = columns.map((c) => c.id === dispatchCol!.id ? dispatchCol! : c)
            }

            // Find units already assigned to columns other than Dispatch
            const assignedUnitIds = new Set<string>()
            b.columns.forEach((c) => {
              if (c.title.toLowerCase() !== 'dispatch') {
                c.unitIds.forEach((uid) => assignedUnitIds.add(uid))
              }
            })

            let bankUnitIds = [...b.bankUnitIds]
            const customUnits = [...(b.customUnits ?? [])]
            const unitTimers = { ...(b.unitTimers ?? {}) }

            units.forEach((u) => {
              const unitId = u.id.trim()
              if (!unitId) return

              // PulsePoint is advisory. Unknown apparatus must be explicitly
              // confirmed by an operator before it becomes an MBFD board unit.
              const isKnown =
                DEFAULT_UNIT_ORDER.includes(unitId) || customUnits.some((cu) => cu.id === unitId)
              if (!isKnown) return

              // If the unit is already assigned to some OTHER column, leave it there
              if (assignedUnitIds.has(unitId)) {
                return
              }

              // If it's already in the Dispatch column, don't duplicate it
              if (dispatchCol!.unitIds.includes(unitId)) {
                return
              }

              // If it is currently in the bank, remove it from the bank
              bankUnitIds = bankUnitIds.filter((id) => id !== unitId)

              // Add it to the Dispatch column
              dispatchCol!.unitIds.push(unitId)

              // Set unit timer
              unitTimers[unitId] = {
                columnId: dispatchCol!.id,
                startedAt: new Date().toISOString(),
              }
            })

            return {
              ...b,
              columns,
              customUnits,
              bankUnitIds,
              unitTimers,
            }
          }),

        toggleChecklistItem: (itemId) =>
          patchActive((inc) => ({
            ...inc,
            checklist: (inc.checklist ?? []).map((item) =>
              item.id === itemId ? { ...item, completed: !item.completed } : item
            ),
          })),

        addChecklistItem: (text, category) => {
          const trimmed = text.trim()
          if (!trimmed) return
          patchActive((inc) => ({
            ...inc,
            checklist: [
              ...(inc.checklist ?? []),
              {
                id: uid('chk'),
                text: trimmed,
                category,
                completed: false,
              },
            ],
          }))
        },

        completeAllChecklistItems: (category) =>
          patchActive((inc) => ({
            ...inc,
            checklist: (inc.checklist ?? []).map((item) =>
              item.category === category ? { ...item, completed: true } : item
            ),
          })),
      }
    },
    {
      name: STORAGE_KEY,
      version: 2,
      partialize: (state) => ({
        incidents: state.incidents,
        activeIncidentId: state.activeIncidentId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Reconcile every board against the current roster so no card is lost
        // if the roster changes between releases.
        state.incidents = state.incidents.map((inc) => ({
          ...normalizeIncidentV2(inc),
        }))
        // Guarantee there is always an active, open incident to work in.
        const open = state.incidents.find((i) => i.id === state.activeIncidentId && !i.closedAt)
        if (!open) {
          const anyOpen = state.incidents.find((i) => !i.closedAt)
          state.activeIncidentId = anyOpen?.id ?? null
        }
      },
    },
  ),
)

/**
 * Ensure there is an active incident on first load (called once from the app
 * root, after rehydration). Kept out of the store init so it doesn't run during
 * SSR/tests unexpectedly.
 */
export function ensureActiveIncident(): void {
  const { activeIncidentId, incidents, resumeIncident } = useBoard.getState()
  if (activeIncidentId && incidents.some((i) => i.id === activeIncidentId)) return
  const open = incidents.find((i) => !i.closedAt)
  if (open) resumeIncident(open.id)
}
