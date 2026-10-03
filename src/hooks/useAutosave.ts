import { useEffect } from 'react'
import { autosaveAvailable, isAutosaveEnabled, writeAutosave } from '../lib/autosave'
import { currentPayload } from '../lib/serialization'
import { useAutosaveStore } from '../store/autosaveStore'
import { useExecutionStore } from '../store/executionStore'
import { useGraphStore } from '../store/graphStore'

const DEBOUNCE_MS = 600

export function useAutosave(): void {
  useEffect(() => {
    if (!isAutosaveEnabled()) {
      useAutosaveStore.getState().markDisabled('off')
      return
    }
    if (!autosaveAvailable()) {
      useAutosaveStore.getState().markDisabled('unavailable')
      return
    }

    let timer: ReturnType<typeof setTimeout> | undefined

    const schedule = () => {
      if (useExecutionStore.getState().status === 'running') return
      useAutosaveStore.getState().markSaving()
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (writeAutosave(currentPayload())) {
          useAutosaveStore.getState().markSaved()
        } else {
          useAutosaveStore.getState().markDisabled('idle')
        }
      }, DEBOUNCE_MS)
    }

    const unsubscribe = useGraphStore.subscribe((state, previous) => {
      const changed =
        state.nodes !== previous.nodes ||
        state.edges !== previous.edges ||
        state.viewport !== previous.viewport
      if (changed) schedule()
    })

    const unsubscribeExecution = useExecutionStore.subscribe((state, previous) => {
      if (previous.status === 'running' && state.status !== 'running') schedule()
    })

    return () => {
      clearTimeout(timer)
      unsubscribe()
      unsubscribeExecution()
    }
  }, [])
}
