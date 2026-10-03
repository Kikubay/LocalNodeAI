import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, MODELS } from '../lib/models'
import { getLoadedModel, isKnownModel } from '../lib/webllm'
import { useGraphStore } from '../store/graphStore'
import { useModelCached } from '../hooks/useModelCached'
import { useNodeContextMenu } from '../hooks/useNodeContextMenu'
import {
  MAX_MAX_TOKENS,
  MAX_TEMPERATURE,
  MIN_MAX_TOKENS,
  MIN_TEMPERATURE,
  clampTemperature,
  describeGeneration,
  normaliseMaxTokens,
  normaliseSeed,
  parseStopSequences,
  readGenerationSettings,
} from '../lib/generation'
import { NodeChrome } from './NodeChrome'
import type { LLMNodeData } from './types'

export type LLMFlowNode = Node<LLMNodeData, 'llm'>

const labelClass = 'mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500'

const fieldClass =
  'nodrag nowheel w-full rounded-md border border-gray-700 bg-gray-900/80 px-2 py-1.5 text-xs text-gray-100 placeholder-gray-500 outline-none focus:border-sky-500'

export function LLMNode({ id, data, selected }: NodeProps<LLMFlowNode>) {
  const updateNodeData = useGraphStore((state) => state.updateNodeData)
  const removeNode = useGraphStore((state) => state.removeNode)
  const status = data.status ?? 'idle'
  const cached = useModelCached(data.model, getLoadedModel() === data.model)
  const onContextMenu = useNodeContextMenu(id)
  const progress = Math.round((data.progress ?? 0) * 100)
  const output = data.output ?? ''
  const unknownModel = Boolean(data.model) && !isKnownModel(data.model)
  const settings = readGenerationSettings(data)

  return (
    <NodeChrome
      title="LLM"
      dot="bg-violet-400"
      status={status === 'idle' ? undefined : status}
      tone={selected ? 'selected' : 'default'}
      onDelete={() => removeNode(id)}
      onContextMenu={onContextMenu}
    >
      <div className="space-y-2.5 px-3 py-2.5">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className={labelClass}>Model</label>
            {cached ? (
              <span
                className="mb-1 text-[10px] text-emerald-400"
                title="Weights are cached — this model runs offline"
              >
                cached
              </span>
            ) : null}
          </div>
          <select
            className={fieldClass}
            value={data.model || DEFAULT_MODEL}
            onChange={(event) => updateNodeData(id, { model: event.target.value })}
          >
            {MODELS.some((model) => model.id === data.model) ? null : (
              <option value={data.model}>{data.model} (custom)</option>
            )}
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} · {model.size}
              </option>
            ))}
          </select>
          {unknownModel ? (
            <p className="mt-1 text-[10px] text-amber-500">
              Not in the WebLLM prebuilt list — loading will fail.
            </p>
          ) : null}
        </div>

        <div>
          <label className={labelClass}>System prompt</label>
          <textarea
            className={`${fieldClass} h-16 resize-none`}
            value={data.systemPrompt ?? ''}
            placeholder={DEFAULT_SYSTEM_PROMPT}
            onChange={(event) => updateNodeData(id, { systemPrompt: event.target.value })}
          />
        </div>

        <div>
          <label className={labelClass}>Input mapping</label>
          <textarea
            className={`${fieldClass} h-12 resize-none font-mono text-gray-400`}
            value={data.promptTemplate ?? '{{input}}'}
            onChange={(event) => updateNodeData(id, { promptTemplate: event.target.value })}
          />
        </div>

        <div className="rounded-md border border-gray-800 bg-gray-950/60 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Generation
            </span>
            <span className="text-[10px] text-gray-600">{describeGeneration(settings)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Temperature</label>
              <input
                type="number"
                min={MIN_TEMPERATURE}
                max={MAX_TEMPERATURE}
                step={0.1}
                className={fieldClass}
                value={settings.temperature}
                onChange={(event) =>
                  updateNodeData(id, { temperature: clampTemperature(event.target.value) })
                }
              />
            </div>
            <div>
              <label className={labelClass}>Max tokens</label>
              <input
                type="number"
                min={MIN_MAX_TOKENS}
                max={MAX_MAX_TOKENS}
                step={64}
                className={fieldClass}
                value={settings.maxTokens}
                onChange={(event) =>
                  updateNodeData(id, { maxTokens: normaliseMaxTokens(event.target.value) })
                }
              />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Seed</label>
              <input
                type="number"
                className={fieldClass}
                placeholder="random"
                value={data.seed ?? ''}
                onChange={(event) =>
                  updateNodeData(id, { seed: normaliseSeed(event.target.value) })
                }
              />
            </div>
            <div>
              <label className={labelClass}>Stop sequences</label>
              <input
                className={`${fieldClass} font-mono text-gray-400`}
                placeholder="one per line"
                value={Array.isArray(data.stop) ? data.stop.join('\n') : ''}
                onChange={(event) =>
                  updateNodeData(id, { stop: parseStopSequences(event.target.value) })
                }
              />
            </div>
          </div>
        </div>

        {status === 'loading' || (status === 'running' && !output) ? (
          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] text-gray-500">
              <span className="truncate">{data.progressText ?? 'Loading…'}</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-violet-500 transition-[width] duration-300"
                style={{ width: `${Math.max(progress, 2)}%` }}
              />
            </div>
          </div>
        ) : null}

        {data.truncated ? (
          <p className="rounded-md border border-amber-900/60 bg-amber-950/40 px-2 py-1.5 text-[11px] leading-snug text-amber-200">
            Answer was cut off at {settings.maxTokens} tokens. Raise Max tokens and run again.
          </p>
        ) : null}

        {data.error ? (
          <p className="rounded-md border border-red-900/60 bg-red-950/40 px-2 py-1.5 text-[11px] leading-snug text-red-300">
            {data.error}
          </p>
        ) : null}

        {output ? (
          <div>
            <label className={labelClass}>Output</label>
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-700 bg-gray-950/80 px-2 py-1.5 text-xs leading-relaxed text-gray-200">
              {output}
              {status === 'running' ? <span className="ml-0.5 animate-pulse">▍</span> : null}
            </div>
          </div>
        ) : null}
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </NodeChrome>
  )
}