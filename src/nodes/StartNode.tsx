import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { useNodeContextMenu } from '../hooks/useNodeContextMenu'
import { useGraphStore } from '../store/graphStore'
import { NodeChrome } from './NodeChrome'
import type { StartNodeData } from './types'

export type StartFlowNode = Node<StartNodeData, 'start'>

const fieldClass =
  'nodrag nowheel w-full resize-none rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1.5 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-sky-500'

export function StartNode({ id, data, selected }: NodeProps<StartFlowNode>) {
  const updateNodeData = useGraphStore((state) => state.updateNodeData)
  const removeNode = useGraphStore((state) => state.removeNode)
  const onContextMenu = useNodeContextMenu(id)

  return (
    <NodeChrome
      title="Start"
      dot="bg-emerald-400"
      status={data.status}
      tone={selected ? 'selected' : 'default'}
      onDelete={() => removeNode(id)}
      onContextMenu={onContextMenu}
    >
      <div className="px-3 py-2.5">
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
          Input
        </label>
        <textarea
          className={`${fieldClass} h-24`}
          placeholder="What should the model do?"
          value={data.input}
          onChange={(event) => updateNodeData(id, { input: event.target.value })}
        />
        {data.error ? (
          <p className="mt-1.5 text-[11px] leading-snug text-red-400">{data.error}</p>
        ) : null}
      </div>
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  )
}