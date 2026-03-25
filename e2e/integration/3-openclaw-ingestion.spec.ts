/**
 * BDD Tests: OpenClaw Event Ingestion & Task Dispatch
 *
 * Sprint 2 — viết trước khi implement.
 * Tests openclaw-ingestion.ts + task dispatch pipeline.
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'
import { waitUntil, sleep } from './helpers/wait-utils'
import { WsEventCollector } from './helpers/ws-collector'
import type { Agent } from '@zerobot/shared'

test.describe('Event Ingestion & Task Dispatch (BDD)', () => {
  const AGENT_ID = 'ingestion-test-agent'
  let wsCollector: WsEventCollector

  test.beforeAll(async () => {
    // Cleanup & create agent
    await api.post(`/api/agents/${AGENT_ID}/stop`).catch(() => {})
    await api.delete(`/api/agents/${AGENT_ID}`).catch(() => {})

    await api.post('/api/agents', {
      id: AGENT_ID,
      name: 'Ingestion Test Agent',
      emoji: '📡',
      model: 'anthropic/claude-haiku-4-5',
      toolsProfile: 'minimal',
      allowAgents: [],
      limits: { maxRamMb: 50, maxTokensPerHour: 1000, maxConcurrentTasks: 2 },
    })

    // Start agent
    await api.post(`/api/agents/${AGENT_ID}/start`)
    await waitUntil(
      async () => {
        const { agent } = await api.get<{ agent: Agent }>(`/api/agents/${AGENT_ID}`)
        return agent.status === 'running'
      },
      15_000,
    )
  })

  test.beforeEach(async () => {
    wsCollector = new WsEventCollector()
    await wsCollector.waitConnected()
  })

  test.afterEach(() => {
    wsCollector.close()
  })

  test.afterAll(async () => {
    await api.post(`/api/agents/${AGENT_ID}/stop`).catch(() => {})
    await sleep(500)
    await api.delete(`/api/agents/${AGENT_ID}`).catch(() => {})
  })

  // ── Feature: Task dispatch via API ──

  test('POST /api/tasks → task dispatched, runId returned', async () => {
    const result = await api.post<{ ok: boolean; runId: string }>('/api/tasks', {
      targetType: 'agent',
      targetId: AGENT_ID,
      prompt: 'Say hello',
    })

    expect(result.ok).toBe(true)
    expect(result.runId).toBeDefined()
    expect(result.runId).toMatch(/^task-/)
  })

  // ── Feature: Frontend receives user prompt event via WS ──

  test('task dispatch → frontend WS nhận user prompt event', async () => {
    await api.post('/api/tasks', {
      targetType: 'agent',
      targetId: AGENT_ID,
      prompt: 'BDD test prompt for WS',
    })

    // Wait for WS event
    const event = await wsCollector.waitFor(
      (e: { type: string; payload?: Record<string, unknown>; agentId?: string }) =>
        e.type === 'session.message' &&
        (e.payload as Record<string, unknown>)?.role === 'user',
      5_000,
    )

    expect(event).toBeDefined()
    expect(event.agentId).toBe(AGENT_ID)
    expect(event.payload).toHaveProperty('content')
  })

  // ── Feature: Task runs visible in DB ──

  test('GET /api/tasks → task runs listed', async () => {
    const { runs } = await api.get<{ runs: Array<{ targetId: string; status: string; prompt: string }> }>(
      '/api/tasks?limit=10',
    )

    const agentRuns = runs.filter(r => r.targetId === AGENT_ID)
    expect(agentRuns.length).toBeGreaterThan(0)
  })

  // ── Feature: Task dispatch fails when agent offline ──

  test('task dispatch khi agent offline → trả lỗi', async () => {
    // Stop agent
    await api.post(`/api/agents/${AGENT_ID}/stop`)
    await waitUntil(
      async () => {
        const { agent } = await api.get<{ agent: Agent }>(`/api/agents/${AGENT_ID}`)
        return agent.status === 'stopped'
      },
      10_000,
    )

    // Try to dispatch
    await expect(
      api.post('/api/tasks', {
        targetType: 'agent',
        targetId: AGENT_ID,
        prompt: 'Should fail',
      }),
    ).rejects.toThrow(/409|502/)

    // Restart for other tests
    await api.post(`/api/agents/${AGENT_ID}/start`)
    await waitUntil(
      async () => {
        const { agent } = await api.get<{ agent: Agent }>(`/api/agents/${AGENT_ID}`)
        return agent.status === 'running'
      },
      15_000,
    )
  })
})
