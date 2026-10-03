import type { NodeTypes } from '@xyflow/react'
import { BranchNode } from './BranchNode'
import { CacheNode } from './CacheNode'
import { EndNode } from './EndNode'
import { LLMNode } from './LLMNode'
import { MergeNode } from './MergeNode'
import { StartNode } from './StartNode'
import { TransformNode } from './TransformNode'

export const nodeTypes = {
  start: StartNode,
  llm: LLMNode,
  end: EndNode,
  cache: CacheNode,
  transform: TransformNode,
  branch: BranchNode,
  merge: MergeNode,
} satisfies NodeTypes

export { BranchNode, CacheNode, EndNode, LLMNode, MergeNode, StartNode, TransformNode }
export type { BranchFlowNode } from './BranchNode'
export type { CacheFlowNode } from './CacheNode'
export type { EndFlowNode } from './EndNode'
export type { LLMFlowNode } from './LLMNode'
export type { MergeFlowNode } from './MergeNode'
export type { StartFlowNode } from './StartNode'
export type { TransformFlowNode } from './TransformNode'
export type { AppNode } from './nodeUnion'
export * from './types'