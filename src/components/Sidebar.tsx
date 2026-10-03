import { useCallback, type DragEvent } from 'react'
import { PALETTE } from './palette'
import { createNodeId, useGraphStore, type LocalNode } from '../store/graphStore'
import { WorkflowActions } from './WorkflowActions'
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from '../lib/models'
import { defaultBranchOptions } from '../lib/branchConditions'
import { defaultTextOptions } from '../lib/textOps'
import { DEFAULT_MERGE_OPTIONS } from '../lib/merge'

const DRAG_MIME = 'application/localnodeai'

function defaultData(type: LocalNode['type']) {
  switch (type) {
    case 'start':
      return { input: '' }
    case 'llm':
      return { model: DEFAULT_MODEL, systemPrompt: DEFAULT_SYSTEM_PROMPT, promptTemplate: '{{input}}' }
    case 'end':
      return { output: '' }
    case 'cache':
      return { keyTemplate: '{{input}}', enabled: true, nodeFingerprint: true }
    case 'transform':
      return { op: 'template', options: defaultTextOptions('template') }
    case 'branch':
      return { condition: 'always', options: defaultBranchOptions('always') }
    case 'merge':
      return { ...DEFAULT_MERGE_OPTIONS }
    default:
      return { input: '' }
  }
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const addNode = useGraphStore((state) => state.addNode)
  const nodeCount = useGraphStore((state) => state.nodes.length)

  const onDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>, type: LocalNode['type']) => {
      event.dataTransfer.setData(DRAG_MIME, type)
      event.dataTransfer.setData('text/plain', type)
      event.dataTransfer.effectAllowed = 'move'
    },
    [],
  )

  const onClick = useCallback(
    (type: LocalNode['type']) => {
      const nodes = useGraphStore.getState().nodes
      addNode({
        id: createNodeId(type),
        type,
        position: { x: 120 + nodes.length * 40, y: 120 + nodes.length * 30 },
        data: defaultData(type),
      } as LocalNode)
    },
    [addNode],
  )

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-gray-800 bg-gray-950/95 p-4 backdrop-blur md:bg-gray-950/60">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Nodes</h2>
          <p className="mt-1 text-xs text-gray-600">Drag onto the canvas, or click to add.</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close palette"
            className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-200 md:hidden"
          >
            <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {PALETTE.map((item) => (
          <button
            key={item.type}
            type="button"
            draggable
            onDragStart={(event) => onDragStart(event, item.type)}
            onClick={() => onClick(item.type)}
            className="group flex cursor-grab items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2.5 text-left transition hover:border-sky-600 hover:bg-gray-900 active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
          >
            <span className={`size-2 shrink-0 rounded-full ${item.dot}`} />
            <span className="flex-1">
              <span className="block text-sm font-medium text-gray-200">{item.label}</span>
              <span className="block text-[11px] text-gray-500">{item.description}</span>
            </span>
            <span className="text-gray-600 transition group-hover:text-gray-400">{item.icon}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto rounded-lg border border-gray-800 bg-gray-900/40 p-3 text-[11px] leading-relaxed text-gray-500">
        <p className="mb-1 font-medium text-gray-400">How it works</p>
        Connect <span className="text-emerald-400">Start</span> →{' '}
        <span className="text-violet-400">LLM</span> → <span className="text-amber-400">End</span> and
        press Run. Everything runs locally through WebGPU. Delete nodes with the ✕ or the Delete key.
      </div>

      <p className="text-center text-[10px] text-gray-700">{nodeCount} node{nodeCount === 1 ? '' : 's'}</p>

      <WorkflowActions />
    </aside>
  )
}