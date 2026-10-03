import type { Edge } from '@xyflow/react'
import type { LocalNode } from '../store/graphStore'

export class GraphError extends Error {}

export function topologicalOrder(nodes: LocalNode[], edges: Edge[]): LocalNode[] {
  const ids = new Set(nodes.map((node) => node.id))
  const indegree = new Map<string, number>(nodes.map((node) => [node.id, 0]))
  const adjacency = new Map<string, string[]>()

  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new GraphError(`Edge "${edge.id}" references a node that no longer exists.`)
    }
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target])
  }

  const queue = nodes.filter((node) => (indegree.get(node.id) ?? 0) === 0).map((node) => node.id)
  const order: LocalNode[] = []
  const byId = new Map(nodes.map((node) => [node.id, node]))

  while (queue.length > 0) {
    const id = queue.shift() as string
    order.push(byId.get(id) as LocalNode)
    for (const next of adjacency.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }

  if (order.length !== nodes.length) {
    throw new GraphError('The graph contains a cycle. Connections must flow one direction.')
  }

  return order
}

export function labelFor(node: LocalNode): string {
  if (node.type === 'start') return 'Start'
  if (node.type === 'llm') return 'LLM'
  if (node.type === 'cache') return 'Cache'
  if (node.type === 'transform') return 'Transform'
  if (node.type === 'branch') return 'Branch'
  if (node.type === 'merge') return 'Merge'
  return 'End'
}

export function renderPrompt(template: string, input: string): string {
  const trimmed = template.trim()
  const source = trimmed.length > 0 ? trimmed : '{{input}}'
  if (!source.includes('{{input}}')) {
    return `${source}\n\n${input}`.trim()
  }
  return source.replaceAll('{{input}}', input)
}
