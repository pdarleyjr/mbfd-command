import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ApparatusType, BoardState, Incident, IncidentMarker, Placement } from '@/types'
import { DEFAULT_COLUMN_TITLES, DEFAULT_UNIT_ORDER } from '@/data/units'
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
    id: uid('inc'),
    name: name?.trim() || `Incident — ${stamp(at)}`,
    address: '',
    marker: null,
    createdAt: at,
    updatedAt: at,
    closedAt: null,
    timer: { startedAt: null, accumulatedMs: 0, running: false },
    board: freshBoard(),
  }
}

function normalizeIncident(incident: Incident): Incident {
  return {
    ...incident,
    timer: incident.timer ?? { startedAt: null, accumulatedMs: 0, running: false },
    board: ops.reconcileRoster(incident.board, DEFAULT_UNIT_ORDER),
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
          const remote = normalizeIncident(incident)
          set((state) => {
            const exists = state.incidents.some((inc) => inc.id === remote.id)
            return {
              incidents: exists
                ? state.incidents.map((inc) => (inc.id === remote.id ? remote : inc))
                : [remote, ...state.incidents],
              activeIncidentId: remote.id,
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

              // Ensure the unit is defined
              if (!customUnits.some((cu) => cu.id === unitId)) {
                let type: ApparatusType = 'special'
                const label = unitId.toUpperCase()
                if (label.startsWith('E')) type = 'engine'
                else if (label.startsWith('L') || label.startsWith('T') || label.startsWith('TRK')) type = 'ladder'
                else if (label.startsWith('R') || label.startsWith('RE')) type = 'rescue'
                else if (label.startsWith('F') || label.startsWith('FB')) type = 'fireboat'
                else if (label.startsWith('C') || label.startsWith('CH') || label.startsWith('CAPT') || label.startsWith('IC')) type = 'command'

                customUnits.push({ id: unitId, label: unitId, type })
              }

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
      }
    },
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({
        incidents: state.incidents,
        activeIncidentId: state.activeIncidentId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        // Reconcile every board against the current roster so no card is lost
        // if the roster changes between releases.
        state.incidents = state.incidents.map((inc) => ({
          ...normalizeIncident(inc),
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
  const { activeIncidentId, incidents, createIncident, resumeIncident } = useBoard.getState()
  if (activeIncidentId && incidents.some((i) => i.id === activeIncidentId)) return
  const open = incidents.find((i) => !i.closedAt)
  if (open) resumeIncident(open.id)
  else createIncident()
}
