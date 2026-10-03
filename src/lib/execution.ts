import type { Edge } from '@xyflow/react'
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from './models'
import { labelFor, renderPrompt, topologicalOrder } from './graph'
import { cacheGet, cacheSet } from './cache'
import { DEFAULT_MERGE_OPTIONS, mergeParts } from './merge'
import { describeGeneration, readGenerationSettings } from './generation'
import { applyTextOp, isTextOpKind } from './textOps'
import {
  BRANCH_FALSE_HANDLE,
  BRANCH_TRUE_HANDLE,
  evaluateCondition,
  isBranchConditionKind,
} from './branchConditions'
import { interruptGeneration, streamChat } from './webllm'
import { useExecutionStore } from '../store/executionStore'
import { useGraphStore, type LocalNode } from '../store/graphStore'

export { GraphError, labelFor, renderPrompt, topologicalOrder } from './graph'

type CachePlan = {
  gates: Map<string, string[]>
}

const DEFAULT_CACHE_KEY = '{{input}}'

function planCacheGates(order: LocalNode[]): CachePlan {
  const gates = new Map<string, string[]>()
  let current: string | null = null

  for (const node of order) {
    if (node.type === 'cache') {
      if (node.data.enabled === false) continue
      current = node.id
      if (!gates.has(node.id)) gates.set(node.id, [])
      continue
    }
    if (current) gates.get(current)?.push(node.id)
  }

  return { gates }
}

export function nodeFingerprint(id: string, node: LocalNode): string {
  if (node.type === 'llm') {
    const generation = readGenerationSettings(node.data)
    return `${id}:llm:${node.data.model}:${node.data.systemPrompt}:${describeGeneration(generation)}`
  }
  return `${id}:${node.type}`
}

function fingerprintOf(gov: string[], lookup: Map<string, LocalNode>): string {
  return gov
    .map((id) => {
      const node = lookup.get(id)
      return node ? nodeFingerprint(id, node) : id
    })
    .join('\u0001')
}

function sameNodes(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function createReachability(edges: Edge[]) {
  const adjacency = new Map<string, string[]>()
  const outgoing = new Map<string, Edge[]>()
  const incoming = new Map<string, string[]>()

  for (const edge of edges) {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target])
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source])
  }

  const memo = new Map<string, Set<string>>()

  const reachableFrom = (startId: string): Set<string> => {
    const cached = memo.get(startId)
    if (cached) return cached

    const seen = new Set<string>()
    const queue = [startId]
    while (queue.length > 0) {
      const current = queue.shift() as string
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }

    memo.set(startId, seen)
    return seen
  }

  const targetsOn = (sourceId: string, handle: string): string[] =>
    (outgoing.get(sourceId) ?? [])
      .filter((edge) => (edge.sourceHandle ?? BRANCH_TRUE_HANDLE) === handle)
      .map((edge) => edge.target)

  return { reachableFrom, targetsOn, incoming }
}

export function validateGraph(nodes: LocalNode[], edges: Edge[] = []): string[] {
  const problems: string[] = []
  if (nodes.length === 0) {
    problems.push('The canvas is empty. Add a Start node to run a workflow.')
    return problems
  }

  try {
    topologicalOrder(nodes, edges)
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error))
  }

  if (!nodes.some((node) => node.type === 'start')) {
    problems.push('No Start node: nothing supplies the first input.')
  }
  for (const node of nodes) {
    if (node.type === 'llm' && !node.data.model) {
      problems.push('An LLM node has no model selected.')
    }
  }
  return problems
}

export async function runWorkflow(): Promise<void> {
  const execution = useExecutionStore.getState()

  execution.reset()
  execution.begin()
  useGraphStore.getState().clearNodeRuntime()

  let activeNodeId: string | null = null

  try {
    const { nodes, edges, updateNodeData } = useGraphStore.getState()

    const problems = validateGraph(nodes, edges)
    if (problems.length > 0) {
      throw Object.assign(new Error(problems[0]), {
        hint: problems.length > 1 ? problems.slice(1).join(' ') : undefined,
      })
    }

    const order = topologicalOrder(nodes, edges)
    const results = new Map<string, string>()

    const lookup = new Map(nodes.map((node) => [node.id, node]))
    const { gates } = planCacheGates(order)
    const served = new Set<string>()
    const skipped = new Set<string>()
    const { reachableFrom, targetsOn, incoming } = createReachability(edges)
    const pendingWrites = new Map<string, { key: string; nodes: string[] }>()

const resolveUpstreams = (nodeId: string): { id: string; value: string }[] =>
  (incoming.get(nodeId) ?? [])
    .filter((source) => !skipped.has(source))
    .map((source) => ({ id: source, value: results.get(source) ?? '' }))

const resolveUpstream = (nodeId: string): { id: string | null; value: string } => {
  const live = resolveUpstreams(nodeId)
  const chosen = live.find((source) => results.has(source.id)) ?? live[0]
  return { id: chosen?.id ?? null, value: chosen?.value ?? '' }
}

    for (const node of order) {
      if (served.has(node.id)) {
        execution.setStep({
          nodeId: node.id,
          label: labelFor(node),
          detail: 'served from cache',
          state: 'done',
        })
        continue
      }

      if (skipped.has(node.id)) {
        execution.setStep({
          nodeId: node.id,
          label: labelFor(node),
          detail: 'branch not taken',
          state: 'skipped',
        })
        updateNodeData(node.id, { output: '', status: undefined, error: undefined })
        continue
      }

      if (useExecutionStore.getState().isCancelled()) {
        execution.setStep({
          nodeId: node.id,
          label: labelFor(node),
          detail: 'skipped after cancel',
          state: 'skipped',
        })
        continue
      }

      activeNodeId = node.id
      const { id: upstreamId, value: upstreamValue } = resolveUpstream(node.id)
      execution.setStep({ nodeId: node.id, label: labelFor(node), detail: 'running', state: 'running' })

      switch (node.type) {
        case 'start': {
          const value = node.data.input.trim()
          if (!value) {
            execution.setStep({
              nodeId: node.id,
              label: 'Start',
              detail: 'input is empty',
              state: 'skipped',
            })
            break
          }
          results.set(node.id, value)
          updateNodeData(node.id, { status: 'done', error: undefined })
          execution.setStep({
            nodeId: node.id,
            label: 'Start',
            detail: `${value.length} chars`,
            state: 'done',
          })
          break
        }

        case 'llm': {
          const systemPrompt = node.data.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT
          const prompt = renderPrompt(node.data.promptTemplate, upstreamValue)
          updateNodeData(node.id, {
            status: 'loading',
            progress: 0,
            progressText: 'Preparing model…',
            output: '',
            error: undefined,
          })

          const settings = readGenerationSettings(node.data)
          const { text, finishReason } = await streamChat(
            node.data.model || DEFAULT_MODEL,
            systemPrompt,
            prompt,
            {
              ...settings,
              onToken: (full) => updateNodeData(node.id, { output: full }),
            },
            (report) =>
              updateNodeData(node.id, {
                status: 'running',
                progress: report.progress,
                progressText: report.text,
              }),
          )

          const cancelled = useExecutionStore.getState().isCancelled()
          const truncated = finishReason === 'length'
          results.set(node.id, text)
          updateNodeData(node.id, {
            status: cancelled ? 'idle' : 'done',
            progress: 1,
            progressText: undefined,
            truncated,
            error: undefined,
          })
          execution.setStep({
            nodeId: node.id,
            label: 'LLM',
            detail: cancelled
              ? 'interrupted'
              : truncated
                ? `${text.length} chars · TRUNCATED at ${settings.maxTokens} tokens`
                : `${text.length} chars generated`,
            state: cancelled ? 'skipped' : 'done',
          })
          break
        }

        case 'merge': {
          const parts = resolveUpstreams(node.id)
          const value = mergeParts(parts, {
            separator: node.data.separator ?? DEFAULT_MERGE_OPTIONS.separator,
            sources: node.data.sources ?? DEFAULT_MERGE_OPTIONS.sources,
            labelWithSource: node.data.labelWithSource === true,
            skipEmpty: node.data.skipEmpty !== false,
          })

          results.set(node.id, value)
          updateNodeData(node.id, { output: value, status: 'done', error: undefined })
          execution.setStep({
            nodeId: node.id,
            label: 'Merge',
            detail:
              parts.length === 0
                ? 'no inputs connected'
                : `joined ${parts.length} input${parts.length === 1 ? '' : 's'} · ${value.length} chars`,
            state: parts.length === 0 ? 'skipped' : 'done',
          })
          break
        }

        case 'branch': {
          const condition = isBranchConditionKind(node.data.condition)
            ? node.data.condition
            : 'always'
          const { value: matched, error } = evaluateCondition(
            condition,
            node.data.options ?? {},
            upstreamValue,
          )

          if (error) {
            updateNodeData(node.id, { status: 'error', error })
            execution.setStep({ nodeId: node.id, label: 'Branch', detail: error, state: 'error' })
            throw new Error(`Branch node: ${error}`)
          }

          const taken = matched ? BRANCH_TRUE_HANDLE : BRANCH_FALSE_HANDLE
          const other = matched ? BRANCH_FALSE_HANDLE : BRANCH_TRUE_HANDLE

          const takenReach = new Set<string>()
          for (const target of targetsOn(node.id, taken)) {
            takenReach.add(target)
            for (const reachable of reachableFrom(target)) takenReach.add(reachable)
          }
          for (const target of targetsOn(node.id, other)) {
            const exclusive = [target, ...reachableFrom(target)]
            for (const candidate of exclusive) {
              if (takenReach.has(candidate) || served.has(candidate) || candidate === node.id) {
                continue
              }
              skipped.add(candidate)
            }
          }

          results.set(node.id, upstreamValue)
          updateNodeData(node.id, {
            status: 'done',
            matched,
            output: upstreamValue,
            error: undefined,
          })
          execution.setStep({
            nodeId: node.id,
            label: 'Branch',
            detail: `${condition} → ${matched ? 'matched' : 'not matched'}`,
            state: 'done',
          })
          break
        }

        case 'transform': {
          const op = isTextOpKind(node.data.op) ? node.data.op : 'template'
          const { value, error } = applyTextOp(op, node.data.options ?? {}, upstreamValue)
          if (error) {
            updateNodeData(node.id, { status: 'error', error })
            execution.setStep({
              nodeId: node.id,
              label: 'Transform',
              detail: error,
              state: 'error',
            })
            throw new Error(`${labelFor(node)} node: ${error}`)
          }
          results.set(node.id, value)
          updateNodeData(node.id, { output: value, status: 'done', error: undefined })
          execution.setStep({
            nodeId: node.id,
            label: 'Transform',
            detail: value ? `${op} · ${value.length} chars` : `${op} · empty`,
            state: 'done',
          })
          break
        }

        case 'cache': {
          if (node.data.enabled === false) {
            results.set(node.id, upstreamValue)
            updateNodeData(node.id, { status: 'done', output: upstreamValue, error: undefined })
            execution.setStep({
              nodeId: node.id,
              label: 'Cache',
              detail: 'disabled · passing through',
              state: 'done',
            })
            break
          }

          const governed = gates.get(node.id) ?? []
          const active = governed.filter((id) => !skipped.has(id))
          const template = node.data.keyTemplate?.trim() || DEFAULT_CACHE_KEY
          const fingerprint = node.data.nodeFingerprint === false ? '' : fingerprintOf(governed, lookup)
          const key = `${renderPrompt(template, upstreamValue)}\u0000${fingerprint}`

          const entry = cacheGet(key)
          if (entry && sameNodes(entry.nodes, active)) {
            results.set(node.id, upstreamValue)
            active.forEach((targetId, index) => {
              const value = entry.values[index] ?? ''
              results.set(targetId, value)
              served.add(targetId)
              const target = lookup.get(targetId)
              if (target && (target.type === 'llm' || target.type === 'end')) {
                updateNodeData(targetId, { status: 'done', output: value, error: undefined })
              }
            })
            updateNodeData(node.id, {
              status: 'done',
              hit: true,
              output: upstreamValue,
              error: undefined,
            })
            execution.setStep({
              nodeId: node.id,
              label: 'Cache',
              detail: `hit · skipped ${active.length} node${active.length === 1 ? '' : 's'}`,
              state: 'done',
            })
            break
          }

          results.set(node.id, upstreamValue)
          pendingWrites.set(node.id, { key, nodes: active })
          updateNodeData(node.id, {
            status: 'done',
            hit: false,
            output: upstreamValue,
            error: undefined,
          })
          execution.setStep({
            nodeId: node.id,
            label: 'Cache',
            detail: 'miss · will store result',
            state: 'done',
          })
          break
        }

        case 'end': {
          results.set(node.id, upstreamValue)
          updateNodeData(node.id, { output: upstreamValue, status: 'done', error: undefined })
          execution.setStep({
            nodeId: node.id,
            label: 'End',
            detail: upstreamId ? 'received upstream output' : 'no upstream connection',
            state: upstreamId ? 'done' : 'skipped',
          })
          break
        }
      }

      activeNodeId = null
    }

    if (!useExecutionStore.getState().isCancelled()) {
      for (const [gateId, pending] of pendingWrites) {
        const values = pending.nodes.map((id) => results.get(id) ?? '')
        cacheSet(pending.key, pending.nodes, values)
        execution.setStep({
          nodeId: gateId,
          label: 'Cache',
          detail: `miss · stored ${pending.nodes.length} result${pending.nodes.length === 1 ? '' : 's'}`,
          state: 'done',
        })
      }
    }

    useExecutionStore.getState().finish()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const hint = (error as { hint?: string }).hint

    if (activeNodeId) {
      useGraphStore.getState().updateNodeData(activeNodeId, { status: 'error', error: message })
    }
    const current = useExecutionStore.getState().steps.find((step) => step.state === 'running')
    if (current) {
      useExecutionStore.getState().setStep({ ...current, detail: message, state: 'error' })
    }
    useExecutionStore.getState().fail(hint ? `${message} ${hint}` : message)
  }
}

export async function cancelRun(): Promise<void> {
  useExecutionStore.getState().requestCancel()
  await interruptGeneration()
}
