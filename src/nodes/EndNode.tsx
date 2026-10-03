import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { useNodeContextMenu } from '../hooks/useNodeContextMenu'
import { useGraphStore } from '../store/graphStore'
import { NodeChrome } from './NodeChrome'
import type { EndNodeData } from './types'

export type EndFlowNode = Node<EndNodeData, 'end'>

export function EndNode({ id, data, selected }: NodeProps<EndFlowNode>) {
  const removeNode = useGraphStore((state) => state.removeNode)
  const onContextMenu = useNodeContextMenu(id)

  return (
    <NodeChrome
      title="End"
      dot="bg-amber-400"
      status={data.status}
      tone={selected ? 'selected' : 'default'}
      onDelete={() => removeNode(id)}
      onContextMenu={onContextMenu}
    >
      <div className="px-3 py-2.5">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
          Output
        </label>
        <div
          className="h-32 w-full overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-700 bg-gray-950/80 px-2 py-1.5 font-mono text-xs leading-relaxed text-gray-200"
          role="status"
        >
          {data.output || (
            <span className="font-sans text-gray-600">Final output appears here…</span>
          )}
        </div>
        {data.error ? (
          <p className="mt-1.5 text-[11px] leading-snug text-red-400">{data.error}</p>
        ) : null}
      </div>
      <Handle type="target" position={Position.Left} />
    </NodeChrome>
  )
}