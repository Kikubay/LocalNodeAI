import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { cacheClear, cacheCount, cacheIsPersistent } from '../lib/cache'
import { useNodeContextMenu } from '../hooks/useNodeContextMenu'
import { useGraphStore } from '../store/graphStore'
import { NodeChrome } from './NodeChrome'
import type { CacheNodeData } from './types'

export type CacheFlowNode = Node<CacheNodeData, 'cache'>

const labelClass = 'mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500'

const fieldClass =
  'nodrag nowheel w-full rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1.5 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-sky-500'

const DEFAULT_KEY = '{{input}}'

export function CacheNode({ id, data, selected }: NodeProps<CacheFlowNode>) {
  const updateNodeData = useGraphStore((state) => state.updateNodeData)
  const removeNode = useGraphStore((state) => state.removeNode)
  const clearCacheHits = useGraphStore((state) => state.clearCacheHits)
  const onContextMenu = useNodeContextMenu(id)

  const enabled = data.enabled !== false
  const count = cacheCount()
  const persistent = cacheIsPersistent()

  return (
    <NodeChrome
      title="Cache"
      dot="bg-cyan-400"
      status={data.status}
      tone={selected ? 'selected' : 'default'}
      onDelete={() => removeNode(id)}
      onContextMenu={onContextMenu}
    >
      <div className="space-y-2.5 px-3 py-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            className="nodrag size-3 accent-cyan-500"
            checked={enabled}
            onChange={(event) => updateNodeData(id, { enabled: event.target.checked })}
          />
          Reuse stored results
        </label>

        <div className={enabled ? '' : 'pointer-events-none opacity-40'}>
          <label className={labelClass}>Cache key</label>
          <textarea
            className={`${fieldClass} h-12 resize-none font-mono text-gray-400`}
            value={data.keyTemplate ?? DEFAULT_KEY}
            placeholder={DEFAULT_KEY}
            onChange={(event) => updateNodeData(id, { keyTemplate: event.target.value })}
          />

          <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] leading-snug text-gray-400">
            <input
              type="checkbox"
              className="nodrag mt-0.5 size-3 accent-cyan-500"
              checked={data.nodeFingerprint !== false}
              onChange={(event) => updateNodeData(id, { nodeFingerprint: event.target.checked })}
            />
            <span>
              Invalidate when the downstream model or prompt changes
              <span className="mt-0.5 block text-[10px] text-gray-600">
                Recommended. Otherwise switching models can return a stale answer.
              </span>
            </span>
          </label>
        </div>

        {typeof data.hit === 'boolean' ? (
          <div
            className={`rounded-md border px-2 py-1.5 text-[11px] ${
              data.hit
                ? 'border-emerald-900/60 bg-emerald-950/40 text-emerald-300'
                : 'border-gray-700 bg-gray-900/60 text-gray-400'
            }`}
          >
            {data.hit ? 'Hit — downstream nodes were skipped' : 'Miss — result stored for next run'}
          </div>
        ) : null}

        {data.error ? (
          <p className="rounded-md border border-red-900/60 bg-red-950/40 px-2 py-1.5 text-[11px] leading-snug text-red-300">
            {data.error}
          </p>
        ) : null}

        <div className="flex items-center gap-2 text-[10px] text-gray-600">
          <span>
            {count} cached {count === 1 ? 'result' : 'results'}
            {persistent ? '' : ' · this session only'}
          </span>
          <button
            type="button"
            onClick={() => {
              cacheClear()
              clearCacheHits()
            }}
            title="Removes every cached result stored by this browser"
            className="nodrag ml-auto text-gray-500 underline-offset-2 hover:text-gray-300 hover:underline"
          >
            Clear
          </button>
        </div>
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  )
}