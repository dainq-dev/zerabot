export type AgentStatus = "running" | "paused" | "stopped" | "error" | "starting"

export interface AgentLimits {
  maxRamMb: number
  maxTokensPerHour: number
  maxConcurrentTasks: number
}

export interface AgentSubagents {
  maxSpawnDepth: number
  maxChildren: number
  maxConcurrent: number
  allowAgents: string[]
}

export interface AgentTools {
  profile: "minimal" | "standard" | "full" | "custom" | "coding" | "messaging" | "research" | "crawl"
  allow: string[]
  deny: string[]
  mcpServers: string[]
}

export interface Agent {
  id: string
  name: string
  emoji?: string
  model: string
  soul?: string
  mission?: string
  instructions?: string
  toolsProfile: "minimal" | "standard" | "full" | "custom" | "coding" | "messaging" | "research" | "crawl"
  toolsAllow: string[]
  toolsDeny: string[]
  allowAgents: string[]
  mcpServers: string[]
  limits: AgentLimits
  subagents?: AgentSubagents
  enabled: boolean
  createdAt: number
  updatedAt: number
  // runtime fields (from OpenClaw gateway)
  status?: AgentStatus
  ramUsageMb?: number
  tokensUsedToday?: number
  tokensUsedThisHour?: number
  currentTask?: string
}

export interface AgentCreateInput {
  id: string
  name: string
  emoji?: string
  model: string
  soul?: string
  mission?: string
  instructions?: string
  toolsProfile?: "minimal" | "standard" | "full" | "custom" | "coding" | "messaging" | "research" | "crawl"
  toolsAllow?: string[]
  toolsDeny?: string[]
  allowAgents?: string[]
  mcpServers?: string[]
  limits?: Partial<AgentLimits>
  enabled?: boolean
}

export interface AgentUpdateInput extends Partial<AgentCreateInput> {
  limits?: Partial<AgentLimits>
}
