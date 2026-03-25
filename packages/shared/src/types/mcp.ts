export type McpTransport = "stdio" | "ws" | "http"
export type McpConnectionStatus = "connected" | "disconnected" | "connecting" | "error"

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpStdioConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpWsConfig {
  url: string
  authToken?: string
}

export interface McpHttpConfig {
  endpoint: string
  authToken?: string
}

export interface McpServerConfig {
  id: string
  name: string
  description: string
  transport: McpTransport
  // stdio
  command?: string
  args?: string[]
  env?: Record<string, string>
  // WebSocket
  url?: string
  authToken?: string
  // HTTP SSE
  endpoint?: string
  assignedAgents: string[]
  autoConnect: boolean
  reconnectMs: number
  createdAt: number
  updatedAt: number
  // runtime
  status?: McpConnectionStatus
  tools?: McpTool[]
  toolCount?: number
}

export interface McpServerCreateInput {
  name: string
  description: string
  transport: McpTransport
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  authToken?: string
  endpoint?: string
  assignedAgents?: string[]
  autoConnect?: boolean
  reconnectMs?: number
}
