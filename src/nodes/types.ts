import type { BranchConditionKind } from '../lib/branchConditions'
import type { TextOpKind } from '../lib/textOps'

export type NodeStatus = 'idle' | 'loading' | 'running' | 'done' | 'error'

export type StartNodeData = {
  input: string
  status?: NodeStatus
  error?: string
}

export type LLMNodeData = {
  model: string
  systemPrompt: string
  promptTemplate: string
  temperature?: number
  maxTokens?: number
  seed?: number
  stop?: string[]
  output?: string
  status?: NodeStatus
  progress?: number
  progressText?: string
  truncated?: boolean
  error?: string
}

export type EndNodeData = {
  output: string
  status?: NodeStatus
  error?: string
}

export type CacheNodeData = {
  keyTemplate: string
  enabled?: boolean
  nodeFingerprint?: boolean
  output?: string
  status?: NodeStatus
  hit?: boolean
  error?: string
}

export type TransformNodeData = {
  op: TextOpKind
  options: Record<string, string>
  output?: string
  status?: NodeStatus
  error?: string
}

export type BranchNodeData = {
  condition: BranchConditionKind
  options: Record<string, string>
  output?: string
  matched?: boolean
  status?: NodeStatus
  error?: string
}

export type MergeNodeData = {
  separator: string
  sources: string
  labelWithSource: boolean
  skipEmpty: boolean
  output?: string
  status?: NodeStatus
  error?: string
}

export type LocalNodeData =
  | StartNodeData
  | LLMNodeData
  | EndNodeData
  | CacheNodeData
  | TransformNodeData
  | BranchNodeData
  | MergeNodeData
export type DataPatch = Record<string, unknown>
