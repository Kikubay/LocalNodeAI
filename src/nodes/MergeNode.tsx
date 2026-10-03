import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { useNodeContextMenu } from '../hooks/useNodeContextMenu'
import { DEFAULT_MERGE_OPTIONS, parseSourceList, unescape } from '../lib/merge'
import { useGraphStore } from '../store/graphStore'
import { NodeChrome } from './NodeChrome'
import type { MergeNodeData } from './types'

export type MergeFlowNode = Node<MergeNodeData, 'merge'>

const labelClass = 'mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500'

const fieldClass =
  'nodrag nowheel w-full rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1.5 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-sky-500'

export function MergeNode({ id, data, selected }: NodeProps<MergeFlowNode>) {
  const updateNodeData = useGraphStore((state) => state.updateNodeData)
  const removeNode = useGraphStore((state) => state.removeNode)
  const edges = useGraphStore((state) => state.edges)
  const onContextMenu = useNodeContextMenu(id)

  const incoming = edges.filter((edge) => edge.target === id).map((edge) => edge.source)
  const whitelist = parseSourceList(data.sources ?? '')
  const output = data.output ?? ''

  return (
    <NodeChrome
      title="Merge"
      dot="bg-sky-400"
      status={data.status}
      tone={selected ? 'selected' : 'default'}
      onDelete={() => removeNode(id)}
      onContextMenu={onContextMenu}
    >
      <div className="space-y-2.5 px-3 py-2.5">
        <div>
          <label className={labelClass}>
            Inputs {incoming.length > 0 ? `(${incoming.length})` : ''}
          </label>
          {incoming.length === 0 ? (
            <p className="text-[11px] text-amber-500">
              Connect two or more nodes to this one.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {incoming.map((sourceId) => (
                <span
                  key={sourceId}
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                    whitelist.length > 0 && !whitelist.includes(sourceId)
                      ? 'border-gray-800 text-gray-600 line-through'
                      : 'border-gray-700 text-gray-400'
                  }`}
                >
                  {sourceId}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Separator</label>
          <input
            className={`${fieldClass} font-mono text-gray-300`}
            value={data.separator ?? DEFAULT_MERGE_OPTIONS.separator}
            placeholder={DEFAULT_MERGE_OPTIONS.separator}
            onChange={(event) => updateNodeData(id, { separator: event.target.value })}
          />
          <p className="mt-1 text-[10px] text-gray-600">
            {unescape(data.separator ?? DEFAULT_MERGE_OPTIONS.separator) === '\n\n'
              ? 'blank line'
              : JSON.stringify(unescape(data.separator ?? ''))}
          </p>
        </div>

        <div>
          <label className={labelClass}>Only these inputs (optional)</label>
          <textarea
            className={`${fieldClass} h-12 resize-none font-mono text-gray-400`}
            value={data.sources ?? ''}
            placeholder="one node id per line"
            onChange={(event) => updateNodeData(id, { sources: event.target.value })}
          />
          <p className="mt-1 text-[10px] text-gray-600">
            Leave empty to join every input in edge order. Listed ids come first.
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-gray-400">
          <input
            type="checkbox"
            className="nodrag size-3 accent-sky-500"
            checked={data.labelWithSource === true}
            onChange={(event) => updateNodeData(id, { labelWithSource: event.target.checked })}
          />
          Label each part with its source node
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-gray-400">
          <input
            type="checkbox"
            className="nodrag size-3 accent-sky-500"
            checked={data.skipEmpty !== false}
            onChange={(event) => updateNodeData(id, { skipEmpty: event.target.checked })}
          />
          Skip inputs with no output
        </label>

        {output ? (
          <div>
            <label className={labelClass}>Output</label>
            <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-700 bg-gray-950/80 px-2 py-1.5 text-xs leading-relaxed text-gray-200">
              {output}
            </div>
          </div>
        ) : null}
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  )
}