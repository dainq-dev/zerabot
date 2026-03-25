/**
 * BDD Tests: Gateway Process Manager (OpenClaw)
 *
 * Sprint 2 — viết trước khi implement.
 * Tests process-manager.ts: single-gateway lifecycle.
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'
import { waitUntil, sleep } from './helpers/wait-utils'
import type { Agent } from '@zerobot/shared'

test.describe('Gateway Lifecycle (BDD)', () => {
  const TEST_AGENT = {
    id: 'gw-lifecycle-agent',
    name: 'GW Lifecycle Test',
    emoji: '🧪',
    model: 'anthropic/claude-haiku-4-5',
    toolsProfile: 'full' as const,
    allowAgents: [],
    limits: { maxRamMb: 50, maxTokensPerHour: 1000, maxConcurrentTasks: 2 },
  }

  test.beforeAll(async () => {
    // Cleanup from previous runs
    await api.post(`/api/agents/${TEST_AGENT.id}/stop`).catch(() => {})
    await api.delete(`/api/agents/${TEST_AGENT.id}`).catch(() => {})
  })

  test.afterAll(async () => {
    await api.post(`/api/agents/${TEST_AGENT.id}/stop`).catch(() => {})
    await sleep(500)
    await api.delete(`/api/agents/${TEST_AGENT.id}`).catch(() => {})
  })

  // ── Feature: Agent CRUD ──

  test('tạo agent mới → saved vào DB', async () => {
    const { agent } = await api.post<{ agent: Agent }>('/api/agents', TEST_AGENT)
    expect(agent.id).toBe(TEST_AGENT.id)
    expect(agent.toolsProfile).toBe('full')
  })

  // ── Feature: Start agent → gateway process chạy ──

  test('start agent → status chuyển sang running', async () => {
    await api.post(`/api/agents/${TEST_AGENT.id}/start`)

    await waitUntil(
      async () => {
        const { agent } = await api.get<{ agent: Agent }>(`/api/agents/${TEST_AGENT.id}`)
        return agent.status === 'running'
      },
      15_000,
    )

    const { agent } = await api.get<{ agent: Agent }>(`/api/agents/${TEST_AGENT.id}`)
    expect(agent.status).toBe('running')
  })

  // ── Feature: Restart agent ──

  test('restart agent → status vẫn running sau restart', async () => {
    await api.post(`/api/agents/${TEST_AGENT.id}/restart`)

    await waitUntil(
      async () => {
        const { agent } = await api.get<{ agent: Agent }>(`/api/agents/${TEST_AGENT.id}`)
        return agent.status === 'running'
      },
      15_000,
    )

    const { agent } = await api.get<{ agent: Agent }>(`/api/agents/${TEST_AGENT.id}`)
    expect(agent.status).toBe('running')
  })

  // ── Feature: Stop agent ──

  test('stop agent → status chuyển sang stopped', async () => {
    await api.post(`/api/agents/${TEST_AGENT.id}/stop`)

    await waitUntil(
      async () => {
        const { agent } = await api.get<{ agent: Agent }>(`/api/agents/${TEST_AGENT.id}`)
        return agent.status === 'stopped'
      },
      10_000,
    )

    const { agent } = await api.get<{ agent: Agent }>(`/api/agents/${TEST_AGENT.id}`)
    expect(agent.status).toBe('stopped')
  })

  // ── Feature: Delete agent ──

  test('delete agent → GET trả 404', async () => {
    await api.delete(`/api/agents/${TEST_AGENT.id}`)
    await expect(api.get(`/api/agents/${TEST_AGENT.id}`)).rejects.toThrow('404')
  })
})
