export type EventType =
  | "tool.call"
  | "tool.result"
  | "agent.status"
  | "agent.error"
  | "session.message"
  | "cron.fired"
  | "cron.completed"
  | "mcp.call"
  | "mcp.result"
  | "channel.message"
  | "channel.sent"
  | "pipeline.started"
  | "pipeline.completed"
  | "pipeline.failed"
  | "system.info"
  | "system.warning"
  | "system.error"

export type EventSeverity = "info" | "warning" | "error" | "debug"

export interface ZerabotEvent {
  id: string
  ts: number
  agentId?: string
  pipelineId?: string
  type: EventType
  severity: EventSeverity
  payload: Record<string, unknown>
  tokenUsed: number
}

export interface ToolCallPayload {
  tool: string
  input: unknown
  output?: unknown
  latencyMs?: number
  error?: string
}

export interface AgentStatusPayload {
  agentId: string
  from: string
  to: string
  reason?: string
}

export interface SessionMessagePayload {
  role: "user" | "assistant"
  content: string
  tokenCount?: number
}

export interface CronFiredPayload {
  jobId: string
  jobName: string
  runId: string
  schedule: string
}

export interface McpCallPayload {
  serverId: string
  tool: string
  input: unknown
  output?: unknown
  latencyMs?: number
}

// WebSocket message types
export type WsMessageType = "event" | "agent_status" | "token_usage" | "ping" | "pong" | "subscribe" | "unsubscribe"

export interface WsMessage {
  type: WsMessageType
  payload: unknown
}

export interface WsSubscribePayload {
  agentIds?: string[]
  eventTypes?: EventType[]
}
