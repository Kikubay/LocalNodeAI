import { create } from 'zustand'

export type RunStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled'

export type RunStep = {
  nodeId: string
  label: string
  detail: string
  state: 'running' | 'done' | 'error' | 'skipped'
}

type ExecutionState = {
  status: RunStatus
  error: string | null
  steps: RunStep[]
  startedAt: number | null
  durationMs: number | null
  cancelRequested: boolean
  begin: () => void
  setStep: (step: RunStep) => void
  finish: () => void
  fail: (message: string) => void
  requestCancel: () => void
  isCancelled: () => boolean
  reset: () => void
}

export const useExecutionStore = create<ExecutionState>()((set, get) => ({
  status: 'idle',
  error: null,
  steps: [],
  startedAt: null,
  durationMs: null,
  cancelRequested: false,
  begin: () =>
    set({
      status: 'running',
      error: null,
      steps: [],
      startedAt: Date.now(),
      durationMs: null,
      cancelRequested: false,
    }),
  setStep: (step) =>
    set((state) => {
      const steps = state.steps.filter((entry) => entry.nodeId !== step.nodeId)
      steps.push(step)
      return { steps }
    }),
  finish: () => {
    const startedAt = get().startedAt
    set({
      status: get().cancelRequested ? 'cancelled' : 'done',
      durationMs: startedAt ? Date.now() - startedAt : null,
    })
  },
  fail: (message) => {
    const startedAt = get().startedAt
    set({ status: 'error', error: message, durationMs: startedAt ? Date.now() - startedAt : null })
  },
  requestCancel: () => set({ cancelRequested: true }),
  isCancelled: () => get().cancelRequested,
  reset: () =>
    set({
      status: 'idle',
      error: null,
      steps: [],
      startedAt: null,
      durationMs: null,
      cancelRequested: false,
    }),
}))