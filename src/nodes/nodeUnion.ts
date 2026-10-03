import type { BranchFlowNode } from './BranchNode'
import type { CacheFlowNode } from './CacheNode'
import type { EndFlowNode } from './EndNode'
import type { LLMFlowNode } from './LLMNode'
import type { MergeFlowNode } from './MergeNode'
import type { StartFlowNode } from './StartNode'
import type { TransformFlowNode } from './TransformNode'

export type AppNode =
  | StartFlowNode
  | LLMFlowNode
  | EndFlowNode
  | CacheFlowNode
  | TransformFlowNode
  | BranchFlowNode
  | MergeFlowNode