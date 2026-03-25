/**
 * BDD Tests: Multi-Agent Data Analyst Orchestration (Sprint 4)
 *
 * Tests the full Data Analyst pipeline:
 *   Manager → Researcher → Data Cleaner → Data Entry
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'
import { waitUntil, sleep } from './helpers/wait-utils'
import type { Agent } from '@zerobot/shared'

const DATA_ANALYST_AGENTS = [
  {
    id: 'da-manager',
    name: 'Manager Agent',
    emoji: '👔',
    model: 'anthropic/claude-haiku-4-5',
    toolsProfile: 'full' as const,
    allowAgents: ['da-researcher', 'da-cleaner', 'da-entry'],
    limits: { maxRamMb: 50, maxTokensPerHour: 2000, maxConcurrentTasks: 3 },
  },
  {
    id: 'da-researcher',
    name: 'Research Agent',
    emoji: '🔍',
    model: 'anthropic/claude-haiku-4-5',
    toolsProfile: 'full' as const,
    allowAgents: [],
    limits: { maxRamMb: 100, maxTokensPerHour: 3000, maxConcurrentTasks: 2 },
  },
  {
    id: 'da-cleaner',
    name: 'Data Cleaner Agent',
    emoji: '🧹',
    model: 'anthropic/claude-haiku-4-5',
    toolsProfile: 'coding' as const,
    allowAgents: [],
    limits: { maxRamMb: 50, maxTokensPerHour: 1000, maxConcurrentTasks: 1 },
  },
  {
    id: 'da-entry',
    name: 'Data Entry Agent',
    emoji: '📊',
    model: 'anthropic/claude-haiku-4-5',
    toolsProfile: 'full' as const,
    allowAgents: [],
    limits: { maxRamMb: 100, maxTokensPerHour: 2000, maxConcurrentTasks: 2 },
  },
]

test.describe('Multi-Agent Data Analyst (BDD)', () => {
  test.beforeAll(async () => {
    // Cleanup
    for (const a of DATA_ANALYST_AGENTS) {
      await api.post(`/api/agents/${a.id}/stop`).catch(() => {})
      await api.delete(`/api/agents/${a.id}`).catch(() => {})
    }
  })

  test.afterAll(async () => {
    for (const a of DATA_ANALYST_AGENTS) {
      await api.post(`/api/agents/${a.id}/stop`).catch(() => {})
      await sleep(300)
      await api.delete(`/api/agents/${a.id}`).catch(() => {})
    }
  })

  // ── Feature: Create Data Analyst team ──

  test('tạo 4 agents cho Data Analyst team', async () => {
    for (const agentDef of DATA_ANALYST_AGENTS) {
      const { agent } = await api.post<{ agent: Agent }>('/api/agents', agentDef)
      expect(agent.id).toBe(agentDef.id)
      expect(agent.toolsProfile).toBe(agentDef.toolsProfile)
    }
  })

  // ── Feature: All agents list shows team ──

  test('GET /api/agents → trả đủ 4 agents', async () => {
    const { agents } = await api.get<{ agents: Agent[] }>('/api/agents')
    const daAgents = agents.filter(a => a.id.startsWith('da-'))
    expect(daAgents.length).toBe(4)
  })

  // ── Feature: Start all agents ──

  test('start all → tất cả running', async () => {
    for (const a of DATA_ANALYST_AGENTS) {
      await api.post(`/api/agents/${a.id}/start`)
    }

    // Wait for all to be running
    await waitUntil(
      async () => {
        const { agents } = await api.get<{ agents: Agent[] }>('/api/agents')
        const daAgents = agents.filter(a => a.id.startsWith('da-'))
        return daAgents.every(a => a.status === 'running')
      },
      30_000,
    )

    const { agents } = await api.get<{ agents: Agent[] }>('/api/agents')
    const daAgents = agents.filter(a => a.id.startsWith('da-'))
    expect(daAgents.every(a => a.status === 'running')).toBe(true)
  })

  // ── Feature: Manager can dispatch task ──

  test('dispatch task tới manager → thành công', async () => {
    const result = await api.post<{ ok: boolean; runId: string }>('/api/tasks', {
      targetType: 'agent',
      targetId: 'da-manager',
      prompt: 'Tìm giá vàng 9999 SJC hôm nay trên sjc.com.vn',
    })

    expect(result.ok).toBe(true)
    expect(result.runId).toBeDefined()
  })

  // ── Feature: Agent limits persisted ──

  test('agent limits → maxTokensPerHour đúng', async () => {
    const { agent: researcher } = await api.get<{ agent: Agent }>('/api/agents/da-researcher')
    expect(researcher.limits.maxTokensPerHour).toBe(3000)
    expect(researcher.limits.maxRamMb).toBe(100)

    const { agent: cleaner } = await api.get<{ agent: Agent }>('/api/agents/da-cleaner')
    expect(cleaner.limits.maxTokensPerHour).toBe(1000)
    expect(cleaner.toolsProfile).toBe('coding')
  })

  // ── Feature: Stop all agents ──

  test('stop all → tất cả stopped', async () => {
    for (const a of DATA_ANALYST_AGENTS) {
      await api.post(`/api/agents/${a.id}/stop`)
    }

    await waitUntil(
      async () => {
        const { agents } = await api.get<{ agents: Agent[] }>('/api/agents')
        const daAgents = agents.filter(a => a.id.startsWith('da-'))
        return daAgents.every(a => a.status === 'stopped')
      },
      15_000,
    )

    const { agents } = await api.get<{ agents: Agent[] }>('/api/agents')
    const daAgents = agents.filter(a => a.id.startsWith('da-'))
    expect(daAgents.every(a => a.status === 'stopped')).toBe(true)
  })
})
