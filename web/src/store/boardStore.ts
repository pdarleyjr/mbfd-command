import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BoardState, Incident, IncidentMarker, Placement } from '@/types'
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
    board: freshBoard(),
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

  // ── Active incident details ───────────────────────────────────────
  setAddress: (address: string) => void
  setMarker: (marker: IncidentMarker | null) => void

  // ── Board operations (active incident) ────────────────────────────
  moveUnit: (unitId: string, to: Placement, index?: number) => void
  addColumn: (title?: string) => void
  renameColumn: (id: string, title: string) => void
  setColumnLocation: (id: string, location: string) => void
  deleteColumn: (id: string, dest?: Placement) => void
  moveColumnById: (id: string, toIndex: number) => void
  recoverUnitsToBank: () => void
  resetBoard: () => void
  importBoard: (board: BoardState) => void
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

        setAddress: (address) => patchActive((inc) => ({ ...inc, address })),
        setMarker: (marker) => patchActive((inc) => ({ ...inc, marker })),

        moveUnit: (unitId, to, index) =>
          patchBoard((b) => ops.moveUnit(b, unitId, to, index)),
        addColumn: (title) => patchBoard((b) => ops.addColumn(b, title)),
        renameColumn: (id, title) => patchBoard((b) => ops.renameColumn(b, id, title)),
        setColumnLocation: (id, location) =>
          patchBoard((b) => ops.setColumnLocation(b, id, location)),
        deleteColumn: (id, dest) => patchBoard((b) => ops.deleteColumn(b, id, dest)),
        moveColumnById: (id, toIndex) => patchBoard((b) => ops.moveColumnById(b, id, toIndex)),
        recoverUnitsToBank: () =>
          patchBoard((b) => ops.recoverUnitsToBank(b, DEFAULT_UNIT_ORDER)),
        resetBoard: () => patchActive((inc) => ({ ...inc, board: freshBoard() })),
        importBoard: (board) => patchBoard(() => board),
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
          ...inc,
          board: ops.reconcileRoster(inc.board, DEFAULT_UNIT_ORDER),
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
