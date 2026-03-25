/**
 * BDD Tests: OpenClaw Gateway Client
 *
 * Sprint 1 — viết trước khi implement.
 * Tests client.ts: health check, send task, gateway status.
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'
import { waitUntil, sleep } from './helpers/wait-utils'
import { setupTestAgents, teardownTestAgents, getAgentStatus } from './helpers/setup'
import type { Agent } from '@zerobot/shared'

test.describe('OpenClaw Gateway Client (BDD)', () => {
  test.beforeAll(setupTestAgents)
  test.afterAll(teardownTestAgents)

  // ── Feature: Health check gateway ──

  test('GET /api/health → trả status ok khi server chạy', async () => {
    const res = await api.get<{ status: string }>('/api/health')
    expect(res.status).toBe('ok')
  })

  // ── Feature: Agent start → gateway process chạy ──

  test('start agent → status chuyển sang running', async () => {
    await api.post('/api/agents/test-isolated/start')

    await waitUntil(
      async () => (await getAgentStatus('test-isolated')) === 'running',
      15_000,
    )

    expect(await getAgentStatus('test-isolated')).toBe('running')
  })

  // ── Feature: Send task tới agent ──

  test('POST /api/tasks → dispatch task thành công', async () => {
    // Ensure agent is running
    await waitUntil(
      async () => (await getAgentStatus('test-isolated')) === 'running',
      10_000,
    )

    const result = await api.post<{ ok: boolean; runId?: string }>('/api/tasks', {
      targetType: 'agent',
      targetId: 'test-isolated',
      prompt: 'Echo test: respond with "hello"',
    })

    expect(result.ok).toBe(true)
    expect(result.runId).toBeDefined()
  })

  // ── Feature: Task runs tracked in DB ──

  test('GET /api/tasks → task run visible', async () => {
    await sleep(500) // brief wait for DB write

    const { runs } = await api.get<{ runs: Array<{ targetId: string; status: string }> }>(
      '/api/tasks?limit=5',
    )

    const latest = runs.find(r => r.targetId === 'test-isolated')
    expect(latest).toBeDefined()
    expect(['dispatched', 'running', 'done']).toContain(latest!.status)
  })

  // ── Feature: Stop agent ──

  test('stop agent → status chuyển sang stopped', async () => {
    await api.post('/api/agents/test-isolated/stop')

    await waitUntil(
      async () => (await getAgentStatus('test-isolated')) === 'stopped',
      10_000,
    )

    expect(await getAgentStatus('test-isolated')).toBe('stopped')
  })

  // ── Feature: Send task khi agent offline → error ──

  test('POST /api/tasks khi agent stopped → trả lỗi', async () => {
    await expect(
      api.post('/api/tasks', {
        targetType: 'agent',
        targetId: 'test-isolated',
        prompt: 'Should fail',
      }),
    ).rejects.toThrow(/409|502/)
  })
})
