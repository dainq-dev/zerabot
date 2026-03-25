export interface TokenUsagePoint {
  hour: number        // Unix timestamp floored to hour
  agentId: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd?: number
}

export interface AgentMetrics {
  agentId: string
  agentName: string
  model: string
  tokensToday: number
  tokens7d: number
  tokens30d: number
  costToday: number
  cost7d: number
  cost30d: number
  avgResponseMs: number
  errorRate: number
  taskCount: number
}

export interface SystemMetrics {
  totalAgents: number
  runningAgents: number
  totalTokensToday: number
  totalCostToday: number
  activeCronJobs: number
  cronRunsToday: number
  cronSuccessRate: number
  eventsLast24h: number
  mcpCallsLast24h: number
}

export interface ToolUsageStat {
  tool: string
  callCount: number
  avgLatencyMs: number
  errorCount: number
}

export interface HourlyTokenData {
  hour: number
  [agentId: string]: number  // agent id → token count
}

export interface CostEstimate {
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
}

// Model pricing (per 1M tokens)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-opus-4-6": { input: 15, output: 75 },
  "anthropic/claude-sonnet-4-6": { input: 3, output: 15 },
  "anthropic/claude-haiku-4-5": { input: 0.8, output: 4 },
  "openai/gpt-4o": { input: 5, output: 15 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] ?? { input: 3, output: 15 }
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}
