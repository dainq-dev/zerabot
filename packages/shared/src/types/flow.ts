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
