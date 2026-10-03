import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { useNodeContextMenu } from '../hooks/useNodeContextMenu'
import {
  BRANCH_CONDITIONS,
  BRANCH_FALSE_HANDLE,
  BRANCH_TRUE_HANDLE,
  branchConditionSpec,
  defaultBranchOptions,
  isBranchConditionKind,
  type BranchConditionKind,
} from '../lib/branchConditions'
import { useGraphStore } from '../store/graphStore'
import { NodeChrome } from './NodeChrome'
import type { BranchNodeData } from './types'

export type BranchFlowNode = Node<BranchNodeData, 'branch'>

const labelClass = 'mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500'

const fieldClass =
  'nodrag nowheel w-full rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1.5 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-sky-500'

export function BranchNode({ id, data, selected }: NodeProps<BranchFlowNode>) {
  const updateNodeData = useGraphStore((state) => state.updateNodeData)
  const removeNode = useGraphStore((state) => state.removeNode)
  const onContextMenu = useNodeContextMenu(id)

  const condition: BranchConditionKind = isBranchConditionKind(data.condition)
    ? data.condition
    : 'always'
  const spec = branchConditionSpec(condition)
  const options = data.options ?? {}

  return (
    <NodeChrome
      title="Branch"
      dot="bg-amber-300"
      status={data.status}
      tone={selected ? 'selected' : 'default'}
      onDelete={() => removeNode(id)}
      onContextMenu={onContextMenu}
    >
      <div className="space-y-2.5 px-3 py-2.5">
        <div>
          <label className={labelClass}>When the input…</label>
          <select
            className={fieldClass}
            value={condition}
            onChange={(event) =>
              updateNodeData(id, {
                condition: event.target.value as BranchConditionKind,
                options: { ...defaultBranchOptions(event.target.value as BranchConditionKind), ...options },
              })
            }
          >
            {BRANCH_CONDITIONS.map((entry) => (
              <option key={entry.kind} value={entry.kind}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        {spec.fields.map((field) => (
          <div key={field.key}>
            <label className={labelClass}>{field.label}</label>
            <input
              className={`${fieldClass} font-mono text-gray-300`}
              value={options[field.key] ?? ''}
              placeholder={field.placeholder}
              onChange={(event) =>
                updateNodeData(id, { options: { ...options, [field.key]: event.target.value } })
              }
            />
          </div>
        ))}

        <p className="flex items-center gap-2 text-[10px] text-gray-600">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-400" /> matched
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-gray-500" /> otherwise
          </span>
          <span>drag from either handle</span>
        </p>

        {typeof data.matched === 'boolean' ? (
          <div
            className={`rounded-md border px-2 py-1.5 text-[11px] ${
              data.matched
                ? 'border-emerald-900/60 bg-emerald-950/40 text-emerald-300'
                : 'border-gray-700 bg-gray-900/60 text-gray-400'
            }`}
          >
            {data.matched ? 'Last run took the matched path' : 'Last run took the other path'}
          </div>
        ) : null}

        {data.error ? (
          <p className="rounded-md border border-red-900/60 bg-red-950/40 px-2 py-1.5 text-[11px] leading-snug text-red-300">
            {data.error}
          </p>
        ) : null}
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle
        id={BRANCH_TRUE_HANDLE}
        type="source"
        position={Position.Right}
        style={{ top: 18, backgroundColor: '#34d399' }}
        title="matched"
      />
      <Handle
        id={BRANCH_FALSE_HANDLE}
        type="source"
        position={Position.Right}
        style={{ top: 46, backgroundColor: '#6b7280' }}
        title="otherwise"
      />
    </NodeChrome>
  )
}