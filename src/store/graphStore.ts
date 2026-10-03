import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { create } from 'zustand'
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from '../lib/models'
import type { AppNode } from '../nodes'
import type { DataPatch } from '../nodes/types'

export type LocalNode = AppNode

function withData(nodes: LocalNode[], id: string, patch: DataPatch): LocalNode[] {
  return nodes.map((node) =>
    node.id === id ? ({ ...node, data: { ...node.data, ...patch } } as LocalNode) : node,
  )
}

export function createNodeId(type?: string): string {
  const unique =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return type ? `${type}-${unique}` : unique
}

function cloneData<T>(data: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T)
}

function withoutMeasured(node: LocalNode): LocalNode {
  const copy = { ...node } as LocalNode & { measured?: unknown }
  delete copy.measured
  return copy
}

const initialNodes: LocalNode[] = [
  {
    id: 'start-1',
    type: 'start',
    position: { x: 80, y: 160 },
    data: { input: 'Explain what a small language model is, in two sentences.' },
  },
  {
    id: 'llm-1',
    type: 'llm',
    position: { x: 460, y: 160 },
    data: { model: DEFAULT_MODEL, systemPrompt: DEFAULT_SYSTEM_PROMPT, promptTemplate: '{{input}}' },
  },
  {
    id: 'end-1',
    type: 'end',
    position: { x: 840, y: 160 },
    data: { output: '' },
  },
]

const initialEdges: Edge[] = [
  { id: 'e-start-llm', source: 'start-1', target: 'llm-1' },
  { id: 'e-llm-end', source: 'llm-1', target: 'end-1' },
]

type Viewport = { x: number; y: number; zoom: number }

export type ContextMenuState = {
  isOpen: boolean
  x: number
  y: number
  nodeId: string | null
}

const CLOSED_CONTEXT_MENU: ContextMenuState = { isOpen: false, x: 0, y: 0, nodeId: null }

type GraphState = {
  nodes: LocalNode[]
  edges: Edge[]
  viewport: Viewport
  contextMenu: ContextMenuState
  onNodesChange: (changes: NodeChange<LocalNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (node: LocalNode) => void
  updateNodeData: (id: string, patch: DataPatch) => void
  replaceGraph: (nodes: LocalNode[], edges: Edge[]) => void
  setViewport: (viewport: Viewport) => void
  removeNode: (id: string) => void
  duplicateNode: (id: string, offset?: { x: number; y: number }) => string | null
  disconnectNode: (id: string) => void
  removeEdges: (ids: string[]) => Edge[]
  addEdges: (edges: Edge[]) => void
  clearNodeRuntime: () => void
  clearCacheHits: () => void
  openContextMenu: (x: number, y: number, nodeId: string) => void
  closeContextMenu: () => void
}

export const useGraphStore = create<GraphState>()((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  viewport: { x: 40, y: 60, zoom: 0.9 },
  contextMenu: CLOSED_CONTEXT_MENU,
  onNodesChange: (changes) => set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),
  onEdgesChange: (changes) => set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),
  onConnect: (connection) =>
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          id: `e-${connection.source}-${connection.target}-${Date.now().toString(36)}`,
        },
        state.edges,
      ),
    })),
  addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),
  updateNodeData: (id, patch) => set((state) => ({ nodes: withData(state.nodes, id, patch) })),
  replaceGraph: (nodes, edges) => set({ nodes, edges }),
  setViewport: (viewport) => set({ viewport }),
  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== id),
      edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
    })),
  disconnectNode: (id) =>
    set((state) => ({
      edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
    })),
  removeEdges: (ids) => {
    const doomed = new Set(ids)
    const removed = get().edges.filter((edge) => doomed.has(edge.id))
    if (removed.length > 0) {
      set((state) => ({ edges: state.edges.filter((edge) => !doomed.has(edge.id)) }))
    }
    return removed
  },
  addEdges: (edges) =>
    set((state) => {
      const existing = new Set(state.edges.map((edge) => edge.id))
      return { edges: [...state.edges, ...edges.filter((edge) => !existing.has(edge.id))] }
    }),
  duplicateNode: (id, offset = { x: 20, y: 20 }) => {
    const source = get().nodes.find((node) => node.id === id)
    if (!source) return null

    const copy = withoutMeasured({
      ...source,
      id: createNodeId(source.type),
      position: { x: source.position.x + offset.x, y: source.position.y + offset.y },
      data: cloneData(source.data),
      selected: false,
      dragging: false,
    } as LocalNode)

    set((state) => ({ nodes: [...state.nodes, copy] }))
    return copy.id
  },
  clearNodeRuntime: () =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        const data: Record<string, unknown> = { ...(node.data as Record<string, unknown>) }
        delete data.status
        delete data.progress
        delete data.progressText
        delete data.error
        return { ...node, data } as LocalNode
      }),
    })),
  clearCacheHits: () =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.type !== 'cache') return node
        const data: Record<string, unknown> = { ...(node.data as Record<string, unknown>) }
        delete data.hit
        return { ...node, data } as LocalNode
      }),
    })),
  openContextMenu: (x, y, nodeId) => set({ contextMenu: { isOpen: true, x, y, nodeId } }),
  closeContextMenu: () => set({ contextMenu: CLOSED_CONTEXT_MENU }),
}))
