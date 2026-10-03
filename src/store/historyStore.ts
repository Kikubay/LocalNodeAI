import { create } from 'zustand'
import { snapshotGraph, type GraphSnapshot } from '../lib/serialization'
import { useGraphStore } from './graphStore'

const COALESCE_MS = 700
const MAX_ENTRIES = 80

export type HistoryState = {
  entries: GraphSnapshot[]
  index: number
  lastRecordedAt: number
  suspended: boolean
  canUndo: () => boolean
  canRedo: () => boolean
  reset: () => void
  record: () => void
  undo: () => boolean
  redo: () => boolean
}

function keyOf(snapshot: GraphSnapshot): string {
  return JSON.stringify(snapshot)
}

function sameShape(a: GraphSnapshot | undefined, b: GraphSnapshot): boolean {
  if (!a) return false
  const ids = (list: GraphSnapshot['nodes']) => list.map((node) => node.id).join('|')
  const edgeIds = (list: GraphSnapshot['edges']) => list.map((edge) => edge.id).join('|')
  return ids(a.nodes) === ids(b.nodes) && edgeIds(a.edges) === edgeIds(b.edges)
}

function apply(snapshot: GraphSnapshot) {
  useGraphStore.getState().replaceGraph(snapshot.nodes, snapshot.edges)
  useGraphStore.getState().setViewport(snapshot.viewport)
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  entries: [],
  index: -1,
  lastRecordedAt: 0,
  suspended: false,

  canUndo: () => get().index > 0,
  canRedo: () => get().index < get().entries.length - 1,

  reset: () => set({ entries: [snapshotGraph()], index: 0, lastRecordedAt: 0 }),

  record: () => {
    const { suspended, entries, index, lastRecordedAt } = get()
    if (suspended) return

    if (useGraphStore.getState().nodes.some((node) => node.dragging)) return

    const next = snapshotGraph()
    if (index < 0) {
      set({ entries: [next], index: 0, lastRecordedAt: Date.now() })
      return
    }

    const current = entries[index]
    const key = keyOf(next)
    if (key === keyOf(current)) return

    const now = Date.now()
    const merge = now - lastRecordedAt < COALESCE_MS && sameShape(current, next)
    if (merge) {
      const patched = entries.slice()
      patched[index] = next
      set({ entries: patched, lastRecordedAt: now })
      return
    }

    let timeline = entries.slice(0, index + 1)
    timeline.push(next)

    if (timeline.length > MAX_ENTRIES) {
      timeline = timeline.slice(timeline.length - MAX_ENTRIES)
      set({ entries: timeline, index: MAX_ENTRIES - 1, lastRecordedAt: now })
      return
    }

    set({ entries: timeline, index: timeline.length - 1, lastRecordedAt: now })
  },

  undo: () => {
    const { entries, index, suspended } = get()
    if (suspended || index <= 0) return false

    set({ suspended: true, index: index - 1, lastRecordedAt: 0 })
    apply(entries[index - 1])
    set({ suspended: false })
    return true
  },

  redo: () => {
    const { entries, index, suspended } = get()
    if (suspended || index >= entries.length - 1) return false

    set({ suspended: true, index: index + 1, lastRecordedAt: 0 })
    apply(entries[index + 1])
    set({ suspended: false })
    return true
  },
}))
