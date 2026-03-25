import type { TokenUsagePoint } from '@zerobot/shared'

const now = Date.now()
const hour = (offset: number) => Math.floor((now - offset * 3_600_000) / 3_600_000) * 3_600_000

export const MOCK_TOKEN_METRICS: TokenUsagePoint[] = Array.from({ length: 24 }, (_, i) => ({
  hour: hour(i),
  agentId: 'agent-alpha',
  model: 'anthropic/claude-haiku-4-5',
  inputTokens: Math.floor(Math.random() * 400 + 100),
  outputTokens: Math.floor(Math.random() * 200 + 50),
  totalTokens: 0, // will be derived
})).map(p => ({ ...p, totalTokens: p.inputTokens + p.outputTokens }))

export const MOCK_TOKEN_METRICS_MULTI: TokenUsagePoint[] = [
  ...MOCK_TOKEN_METRICS,
  ...Array.from({ length: 24 }, (_, i) => ({
    hour: hour(i),
    agentId: 'agent-beta',
    model: 'anthropic/claude-sonnet-4-6',
    inputTokens: Math.floor(Math.random() * 600 + 200),
    outputTokens: Math.floor(Math.random() * 300 + 100),
    totalTokens: 0,
  })).map(p => ({ ...p, totalTokens: p.inputTokens + p.outputTokens })),
]
