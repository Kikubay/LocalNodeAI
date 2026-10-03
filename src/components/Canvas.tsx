import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type OnConnect,
  type Viewport,
} from '@xyflow/react'
import { useCallback } from 'react'
import { nodeTypes, type AppNode } from '../nodes'
import { useToastStore } from '../store/toastStore'
import { defaultTextOptions } from '../lib/textOps'
import { defaultBranchOptions } from '../lib/branchConditions'
import { DEFAULT_MERGE_OPTIONS } from '../lib/merge'
import { createNodeId, useGraphStore } from '../store/graphStore'

const nodeColor: Record<string, string> = {
  start: '#34d399',
  llm: '#a78bfa',
  end: '#fbbf24',
}

const DELETE_KEY_CODES = ['Backspace', 'Delete']

const defaultData: Record<string, object> = {
  start: { input: '' },
  llm: {
    model: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    systemPrompt: 'You are a helpful assistant running fully locally.',
    promptTemplate: '{{input}}',
  },
  end: { output: '' },
  cache: { keyTemplate: '{{input}}', enabled: true, nodeFingerprint: true },
  transform: { op: 'template', options: defaultTextOptions('template') },
  branch: { condition: 'always', options: defaultBranchOptions('always') },
  merge: { ...DEFAULT_MERGE_OPTIONS },
}

export function Canvas() {
  const nodes = useGraphStore((state) => state.nodes)
  const edges = useGraphStore((state) => state.edges)
  const viewport = useGraphStore((state) => state.viewport)
  const setViewport = useGraphStore((state) => state.setViewport)
  const closeContextMenu = useGraphStore((state) => state.closeContextMenu)
  const showToast = useToastStore((state) => state.show)
  const onNodesChange = useGraphStore((state) => state.onNodesChange)
  const onEdgesChange = useGraphStore((state) => state.onEdgesChange)
  const onConnect = useGraphStore((state) => state.onConnect)

  const handleMoveEnd = useCallback(
    (_event: unknown, next: Viewport) => setViewport(next),
    [setViewport],
  )

  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault()
      event.stopPropagation()
      closeContextMenu()

      const removed = useGraphStore.getState().removeEdges([edge.id])
      if (removed.length === 0) return

      showToast('Connection removed', {
        label: 'Undo',
        onClick: () => {
          useGraphStore.getState().addEdges(removed)
          showToast('Connection restored')
        },
      })
    },
    [closeContextMenu, showToast],
  )

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      closeContextMenu()
    },
    [closeContextMenu],
  )

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/localnodeai') as AppNode['type']
    if (!type) return

    const bounds = event.currentTarget.querySelector('.react-flow__pane')?.getBoundingClientRect()
    if (!bounds) return

    useGraphStore.getState().addNode({
      id: createNodeId(type),
      type,
      position: { x: event.clientX - bounds.left - 144, y: event.clientY - bounds.top - 60 },
      data: defaultData[type],
    } as AppNode)
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const handleConnect = onConnect as OnConnect

  return (
    <div className="relative flex-1">
      <ReactFlow<AppNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultViewport={viewport}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onDrop={handleDrop}
        onDragOver={onDragOver}
        onContextMenu={handlePaneContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        deleteKeyCode={DELETE_KEY_CODES}
        onMoveEnd={handleMoveEnd}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#1f2937" />
        <Controls />
        <MiniMap pannable zoomable nodeColor={(n) => nodeColor[n.type ?? ''] ?? '#64748b'} maskColor="rgba(11,15,23,0.7)" />
        {nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg border border-gray-800 bg-gray-950/80 px-4 py-3 text-center text-xs text-gray-500">
              Canvas is empty — add a <span className="text-emerald-400">Start</span> node to begin
            </div>
          </div>
        ) : null}
      </ReactFlow>
    </div>
  )
}
