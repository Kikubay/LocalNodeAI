import { create } from 'zustand'

export type AutosaveState = 'off' | 'unavailable' | 'idle' | 'saving' | 'saved'

type AutosaveStore = {
  state: AutosaveState
  savedAt: number | null
  restoredAt: number | null
  markSaving: () => void
  markSaved: () => void
  markRestored: () => void
  markDisabled: (state: AutosaveState) => void
}

export const useAutosaveStore = create<AutosaveStore>()((set) => ({
  state: 'idle',
  savedAt: null,
  restoredAt: null,
  markSaving: () => set({ state: 'saving' }),
  markSaved: () => set({ state: 'saved', savedAt: Date.now() }),
  markRestored: () => set({ restoredAt: Date.now() }),
  markDisabled: (state) => set({ state }),
}))