const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`${method} ${path} failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

const get = <T>(path: string) => request<T>("GET", path)
const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body)
const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body)
const del = <T>(path: string) => request<T>("DELETE", path)

// ── Agents ──────────────────────────────────────────────────────────────────
import type { Agent, CronJob, CronRun, McpServerConfig, McpTool, Channel, Pipeline, PipelineRun, CrawledItem } from "@zerobot/shared"

export interface AgentDevInfo {
  agentId: string
  name: string
  emoji: string | null
  port: number
  token: string
  pairCode: string | null
}

export const agentsApi = {
  list: () => get<{ agents: Agent[] }>("/api/agents").then(r => r.agents),
  get: (id: string) => get<{ agent: Agent }>(`/api/agents/${id}`).then(r => r.agent),
  create: (data: unknown) => post<{ agent: Agent }>("/api/agents", data).then(r => r.agent),
  update: (id: string, data: unknown) => patch<{ agent: Agent }>(`/api/agents/${id}`, data).then(r => r.agent),
  delete: (id: string) => del<{ ok: boolean }>(`/api/agents/${id}`),
  action: (id: string, action: "start" | "stop" | "restart" | "pause" | "resume") =>
    post<{ ok: boolean }>(`/api/agents/${id}/${action}`),
  updateLimits: (id: string, limits: unknown) =>
    patch<{ ok: boolean }>(`/api/agents/${id}/limits`, limits),
  /** Dev only — returns running agents with their ZeroClaw connection info */
  devTokens: () => get<{ agents: AgentDevInfo[] }>("/api/agents/tokens").then(r => r.agents),
  /** Dev only — generates a fresh one-time pairing code for the given agent */
  newPairCode: (id: string) =>
    post<{ pairCode: string; port: number }>(`/api/agents/${id}/pair-code`),
}

// ── Cron ─────────────────────────────────────────────────────────────────────
export const cronApi = {
  list: () => get<{ jobs: CronJob[] }>("/api/cron").then(r => r.jobs),
  create: (data: unknown) => post<{ job: CronJob }>("/api/cron", data).then(r => r.job),
  runs: (id: string, limit = 50) => get<{ runs: CronRun[] }>(`/api/cron/${id}/runs?limit=${limit}`).then(r => r.runs),
  action: (id: string, action: "run" | "pause" | "resume") =>
    post<{ ok: boolean }>(`/api/cron/${id}/${action}`),
  delete: (id: string) => del<{ ok: boolean }>(`/api/cron/${id}`),
}

// ── Events ───────────────────────────────────────────────────────────────────
export const eventsApi = {
  list: (params?: { limit?: number; agentId?: string; type?: string; since?: number }) => {
    const qs = new URLSearchParams()
    if (params?.limit) qs.set("limit", String(params.limit))
    if (params?.agentId) qs.set("agentId", params.agentId)
    if (params?.type) qs.set("type", params.type)
    if (params?.since) qs.set("since", String(params.since))
    return get<{ events: unknown[] }>(`/api/events?${qs}`).then(r => r.events)
  },
  tokenMetrics: (params?: { agentId?: string; since?: number }) => {
    const qs = new URLSearchParams()
    if (params?.agentId) qs.set("agentId", params.agentId)
    if (params?.since) qs.set("since", String(params.since))
    return get<{ data: unknown[] }>(`/api/metrics/tokens?${qs}`).then(r => r.data)
  },
}

// ── MCP ───────────────────────────────────────────────────────────────────────
export const mcpApi = {
  list: () => get<{ servers: McpServerConfig[] }>("/api/mcp").then(r => r.servers),
  create: (data: unknown) => post<{ server: McpServerConfig }>("/api/mcp", data).then(r => r.server),
  update: (id: string, data: unknown) => patch<{ server: McpServerConfig }>(`/api/mcp/${id}`, data).then(r => r.server),
  delete: (id: string) => del<{ ok: boolean }>(`/api/mcp/${id}`),
  discover: (id: string) => post<{ tools: McpTool[]; count: number }>(`/api/mcp/${id}/discover`),
}

// ── Channels ─────────────────────────────────────────────────────────────────
export const channelsApi = {
  list: () => get<{ channels: Channel[] }>("/api/channels").then(r => r.channels),
  update: (id: string, data: unknown) => patch<{ channel: Channel }>(`/api/channels/${id}`, data).then(r => r.channel),
  test: (id: string) => post<{ ok: boolean; message: string }>(`/api/channels/${id}/test`),
}

// ── Pipelines ─────────────────────────────────────────────────────────────────
export const pipelinesApi = {
  list:   () => get<{ pipelines: Pipeline[] }>("/api/pipelines").then(r => r.pipelines),
  create: (data: unknown) => post<{ pipeline: Pipeline }>("/api/pipelines", data).then(r => r.pipeline),
  update: (id: string, data: unknown) => patch<{ pipeline: Pipeline }>(`/api/pipelines/${id}`, data).then(r => r.pipeline),
  delete: (id: string) => del<{ ok: boolean }>(`/api/pipelines/${id}`),
  run:    (id: string) => post<{ ok: boolean; runId: string }>(`/api/pipelines/${id}/run`),
  cancel: (id: string) => post<{ ok: boolean }>(`/api/pipelines/${id}/cancel`),
  runs:   (id: string, limit = 20) => get<{ runs: PipelineRun[] }>(`/api/pipelines/${id}/runs?limit=${limit}`).then(r => r.runs),
  getRun: (pipelineId: string, runId: string) => get<{ run: PipelineRun }>(`/api/pipelines/${pipelineId}/runs/${runId}`).then(r => r.run),
}

// ── Data (crawled items) ───────────────────────────────────────────────────────
export interface CrawledSourceStat {
  source: string
  count: number
  lastCrawledAt: number
}

export const dataApi = {
  ingest: (payload: {
    source: string
    category?: string
    agent_id?: string
    pipeline_run_id?: string
    items: Array<{
      url?: string
      title?: string
      content?: string
      structured_data?: Record<string, unknown>
      published_at?: number
      tags?: string[]
    }>
  }) => post<{ ok: boolean; inserted: number; skipped: number }>("/api/data/ingest", payload),

  items: (params?: {
    source?: string
    category?: string
    from?: number
    to?: number
    limit?: number
    offset?: number
  }) => {
    const qs = new URLSearchParams()
    if (params?.source)   qs.set("source",   params.source)
    if (params?.category) qs.set("category", params.category)
    if (params?.from)     qs.set("from",     String(params.from))
    if (params?.to)       qs.set("to",       String(params.to))
    if (params?.limit)    qs.set("limit",    String(params.limit))
    if (params?.offset)   qs.set("offset",   String(params.offset))
    return get<{ items: CrawledItem[]; count: number; offset: number }>(`/api/data/items?${qs}`)
  },

  sources: () => get<{ sources: CrawledSourceStat[] }>("/api/data/sources").then(r => r.sources),
  delete:  (id: string) => del<{ ok: boolean }>(`/api/data/items/${id}`),
  exportUrl: (params?: { source?: string; category?: string }) => {
    const qs = new URLSearchParams()
    if (params?.source)   qs.set("source",   params.source)
    if (params?.category) qs.set("category", params.category)
    return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/api/data/export?${qs}`
  },
}

// ── Agent Templates ────────────────────────────────────────────────────────────
export interface AgentTemplateSummary {
  id: string
  name: string
  emoji: string
  description: string
  toolsProfile: Agent["toolsProfile"]
  model: string
  tags: string[]
}

export const agentTemplatesApi = {
  list: (tag?: string) => {
    const qs = tag ? `?tag=${encodeURIComponent(tag)}` : ""
    return get<{ templates: AgentTemplateSummary[] }>(`/api/agent-templates${qs}`).then(r => r.templates)
  },
  get:    (id: string) => get<{ template: AgentTemplateSummary }>(`/api/agent-templates/${id}`).then(r => r.template),
  useTemplate: (id: string) => post<{ agent: Agent }>(`/api/agent-templates/${id}/use`).then(r => r.agent),
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
export interface TaskRun {
  id: string
  targetType: "agent" | "pipeline"
  targetId: string
  targetName?: string
  agentId?: string
  prompt: string
  status: "dispatched" | "running" | "done" | "error"
  startedAt: number
  tokenUsed: number
}

export const tasksApi = {
  list: (limit = 100) => get<{ runs: TaskRun[] }>(`/api/tasks?limit=${limit}`).then(r => r.runs),
  run: (data: { targetType: "agent" | "pipeline"; targetId: string; prompt: string }) =>
    post<{ ok: boolean; runId: string }>("/api/tasks", data),
  delete: (id: string) => del<{ ok: boolean }>(`/api/tasks/${id}`),
}

// ── Config ────────────────────────────────────────────────────────────────────
export const configApi = {
  get: () => get<{ config: Record<string, unknown> }>("/api/config").then(r => r.config),
  update: (data: unknown) => patch<{ ok: boolean }>("/api/config", data),
  health: () => get<{ bridge: string; zeroclaw: { ok: boolean; version?: string } }>("/api/health"),
}
