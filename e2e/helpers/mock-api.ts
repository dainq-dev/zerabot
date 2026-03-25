import type { Page } from '@playwright/test'
import { MOCK_AGENTS } from '../fixtures/agents'
import { MOCK_CRON_JOBS, MOCK_CRON_RUNS } from '../fixtures/cron'
import { MOCK_PIPELINES, MOCK_PIPELINE_WITH_NODES } from '../fixtures/pipelines'
import { MOCK_MCP_SERVERS } from '../fixtures/mcp'
import { MOCK_CHANNELS } from '../fixtures/channels'
import { MOCK_TOKEN_METRICS_MULTI } from '../fixtures/metrics'

// ─── Agents ───────────────────────────────────────────────────────────────────

export async function mockAgentsApi(page: Page) {
  await page.route('**/api/agents', (route, req) => {
    if (req.method() === 'GET')
      return route.fulfill({ json: { agents: MOCK_AGENTS } })
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      return route.fulfill({
        status: 201,
        json: { agent: { ...body, createdAt: Date.now(), updatedAt: Date.now(), status: 'stopped' } },
      })
    }
    return route.continue()
  })

  await page.route('**/api/agents/**', (route, req) => {
    const segments = req.url().split('/api/agents/')[1]?.split('/') ?? []
    const id = segments[0]
    const action = segments[1]

    if (req.method() === 'GET' && !action) {
      const agent = MOCK_AGENTS.find(a => a.id === id)
      return agent
        ? route.fulfill({ json: { agent } })
        : route.fulfill({ status: 404, json: { error: 'Not found' } })
    }
    if (req.method() === 'PATCH' && !action) {
      const body = req.postDataJSON() as Record<string, unknown>
      const agent = MOCK_AGENTS.find(a => a.id === id) ?? MOCK_AGENTS[0]
      return route.fulfill({ json: { agent: { ...agent, ...body, updatedAt: Date.now() } } })
    }
    if (req.method() === 'DELETE')
      return route.fulfill({ json: { ok: true } })
    if (req.method() === 'POST') {
      // actions: start/stop/pause/resume/restart + limits
      const statusMap: Record<string, string> = {
        start: 'running', stop: 'stopped', pause: 'paused',
        resume: 'running', restart: 'running',
      }
      return route.fulfill({ json: { ok: true, status: statusMap[action] ?? 'stopped' } })
    }
    return route.continue()
  })
}

export async function mockAgentsApiEmpty(page: Page) {
  await page.route('**/api/agents', route => route.fulfill({ json: { agents: [] } }))
  await page.route('**/api/agents/**', route => route.fulfill({ status: 404, json: { error: 'Not found' } }))
}

// ─── Cron ─────────────────────────────────────────────────────────────────────

export async function mockCronApi(page: Page) {
  await page.route('**/api/cron', (route, req) => {
    if (req.method() === 'GET')
      return route.fulfill({ json: { jobs: MOCK_CRON_JOBS } })
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      return route.fulfill({
        status: 201,
        json: { job: { id: `cron-${Date.now()}`, ...body, status: 'active', createdAt: Date.now(), updatedAt: Date.now() } },
      })
    }
    return route.continue()
  })

  await page.route('**/api/cron/**', (route, req) => {
    const url = req.url()
    if (url.includes('/runs') && req.method() === 'GET')
      return route.fulfill({ json: { runs: MOCK_CRON_RUNS } })
    if (req.method() === 'POST')
      return route.fulfill({ json: { ok: true } })
    if (req.method() === 'DELETE')
      return route.fulfill({ json: { ok: true } })
    return route.continue()
  })
}

// ─── Pipelines ────────────────────────────────────────────────────────────────

export async function mockPipelinesApi(page: Page) {
  await page.route('**/api/pipelines', (route, req) => {
    if (req.method() === 'GET')
      return route.fulfill({ json: { pipelines: MOCK_PIPELINES } })
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      return route.fulfill({
        status: 201,
        json: { pipeline: { id: `pipe-${Date.now()}`, nodes: [], edges: [], status: 'draft', enabled: true, createdAt: Date.now(), updatedAt: Date.now(), ...body } },
      })
    }
    return route.continue()
  })

  await page.route('**/api/pipelines/**', (route, req) => {
    if (req.method() === 'PATCH')
      return route.fulfill({ json: { pipeline: { ...MOCK_PIPELINES[0], ...req.postDataJSON(), updatedAt: Date.now() } } })
    if (req.method() === 'DELETE')
      return route.fulfill({ json: { ok: true } })
    if (req.method() === 'POST')
      return route.fulfill({ json: { ok: true, runId: `run-${Date.now()}` } })
    return route.continue()
  })
}

export async function mockPipelineEditorApi(page: Page) {
  await page.route('**/api/pipelines', (route, req) => {
    if (req.method() === 'GET')
      return route.fulfill({ json: { pipelines: [MOCK_PIPELINE_WITH_NODES] } })
    return route.continue()
  })

  await page.route('**/api/pipelines/**', (route, req) => {
    if (req.method() === 'PATCH')
      return route.fulfill({ json: { pipeline: { ...MOCK_PIPELINE_WITH_NODES, ...req.postDataJSON(), updatedAt: Date.now() } } })
    if (req.method() === 'POST')
      return route.fulfill({ json: { ok: true } })
    return route.continue()
  })
}

// ─── Events & Metrics ─────────────────────────────────────────────────────────

export async function mockEventsApi(page: Page) {
  await page.route('**/api/events', route => route.fulfill({ json: { events: [] } }))
  await page.route('**/api/metrics/tokens', route =>
    route.fulfill({ json: { data: MOCK_TOKEN_METRICS_MULTI } }),
  )
}

// ─── MCP ──────────────────────────────────────────────────────────────────────

export async function mockMcpApi(page: Page) {
  await page.route('**/api/mcp', (route, req) => {
    if (req.method() === 'GET')
      return route.fulfill({ json: { servers: MOCK_MCP_SERVERS } })
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>
      return route.fulfill({
        status: 201,
        json: { server: { id: `mcp-${Date.now()}`, assignedAgents: [], autoConnect: true, reconnectMs: 3000, createdAt: Date.now(), updatedAt: Date.now(), ...body } },
      })
    }
    return route.continue()
  })

  await page.route('**/api/mcp/**', (route, req) => {
    if (req.method() === 'PATCH')
      return route.fulfill({ json: { server: MOCK_MCP_SERVERS[0] } })
    if (req.method() === 'DELETE')
      return route.fulfill({ json: { ok: true } })
    if (req.method() === 'POST')
      // discover
      return route.fulfill({ json: { tools: MOCK_MCP_SERVERS[0].tools ?? [] } })
    return route.continue()
  })
}

// ─── Channels ─────────────────────────────────────────────────────────────────

export async function mockChannelsApi(page: Page) {
  await page.route('**/api/channels', route =>
    route.fulfill({ json: { channels: MOCK_CHANNELS } }),
  )

  await page.route('**/api/channels/**', (route, req) => {
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON() as Record<string, unknown>
      const id = req.url().split('/api/channels/')[1]?.split('/')[0]
      const ch = MOCK_CHANNELS.find(c => c.id === id) ?? MOCK_CHANNELS[0]
      return route.fulfill({ json: { channel: { ...ch, ...body, updatedAt: Date.now() } } })
    }
    if (req.method() === 'POST')
      // test connection
      return route.fulfill({ json: { ok: true, message: 'Connection successful' } })
    return route.continue()
  })
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function mockConfigApi(page: Page) {
  const MOCK_CONFIG = {
    server: { host: '0.0.0.0', port: 18789, logLevel: 'info' },
    gateway: { token: 'test-token' },
    limits: { globalMaxTokensPerHour: 50000 },
  }

  await page.route('**/api/config', (route, req) => {
    if (req.method() === 'GET')
      return route.fulfill({ json: { config: MOCK_CONFIG } })
    if (req.method() === 'PATCH')
      return route.fulfill({ json: { config: { ...MOCK_CONFIG, ...req.postDataJSON() } } })
    return route.continue()
  })

  await page.route('**/api/health', route =>
    route.fulfill({
      json: {
        bridge: 'ok',
        zeroclaw: { ok: true, version: '0.9.1', uptime: 3600 },
      },
    }),
  )
}
