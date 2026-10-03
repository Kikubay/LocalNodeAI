import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { useNodeContextMenu } from '../hooks/useNodeContextMenu'
import {
  TEXT_OPS,
  defaultTextOptions,
  isTextOpKind,
  textOpSpec,
  type TextOpKind,
} from '../lib/textOps'
import { useGraphStore } from '../store/graphStore'
import { NodeChrome } from './NodeChrome'
import type { TransformNodeData } from './types'

export type TransformFlowNode = Node<TransformNodeData, 'transform'>

const labelClass = 'mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500'

const fieldClass =
  'nodrag nowheel w-full rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1.5 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-sky-500'

export function TransformNode({ id, data, selected }: NodeProps<TransformFlowNode>) {
  const updateNodeData = useGraphStore((state) => state.updateNodeData)
  const removeNode = useGraphStore((state) => state.removeNode)
  const onContextMenu = useNodeContextMenu(id)

  const op: TextOpKind = isTextOpKind(data.op) ? data.op : 'template'
  const spec = textOpSpec(op)
  const options = data.options ?? {}
  const output = data.output ?? ''

  const setOption = (key: string, value: string) =>
    updateNodeData(id, { options: { ...options, [key]: value } })

  const setOp = (next: TextOpKind) =>
    updateNodeData(id, { op: next, options: { ...defaultTextOptions(next), ...options } })

  return (
    <NodeChrome
      title="Transform"
      dot="bg-pink-400"
      status={data.status}
      tone={selected ? 'selected' : 'default'}
      onDelete={() => removeNode(id)}
      onContextMenu={onContextMenu}
    >
      <div className="space-y-2.5 px-3 py-2.5">
        <div>
          <label className={labelClass}>Operation</label>
          <select
            className={fieldClass}
            value={op}
            onChange={(event) => setOp(event.target.value as TextOpKind)}
          >
            {TEXT_OPS.map((entry) => (
              <option key={entry.kind} value={entry.kind}>
                {entry.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-gray-600">{spec.description}</p>
        </div>

        {spec.fields.map((field) => (
          <div key={field.key}>
            <label className={labelClass}>{field.label}</label>
            {field.control === 'select' ? (
              <select
                className={fieldClass}
                value={options[field.key] ?? field.choices?.[0].value}
                onChange={(event) => setOption(field.key, event.target.value)}
              >
                {field.choices?.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            ) : field.control === 'textarea' ? (
              <textarea
                className={`${fieldClass} h-14 resize-none font-mono text-gray-300`}
                value={options[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(event) => setOption(field.key, event.target.value)}
              />
            ) : (
              <input
                className={`${fieldClass} font-mono text-gray-300`}
                value={options[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(event) => setOption(field.key, event.target.value)}
              />
            )}
          </div>
        ))}

        {data.error ? (
          <p className="rounded-md border border-red-900/60 bg-red-950/40 px-2 py-1.5 text-[11px] leading-snug text-red-300">
            {data.error}
          </p>
        ) : null}

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