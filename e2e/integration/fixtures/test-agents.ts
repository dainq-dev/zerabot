import type { AgentCreateInput } from '@zerobot/shared'

/** Manager — orchestrates team, uses sessions_send */
export const MANAGER_AGENT: AgentCreateInput = {
  id: 'test-manager',
  name: 'Test Manager',
  emoji: '👔',
  model: 'anthropic/claude-haiku-4-5',
  toolsProfile: 'full',
  allowAgents: ['test-researcher', 'test-worker'],
  limits: { maxRamMb: 50, maxTokensPerHour: 2000, maxConcurrentTasks: 3 },
}

/** Researcher — full tools + browser for web research */
export const RESEARCHER_AGENT: AgentCreateInput = {
  id: 'test-researcher',
  name: 'Test Researcher',
  emoji: '🔍',
  model: 'anthropic/claude-haiku-4-5',
  toolsProfile: 'full',
  allowAgents: [],
  limits: { maxRamMb: 100, maxTokensPerHour: 3000, maxConcurrentTasks: 2 },
}

/** Worker — coding profile, no browser */
export const WORKER_AGENT: AgentCreateInput = {
  id: 'test-worker',
  name: 'Test Worker',
  emoji: '⚙️',
  model: 'anthropic/claude-haiku-4-5',
  toolsProfile: 'coding',
  allowAgents: [],
  limits: { maxRamMb: 50, maxTokensPerHour: 1000, maxConcurrentTasks: 1 },
}

/** Isolated — minimal profile, no external access */
export const ISOLATED_AGENT: AgentCreateInput = {
  id: 'test-isolated',
  name: 'Test Isolated',
  emoji: '🔒',
  model: 'anthropic/claude-haiku-4-5',
  toolsProfile: 'minimal',
  allowAgents: [],
  limits: { maxRamMb: 50, maxTokensPerHour: 500, maxConcurrentTasks: 1 },
}

export const ALL_TEST_AGENTS = [MANAGER_AGENT, RESEARCHER_AGENT, WORKER_AGENT, ISOLATED_AGENT]
