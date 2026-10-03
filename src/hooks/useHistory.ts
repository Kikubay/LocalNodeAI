import { useEffect } from 'react'
import { useHistoryStore } from '../store/historyStore'
import { useGraphStore } from '../store/graphStore'

export function isTextEntry(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as Partial<HTMLElement>
  if (element.isContentEditable === true) return true
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : ''
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useHistory(): void {
  useEffect(() => {
    useHistoryStore.getState().reset()

    const unsubscribe = useGraphStore.subscribe(() => {
      useHistoryStore.getState().record()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      if (isTextEntry(event.target)) return
      if (!(event.ctrlKey || event.metaKey)) return

      event.preventDefault()
      if (key === 'y' || event.shiftKey) {
        useHistoryStore.getState().redo()
      } else {
        useHistoryStore.getState().undo()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])
}
