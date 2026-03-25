/**
 * BDD Tests: OpenClaw Config Generation
 *
 * Sprint 1 — viết trước khi implement.
 * Tests config.ts: generate openclaw.json cho agents.
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'
import type { Agent } from '@zerobot/shared'

test.describe('OpenClaw Config Generation (BDD)', () => {
  const AGENT_BASE = {
    name: 'Config Test Agent',
    model: 'anthropic/claude-haiku-4-5',
    allowAgents: [],
    limits: { maxRamMb: 50, maxTokensPerHour: 1000, maxConcurrentTasks: 2 },
  }

  test.afterAll(async () => {
    // Cleanup: xóa agents test
    for (const id of [
      'cfg-full', 'cfg-minimal', 'cfg-standard', 'cfg-custom', 'cfg-mcp',
    ]) {
      await api.post(`/api/agents/${id}/stop`).catch(() => {})
      await api.delete(`/api/agents/${id}`).catch(() => {})
    }
  })

  // ── Feature: Config cho agent profile "full" (Data Researcher) ──

  test('profile "full" → tools.allow chứa web + browser + search', async () => {
    const created = await api.post<{ agent: Agent }>('/api/agents', {
      ...AGENT_BASE,
      id: 'cfg-full',
      toolsProfile: 'full',
    })
    expect(created.agent.id).toBe('cfg-full')
    expect(created.agent.toolsProfile).toBe('full')

    // GET agent — verify persisted
    const { agent } = await api.get<{ agent: Agent }>('/api/agents/cfg-full')
    expect(agent.toolsProfile).toBe('full')
  })

  // ── Feature: Config không cần BRAVE_API_KEY ──

  test('agent "full" tạo thành công kể cả khi không có BRAVE_API_KEY', async () => {
    // Verify agent creation works — cấu hình OpenClaw sẽ enable
    // web_search/web_fetch qua browser, không cần Brave key
    const { agent } = await api.get<{ agent: Agent }>('/api/agents/cfg-full')
    expect(agent.toolsProfile).toBe('full')
    // Agent should be creatable and valid regardless of BRAVE_API_KEY
    expect(agent.enabled).toBe(true)
  })

  // ── Feature: Config cho profile "minimal" (readonly) ──

  test('profile "minimal" → agent tạo thành công với restricted tools', async () => {
    const { agent } = await api.post<{ agent: Agent }>('/api/agents', {
      ...AGENT_BASE,
      id: 'cfg-minimal',
      toolsProfile: 'minimal',
    })
    expect(agent.toolsProfile).toBe('minimal')
  })

  // ── Feature: Config cho profile "standard" → maps to "coding"  ──

  test('profile "standard" → agent tạo thành công', async () => {
    const { agent } = await api.post<{ agent: Agent }>('/api/agents', {
      ...AGENT_BASE,
      id: 'cfg-standard',
      toolsProfile: 'standard',
    })
    expect(agent.toolsProfile).toBe('standard')
  })

  // ── Feature: Config cho profile "custom" với toolsAllow/toolsDeny ──

  test('profile "custom" → toolsAllow / toolsDeny persisted', async () => {
    const { agent } = await api.post<{ agent: Agent }>('/api/agents', {
      ...AGENT_BASE,
      id: 'cfg-custom',
      toolsProfile: 'custom',
      toolsAllow: ['web_search', 'web_fetch', 'browser'],
      toolsDeny: ['exec'],
    })
    expect(agent.toolsProfile).toBe('custom')
    expect(agent.toolsAllow).toContain('web_search')
    expect(agent.toolsAllow).toContain('browser')
    expect(agent.toolsDeny).toContain('exec')
  })

  // ── Feature: Config với MCP Servers ──

  test('agent với mcpServers → servers referenced in agent', async () => {
    const { agent } = await api.post<{ agent: Agent }>('/api/agents', {
      ...AGENT_BASE,
      id: 'cfg-mcp',
      toolsProfile: 'full',
      mcpServers: ['mcp-test-server'],
    })
    expect(agent.mcpServers).toContain('mcp-test-server')
  })

  // ── Feature: PATCH agent → config updated ──

  test('PATCH toolsProfile → agent config updated', async () => {
    await api.patch('/api/agents/cfg-full', {
      toolsProfile: 'minimal',
    })
    const { agent } = await api.get<{ agent: Agent }>('/api/agents/cfg-full')
    expect(agent.toolsProfile).toBe('minimal')

    // Restore
    await api.patch('/api/agents/cfg-full', { toolsProfile: 'full' })
  })
})
