import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ConnectionStatus, SharedTranscriptionState, TranscriptEntry } from '@/types'
import type { AudioDiagnostics } from '@/lib/mic'

const STORAGE_KEY = 'mbfd-command-transcript-v2'
const MAX_ENTRIES = 1000

interface TranscriptStore {
  entriesByIncident: Record<string, TranscriptEntry[]>
  partialByIncident: Record<string, string>
  stateByIncident: Record<string, SharedTranscriptionState>
  statusByIncident: Record<string, ConnectionStatus>
  errorByIncident: Record<string, string | null>
  diagnosticsByIncident: Record<string, AudioDiagnostics | null>
  setStatus: (incidentId: string, status: ConnectionStatus) => void
  setPartial: (incidentId: string, partial: string) => void
  setState: (incidentId: string, state: SharedTranscriptionState) => void
  setError: (incidentId: string, error: string | null) => void
  setDiagnostics: (incidentId: string, value: AudioDiagnostics | null) => void
  hydrate: (incidentId: string, entries: TranscriptEntry[]) => void
  upsertEntry: (incidentId: string, entry: TranscriptEntry) => void
  clearIncident: (incidentId: string) => void
}

export const useTranscript = create<TranscriptStore>()(
  persist(
    (set) => ({
      entriesByIncident: {},
      partialByIncident: {},
      stateByIncident: {},
      statusByIncident: {},
      errorByIncident: {},
      diagnosticsByIncident: {},
      setStatus: (id, status) => set((state) => ({ statusByIncident: { ...state.statusByIncident, [id]: status } })),
      setPartial: (id, partial) => set((state) => ({ partialByIncident: { ...state.partialByIncident, [id]: partial } })),
      setState: (id, value) => set((state) => ({ stateByIncident: { ...state.stateByIncident, [id]: value } })),
      setError: (id, error) => set((state) => ({ errorByIncident: { ...state.errorByIncident, [id]: error } })),
      setDiagnostics: (id, value) => set((state) => ({ diagnosticsByIncident: { ...state.diagnosticsByIncident, [id]: value } })),
      hydrate: (id, entries) => set((state) => ({
        entriesByIncident: { ...state.entriesByIncident, [id]: entries.slice(-MAX_ENTRIES) },
      })),
      upsertEntry: (id, entry) => set((state) => {
        const current = state.entriesByIncident[id] ?? []
        const index = current.findIndex((item) => item.id === entry.id)
        const entries = index < 0
          ? [...current, entry]
          : current.map((item, itemIndex) => itemIndex === index ? entry : item)
        return {
          partialByIncident: { ...state.partialByIncident, [id]: '' },
          entriesByIncident: { ...state.entriesByIncident, [id]: entries.slice(-MAX_ENTRIES) },
        }
      }),
      clearIncident: (id) => set((state) => ({
        entriesByIncident: { ...state.entriesByIncident, [id]: [] },
        partialByIncident: { ...state.partialByIncident, [id]: '' },
      })),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      partialize: (state) => ({ entriesByIncident: state.entriesByIncident }),
    },
  ),
)
