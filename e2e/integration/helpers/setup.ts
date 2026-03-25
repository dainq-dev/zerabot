import { api } from './api-client'
import { ALL_TEST_AGENTS } from '../fixtures/test-agents'
import { sleep } from './wait-utils'
import type { Agent } from '@zerobot/shared'

export async function setupTestAgents(): Promise<void> {
  for (const agent of ALL_TEST_AGENTS) {
    // Create if not exists (ignore conflict)
    await api.post('/api/agents', agent).catch(() => {})
    // Stop if still running from a previous test
    await api.post(`/api/agents/${agent.id}/stop`).catch(() => {})
  }
  // Brief pause to let OpenClaw process stops
  await sleep(500)
}

export async function teardownTestAgents(): Promise<void> {
  for (const { id } of ALL_TEST_AGENTS) {
    await api.post(`/api/agents/${id}/stop`).catch(() => {})
    await sleep(200)
    await api.delete(`/api/agents/${id}`).catch(() => {})
  }
}

export async function getAgentStatus(id: string): Promise<Agent['status']> {
  const { agent } = await api.get<{ agent: Agent }>(`/api/agents/${id}`)
  return agent.status
}
