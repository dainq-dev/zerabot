export type FlowNodeType = "agent" | "trigger" | "condition" | "channel" | "mcp" | "delay"
export type FlowEdgeType = "sequential" | "parallel" | "conditional"
export type PipelineTriggerType = "cron" | "webhook" | "manual" | "channel"
export type PipelineStatus = "active" | "running" | "paused" | "error" | "draft"

export interface FlowPosition {
  x: number
  y: number
}

export interface AgentNodeData {
  agentId: string
  agentName: string
  model?: string
  taskPrompt?: string
  outputVar?: string
}

export interface TriggerNodeData {
  triggerType: PipelineTriggerType
  schedule?: string       // cron expression
  webhookPath?: string
  channelId?: string
  label?: string
}

export interface ConditionNodeData {
  condition: string       // e.g. "output.includes('error')"
  trueLabel?: string
  falseLabel?: string
}

export interface ChannelNodeData {
  channelId: string
  messageTemplate: string
}

export interface McpNodeData {
  serverId: string
  toolName: string
  inputTemplate?: string
  outputVar?: string
}

export interface DelayNodeData {
  durationMs: number
  label?: string
}

export type FlowNodeData =
  | AgentNodeData
  | TriggerNodeData
  | ConditionNodeData
  | ChannelNodeData
  | McpNodeData
  | DelayNodeData

export interface FlowNode {
  id: string
  type: FlowNodeType
  position: FlowPosition
  data: FlowNodeData
  label?: string
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  type: FlowEdgeType
  label?: string
  condition?: string      // for conditional edges
}

export interface PipelineTrigger {
  type: PipelineTriggerType
  schedule?: string
  webhookPath?: string
  channelId?: string
}

export interface Pipeline {
  id: string
  name: string
  description?: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  trigger: PipelineTrigger
  status: PipelineStatus
  enabled: boolean
  createdAt: number
  updatedAt: number
  lastRunAt?: number
  runCount?: number
}

export type PipelineRunStatus = "running" | "done" | "error" | "cancelled"

export interface PipelineNodeResult {
  status: string
  output?: string
  error?: string
}

export interface PipelineRun {
  id: string
  pipelineId: string
  status: PipelineRunStatus
  triggerType: string
  startedAt: number
  finishedAt?: number
  vars: Record<string, string>
  nodeResults: Record<string, PipelineNodeResult>
  error?: string
}

export interface CrawledItem {
  id: string
  source: string
  category?: string
  url?: string
  title?: string
  content?: string
  structuredData?: Record<string, unknown>
  agentId?: string
  pipelineRunId?: string
  crawledAt: number
  publishedAt?: number
  tags: string[]
}
