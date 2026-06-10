import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ConnectionStatus, TranscriptEntry } from '@/types'

const STORAGE_KEY = 'mbfd-command-transcript-v1'
const MAX_ENTRIES = 1000

interface TranscriptStore {
  status: ConnectionStatus
  /** Live, not-yet-finalized partial line from the ASR. */
  partial: string
  /** RMS input level 0..1 for the mic meter. */
  level: number
  error: string | null
  /** Finalized, AI-parsed lines, oldest → newest. */
  entries: TranscriptEntry[]

  setStatus: (status: ConnectionStatus) => void
  setPartial: (partial: string) => void
  setLevel: (level: number) => void
  setError: (error: string | null) => void
  addEntry: (entry: TranscriptEntry) => void
  clear: () => void
}

export const useTranscript = create<TranscriptStore>()(
  persist(
    (set) => ({
      status: 'idle',
      partial: '',
      level: 0,
      error: null,
      entries: [],

      setStatus: (status) => set({ status }),
      setPartial: (partial) => set({ partial }),
      setLevel: (level) => set({ level }),
      setError: (error) => set({ error }),
      addEntry: (entry) =>
        set((s) => ({
          partial: '',
          entries: [...s.entries, entry].slice(-MAX_ENTRIES),
        })),
      clear: () => set({ entries: [], partial: '' }),
    }),
    {
      name: STORAGE_KEY,
      // Only the finalized log is durable; live status/partials are ephemeral.
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
)
