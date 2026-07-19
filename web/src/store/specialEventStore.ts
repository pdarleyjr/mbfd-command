import { create } from 'zustand'
import type { SpecialEventState } from '@/types'
import { specialEventApi } from '@/lib/specialEventApi'

interface SpecialEventStore {
  byIncident: Record<string, SpecialEventState>
  loadingByIncident: Record<string, boolean>
  errorByIncident: Record<string, string | null>
  refresh: (incidentId: string) => Promise<void>
}

export const useSpecialEvents = create<SpecialEventStore>((set) => ({
  byIncident: {}, loadingByIncident: {}, errorByIncident: {},
  refresh: async (incidentId) => {
    set((state) => ({ loadingByIncident: { ...state.loadingByIncident, [incidentId]: true } }))
    try {
      const value = await specialEventApi.state(incidentId)
      set((state) => ({
        byIncident: { ...state.byIncident, [incidentId]: value },
        loadingByIncident: { ...state.loadingByIncident, [incidentId]: false },
        errorByIncident: { ...state.errorByIncident, [incidentId]: null },
      }))
    } catch (error) {
      set((state) => ({
        loadingByIncident: { ...state.loadingByIncident, [incidentId]: false },
        errorByIncident: { ...state.errorByIncident, [incidentId]: error instanceof Error ? error.message : 'Could not load event state' },
      }))
    }
  },
}))
