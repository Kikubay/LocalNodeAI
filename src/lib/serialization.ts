import type { Edge } from '@xyflow/react'
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from '../lib/models'
import { defaultTextOptions, isTextOpKind } from './textOps'
import { defaultBranchOptions, isBranchConditionKind } from './branchConditions'
import { DEFAULT_MERGE_OPTIONS } from './merge'
import { readGenerationSettings } from './generation'
import type { LocalNode } from '../store/graphStore'
import { useGraphStore } from '../store/graphStore'

export const PAYLOAD_ID = 'localnodeai-workflow'

export type WorkflowPayload = {
  version: 1
  app: 'LocalNodeAI'
  exportedAt: string
  nodes: LocalNode[]
  edges: Edge[]
  viewport?: { x: number; y: number; zoom: number }
}

export class ExportError extends Error {
  hint?: string
  constructor(message: string, hint?: string) {
    super(message)
    this.name = 'ExportError'
    this.hint = hint
  }
}

const TRANSIENT_KEYS = ['status', 'progress', 'progressText', 'error'] as const

export type SanitizeOptions = {
  keepOutput?: boolean
}

function sanitizeNode(node: LocalNode, options: SanitizeOptions = {}): LocalNode {
  const data: Record<string, unknown> = { ...(node.data as Record<string, unknown>) }
  for (const key of TRANSIENT_KEYS) delete data[key]

  if (node.type === 'start') data.input = String(data.input ?? '')
  if (node.type === 'end') data.output = String(data.output ?? '')
  if (node.type === 'llm') {
    data.model = String(data.model || DEFAULT_MODEL)
    data.systemPrompt = String(data.systemPrompt || DEFAULT_SYSTEM_PROMPT)
    data.promptTemplate = String(data.promptTemplate || '{{input}}')
    const generation = readGenerationSettings(data as Parameters<typeof readGenerationSettings>[0])
    data.temperature = generation.temperature
    data.maxTokens = generation.maxTokens
    if (generation.seed === undefined) delete data.seed
    else data.seed = generation.seed
    if (!generation.stop || generation.stop.length === 0) delete data.stop
    else data.stop = generation.stop
    delete data.truncated
  }
  if (node.type === 'cache') {
    data.keyTemplate = String(data.keyTemplate || '{{input}}')
    data.enabled = data.enabled !== false
    data.nodeFingerprint = data.nodeFingerprint !== false
    delete data.hit
  }
  if (node.type === 'transform') {
    const op = isTextOpKind(data.op) ? data.op : 'template'
    const saved = (data.options ?? {}) as Record<string, unknown>
    const options_: Record<string, string> = {}
    for (const [key, value] of Object.entries(saved)) options_[key] = String(value)
    data.op = op
    data.options = { ...defaultTextOptions(op), ...options_ }
  }
  if (node.type === 'branch') {
    const condition = isBranchConditionKind(data.condition) ? data.condition : 'always'
    const saved = (data.options ?? {}) as Record<string, unknown>
    const options_: Record<string, string> = {}
    for (const [key, value] of Object.entries(saved)) options_[key] = String(value)
    data.condition = condition
    data.options = { ...defaultBranchOptions(condition), ...options_ }
    delete data.matched
  }
  if (node.type === 'merge') {
    data.separator = String(data.separator ?? DEFAULT_MERGE_OPTIONS.separator)
    data.sources = String(data.sources ?? DEFAULT_MERGE_OPTIONS.sources)
    data.labelWithSource = data.labelWithSource === true
    data.skipEmpty = data.skipEmpty !== false
  }

  if (!options.keepOutput) delete data.output

  return {
    id: String(node.id),
    type: node.type,
    position: { x: Number(node.position?.x ?? 0), y: Number(node.position?.y ?? 0) },
    data,
  } as LocalNode
}

function sanitizeEdge(edge: Edge): Edge {
  return {
    id: String(edge.id),
    source: String(edge.source),
    target: String(edge.target),
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  }
}

export type GraphSnapshot = {
  nodes: LocalNode[]
  edges: Edge[]
  viewport: { x: number; y: number; zoom: number }
}

export function snapshotGraph(options: SanitizeOptions = {}): GraphSnapshot {
  const { nodes, edges, viewport } = useGraphStore.getState()
  return {
    nodes: nodes.map((node) => sanitizeNode(node, options)),
    edges: edges.map(sanitizeEdge),
    viewport: { ...viewport },
  }
}

export function currentPayload(): WorkflowPayload {
  const { nodes, edges, viewport } = snapshotGraph({ keepOutput: true })
  return {
    version: 1,
    app: 'LocalNodeAI',
    exportedAt: new Date().toISOString(),
    nodes,
    edges,
    viewport,
  }
}

export function encodePayload(payload: WorkflowPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function decodePayload(base64: string): WorkflowPayload | null {
  try {
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as WorkflowPayload
    if (parsed?.version !== 1 || !Array.isArray(parsed.nodes)) return null
    return parsed
  } catch {
    return null
  }
}

export function readInjectedPayload(): WorkflowPayload | null {
  if (typeof document === 'undefined') return null
  const element = document.getElementById(PAYLOAD_ID)
  if (!element?.textContent) return null
  return decodePayload(element.textContent.trim())
}

const KNOWN_NODE_TYPES = new Set(['start', 'llm', 'end', 'cache', 'transform', 'branch', 'merge'])

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type AppliedWorkflow = {
  nodes: LocalNode[]
  edges: Edge[]
  viewport?: { x: number; y: number; zoom: number }
  warnings: string[]
}

export function applyWorkflow(payload: WorkflowPayload): AppliedWorkflow {
  const warnings: string[] = []

  const nodes = payload.nodes
    .filter((node) => node && typeof node.id === 'string')
    .filter((node) => {
      const known = KNOWN_NODE_TYPES.has(String(node.type))
      if (!known) warnings.push(`Dropped unknown node type "${String(node.type)}".`)
      return known
    })
    .map((node) => sanitizeNode(node))

  const ids = new Set(nodes.map((node) => node.id))
  const before = payload.edges.length
  const edges = payload.edges.filter((edge) => {
    const valid =
      edge && typeof edge.id === 'string' && ids.has(String(edge.source)) && ids.has(String(edge.target))
    if (!valid) warnings.push(`Dropped edge "${String(edge?.id)}" with a missing endpoint.`)
    return valid
  })

  if (nodes.length === 0) {
    warnings.push('No usable nodes were found in that workflow.')
  }
  if (before !== edges.length) warnings.push(`${before - edges.length} connection(s) removed.`)

  const seen = new Set<string>()
  const deduped = nodes.filter((node) => {
    if (seen.has(node.id)) {
      warnings.push(`Dropped duplicate node id "${node.id}".`)
      return false
    }
    seen.add(node.id)
    return true
  })

  return { nodes: deduped, edges, viewport: payload.viewport, warnings }
}

export function parseWorkflowJson(text: string): { payload: WorkflowPayload | null; error?: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    return { payload: null, error: `That file is not valid JSON (${messageOf(error)}).` }
  }

  const payload = raw as WorkflowPayload | null
  if (!payload || payload.version !== 1 || !Array.isArray(payload.nodes)) {
    return { payload: null, error: 'That JSON is not a LocalNodeAI workflow.' }
  }
  if (!Array.isArray(payload.edges)) payload.edges = []

  return { payload }
}

export function hydrateFromInjectedState(): boolean {
  const payload = readInjectedPayload()
  if (!payload) return false

  const { nodes, edges, viewport } = applyWorkflow(payload)
  const store = useGraphStore.getState()
  store.replaceGraph(nodes, edges)
  if (viewport) store.setViewport(viewport)
  return true
}

function isSelfContained(html: string): boolean {
  const hasExternalScript = /<script\b[^>]*\ssrc=/.test(html)
  const hasExternalStyle = /<link\b[^>]*rel=["']?stylesheet/.test(html)
  return !hasExternalScript && !hasExternalStyle
}

async function readDocumentHtml(): Promise<string> {
  if (typeof location !== 'undefined' && location.protocol.startsWith('http')) {
    try {
      const response = await fetch(location.href, { cache: 'no-store' })
      if (response.ok) {
        const html = await response.text()
        if (isSelfContained(html)) return html
      }
    } catch {
    }
  }

  const snapshot = `<!doctype html>\n${document.documentElement.outerHTML}`
  if (!isSelfContained(snapshot)) {
    throw new ExportError(
      'Export needs a self-contained build.',
      'Run "npm run build" and open dist/index.html — dev mode references external assets.',
    )
  }
  return snapshot
}

export function injectPayload(html: string, base64: string): string {
  const tag = `<script id="${PAYLOAD_ID}" type="application/json">${base64}</script>`
  const withoutPrevious = html.replace(
    new RegExp(`<script id="${PAYLOAD_ID}"[^>]*>[\\s\\S]*?<\\/script>`, 'g'),
    '',
  )

  const headOpen = withoutPrevious.indexOf('<head>')
  if (headOpen !== -1) {
    const at = headOpen + '<head>'.length
    return `${withoutPrevious.slice(0, at)}\n${tag}\n${withoutPrevious.slice(at)}`
  }

  const bodyOpen = withoutPrevious.indexOf('<body>')
  if (bodyOpen !== -1) {
    const at = bodyOpen + '<body>'.length
    return `${withoutPrevious.slice(0, at)}\n${tag}\n${withoutPrevious.slice(at)}`
  }

  return tag + withoutPrevious
}

export async function buildExportHtml(): Promise<string> {
  const html = await readDocumentHtml()
  return injectPayload(html, encodePayload(currentPayload()))
}

export function downloadHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function exportFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `localnodeai-${stamp}.html`
}
