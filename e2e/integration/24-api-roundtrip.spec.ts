/**
 * BDD Tests: Agent API, Cron, Task Dispatch (Sprint 3)
 *
 * Full round-trip: UI → API → OpenClaw → Events → UI
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'
import { waitUntil, sleep } from './helpers/wait-utils'
import type { Agent } from '@zerobot/shared'

test.describe('Agent API Round-trip (BDD)', () => {
  const AGENT_BASE = {
    name: 'RoundTrip Agent',
    model: 'anthropic/claude-haiku-4-5',
    allowAgents: [],
    limits: { maxRamMb: 50, maxTokensPerHour: 1000, maxConcurrentTasks: 2 },
  }

  test.afterAll(async () => {
    for (const id of ['rt-full', 'rt-coding', 'rt-msg', 'rt-cron-agent']) {
      await api.post(`/api/agents/${id}/stop`).catch(() => {})
      await api.delete(`/api/agents/${id}`).catch(() => {})
    }
  })

  // ── Feature: Agent CRUD with new tool profiles ──

  test('tạo agent profile "coding" → thành công', async () => {
    const { agent } = await api.post<{ agent: Agent }>('/api/agents', {
      ...AGENT_BASE,
      id: 'rt-coding',
      toolsProfile: 'coding',
    })
    expect(agent.toolsProfile).toBe('coding')
  })

  test('tạo agent profile "messaging" → thành công', async () => {
    const { agent } = await api.post<{ agent: Agent }>('/api/agents', {
      ...AGENT_BASE,
      id: 'rt-msg',
      toolsProfile: 'messaging',
    })
    expect(agent.toolsProfile).toBe('messaging')
  })

  test('tạo agent profile "full" → start → stop', async () => {
    await api.post('/api/agents', {
      ...AGENT_BASE,
      id: 'rt-full',
      toolsProfile: 'full',
    })

    await api.post('/api/agents/rt-full/start')
    await waitUntil(
      async () => {
        const { agent } = await api.get<{ agent: Agent }>('/api/agents/rt-full')
        return agent.status === 'running'
      },
      15_000,
    )

    const { agent } = await api.get<{ agent: Agent }>('/api/agents/rt-full')
    expect(agent.status).toBe('running')

    await api.post('/api/agents/rt-full/stop')
    await waitUntil(
      async () => {
        const { agent: a } = await api.get<{ agent: Agent }>('/api/agents/rt-full')
        return a.status === 'stopped'
      },
      10_000,
    )
  })

  // ── Feature: Pair code deprecated ──

  test('POST pair-code → trả 410 deprecated', async () => {
    await api.post('/api/agents', {
      ...AGENT_BASE,
      id: 'rt-cron-agent',
      toolsProfile: 'minimal',
    })

    await expect(
      api.post('/api/agents/rt-cron-agent/pair-code'),
    ).rejects.toThrow('410')
  })

  // ── Feature: Cron CRUD ──

  test('tạo cron job → GET trả đúng', async () => {
    const { job } = await api.post<{ job: { id: string; name: string; schedule: string } }>('/api/cron', {
      name: 'Test Cron',
      schedule: '0 9 * * *',
      agentId: 'rt-cron-agent',
      task: 'Tìm giá vàng SJC',
      enabled: true,
    })

    expect(job.name).toBe('Test Cron')
    expect(job.schedule).toBe('0 9 * * *')

    // Cleanup
    await api.delete(`/api/cron/${job.id}`).catch(() => {})
  })

  // ── Feature: Task dispatch ──

  test('POST /api/tasks → dispatch thành công khi agent running', async () => {
    await api.post('/api/agents/rt-full/start')
    await waitUntil(
      async () => {
        const { agent } = await api.get<{ agent: Agent }>('/api/agents/rt-full')
        return agent.status === 'running'
      },
      15_000,
    )

    const result = await api.post<{ ok: boolean; runId: string }>('/api/tasks', {
      targetType: 'agent',
      targetId: 'rt-full',
      prompt: 'Sprint 3 round-trip test',
    })

    expect(result.ok).toBe(true)
    expect(result.runId).toBeDefined()

    await api.post('/api/agents/rt-full/stop')
  })
})
