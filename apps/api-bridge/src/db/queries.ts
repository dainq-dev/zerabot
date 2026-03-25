import { db } from "./index"
import type { Agent, CronRun, ZerabotEvent, McpServerConfig, Channel, Pipeline } from "@zerobot/shared"

// ── AGENTS ──────────────────────────────────────────────────────────────────
export function getAllAgents(): Agent[] {
  const rows = db.query("SELECT * FROM agents ORDER BY created_at ASC").all() as Record<string, unknown>[]
  return rows.map(rowToAgent)
}

export function getNextAgentPort(): number {
  const PORT_BASE = 43000
  const row = db.query("SELECT MAX(port) as max_port FROM agents").get() as { max_port: number | null }
  return (row.max_port ?? PORT_BASE - 1) + 1
}

export function getAgentPort(id: string): number | null {
  const row = db.query("SELECT port FROM agents WHERE id = ?").get(id) as { port: number | null } | null
  return row?.port ?? null
}

export function getAgentById(id: string): Agent | null {
  const row = db.query("SELECT * FROM agents WHERE id = ?").get(id) as Record<string, unknown> | null
  return row ? rowToAgent(row) : null
}

export function upsertAgent(agent: Agent & { port?: number }): void {
  db.query(`
    INSERT INTO agents (id, name, emoji, model, soul, mission, instructions,
      tools_profile, tools_allow, tools_deny, allow_agents, mcp_servers,
      max_ram_mb, max_tokens_per_hour, max_concurrent_tasks, enabled, port, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, emoji = excluded.emoji, model = excluded.model,
      soul = excluded.soul, mission = excluded.mission, instructions = excluded.instructions,
      tools_profile = excluded.tools_profile, tools_allow = excluded.tools_allow,
      tools_deny = excluded.tools_deny, allow_agents = excluded.allow_agents,
      mcp_servers = excluded.mcp_servers, max_ram_mb = excluded.max_ram_mb,
      max_tokens_per_hour = excluded.max_tokens_per_hour,
      max_concurrent_tasks = excluded.max_concurrent_tasks,
      enabled = excluded.enabled,
      port = COALESCE(excluded.port, agents.port),
      updated_at = excluded.updated_at
  `).run(
    agent.id, agent.name, agent.emoji ?? null, agent.model,
    agent.soul ?? null, agent.mission ?? null, agent.instructions ?? null,
    agent.toolsProfile, JSON.stringify(agent.toolsAllow),
    JSON.stringify(agent.toolsDeny), JSON.stringify(agent.allowAgents),
    JSON.stringify(agent.mcpServers), agent.limits.maxRamMb,
    agent.limits.maxTokensPerHour, agent.limits.maxConcurrentTasks,
    agent.enabled ? 1 : 0, agent.port ?? null, agent.createdAt, agent.updatedAt
  )
}

export function deleteAgent(id: string): void {
  db.query("DELETE FROM agents WHERE id = ?").run(id)
}

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    name: row.name as string,
    emoji: row.emoji as string | undefined,
    model: row.model as string,
    soul: row.soul as string | undefined,
    mission: row.mission as string | undefined,
    instructions: row.instructions as string | undefined,
    toolsProfile: (row.tools_profile as Agent["toolsProfile"]) ?? "minimal",
    toolsAllow: JSON.parse((row.tools_allow as string) || "[]"),
    toolsDeny: JSON.parse((row.tools_deny as string) || "[]"),
    allowAgents: JSON.parse((row.allow_agents as string) || "[]"),
    mcpServers: JSON.parse((row.mcp_servers as string) || "[]"),
    limits: {
      maxRamMb: (row.max_ram_mb as number) ?? 50,
      maxTokensPerHour: (row.max_tokens_per_hour as number) ?? 3000,
      maxConcurrentTasks: (row.max_concurrent_tasks as number) ?? 2,
    },
    enabled: (row.enabled as number) === 1,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }
}

// ── CRON JOBS ────────────────────────────────────────────────────────────────
export function getAllCronJobs(): import("@zerobot/shared").CronJob[] {
  const rows = db.query("SELECT * FROM cron_jobs ORDER BY created_at ASC").all() as Record<string, unknown>[]
  return rows.map(rowToCronJob)
}

export function getCronJobById(id: string): import("@zerobot/shared").CronJob | null {
  const row = db.query("SELECT * FROM cron_jobs WHERE id = ?").get(id) as Record<string, unknown> | null
  return row ? rowToCronJob(row) : null
}

export function upsertCronJob(job: import("@zerobot/shared").CronJob): void {
  db.query(`
    INSERT INTO cron_jobs (id, name, schedule, agent_id, task, notify_channel, enabled, status,
      last_run_at, last_run_status, next_run_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, schedule = excluded.schedule, agent_id = excluded.agent_id,
      task = excluded.task, notify_channel = excluded.notify_channel, enabled = excluded.enabled,
      status = excluded.status, last_run_at = excluded.last_run_at,
      last_run_status = excluded.last_run_status, next_run_at = excluded.next_run_at,
      updated_at = excluded.updated_at
  `).run(
    job.id, job.name, job.schedule, job.agentId, job.task,
    job.notifyChannel ?? null, job.enabled ? 1 : 0, job.status,
    job.lastRunAt ?? null, job.lastRunStatus ?? null, job.nextRunAt ?? null,
    job.createdAt, job.updatedAt
  )
}

export function deleteCronJob(id: string): void {
  db.query("DELETE FROM cron_jobs WHERE id = ?").run(id)
}

function rowToCronJob(row: Record<string, unknown>): import("@zerobot/shared").CronJob {
  return {
    id: row.id as string,
    name: row.name as string,
    schedule: row.schedule as string,
    agentId: row.agent_id as string,
    task: row.task as string,
    notifyChannel: row.notify_channel as string | undefined,
    enabled: (row.enabled as number) === 1,
    status: (row.status as import("@zerobot/shared").CronJobStatus) ?? "active",
    lastRunAt: row.last_run_at as number | undefined,
    lastRunStatus: row.last_run_status as import("@zerobot/shared").CronRunStatus | undefined,
    nextRunAt: row.next_run_at as number | undefined,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }
}

// ── EVENTS ───────────────────────────────────────────────────────────────────
export function insertEvent(event: ZerabotEvent): void {
  db.query(`
    INSERT INTO events (id, ts, agent_id, pipeline_id, type, severity, payload, token_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id, event.ts, event.agentId ?? null, event.pipelineId ?? null,
    event.type, event.severity, JSON.stringify(event.payload), event.tokenUsed
  )
}

export function getRecentEvents(limit = 200, agentId?: string, type?: string, since?: number): ZerabotEvent[] {
  let sql = "SELECT * FROM events"
  const params: unknown[] = []
  const conditions: string[] = []

  if (agentId) { conditions.push("agent_id = ?"); params.push(agentId) }
  if (type) { conditions.push("type = ?"); params.push(type) }
  if (since) { conditions.push("ts >= ?"); params.push(since) }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ")
  sql += " ORDER BY ts DESC LIMIT ?"
  params.push(limit)

  const rows = db.query(sql).all(...params) as Record<string, unknown>[]
  return rows.map(r => ({
    id: r.id as string,
    ts: r.ts as number,
    agentId: r.agent_id as string | undefined,
    pipelineId: r.pipeline_id as string | undefined,
    type: r.type as ZerabotEvent["type"],
    severity: (r.severity as ZerabotEvent["severity"]) ?? "info",
    payload: JSON.parse((r.payload as string) || "{}"),
    tokenUsed: (r.token_used as number) ?? 0,
  }))
}

// ── CRON RUNS ────────────────────────────────────────────────────────────────
export function insertCronRun(run: CronRun): void {
  db.query(`
    INSERT INTO cron_runs (id, job_id, job_name, agent_id, started_at, finished_at, status, output, token_used, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id, run.jobId, run.jobName, run.agentId ?? null,
    run.startedAt, run.finishedAt ?? null, run.status,
    run.output ?? null, run.tokenUsed, run.error ?? null
  )
}

export function getCronRunsByJob(jobId: string, limit = 50): CronRun[] {
  const rows = db.query(
    "SELECT * FROM cron_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?"
  ).all(jobId, limit) as Record<string, unknown>[]
  return rows.map(r => ({
    id: r.id as string,
    jobId: r.job_id as string,
    jobName: r.job_name as string,
    agentId: r.agent_id as string | undefined,
    startedAt: r.started_at as number,
    finishedAt: r.finished_at as number | undefined,
    status: r.status as CronRun["status"],
    output: r.output as string | undefined,
    tokenUsed: (r.token_used as number) ?? 0,
    error: r.error as string | undefined,
  }))
}

// ── TASK RUNS ────────────────────────────────────────────────────────────────

export interface TaskRun {
  id: string
  targetType: "agent" | "pipeline"
  targetId: string
  targetName?: string
  agentId?: string        // NEW
  prompt: string
  status: "dispatched" | "running" | "done" | "error"
  startedAt: number
  finishedAt?: number     // NEW
  tokenUsed: number
  error?: string          // NEW
}

export function insertTaskRun(run: TaskRun): void {
  db.query(`
    INSERT INTO task_runs (id, target_type, target_id, target_name, agent_id, prompt, status, started_at, token_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(run.id, run.targetType, run.targetId, run.targetName ?? null, run.agentId ?? null, run.prompt, run.status, run.startedAt, run.tokenUsed)
}

export function getRecentTaskRuns(limit = 100): TaskRun[] {
  const rows = db.query(
    "SELECT * FROM task_runs ORDER BY started_at DESC LIMIT ?"
  ).all(limit) as Record<string, unknown>[]
  return rows.map(rowToTaskRun)
}

export function deleteTaskRun(id: string): void {
  db.query("DELETE FROM task_runs WHERE id = ?").run(id)
}

export function updateTaskRunById(
  id: string,
  fields: { status?: TaskRun["status"]; finishedAt?: number; tokenUsed?: number; error?: string }
): void {
  const sets: string[] = []
  const params: unknown[] = []
  if (fields.status !== undefined)     { sets.push("status = ?");      params.push(fields.status) }
  if (fields.finishedAt !== undefined) { sets.push("finished_at = ?"); params.push(fields.finishedAt) }
  if (fields.tokenUsed !== undefined)  { sets.push("token_used = ?");  params.push(fields.tokenUsed) }
  if (fields.error !== undefined)      { sets.push("error = ?");       params.push(fields.error) }
  if (!sets.length) return
  params.push(id)
  db.query(`UPDATE task_runs SET ${sets.join(", ")} WHERE id = ?`).run(...params)
}

export function getActiveTaskForAgent(agentId: string): TaskRun | null {
  const row = db.query(`
    SELECT * FROM task_runs
    WHERE agent_id = ? AND status IN ('dispatched', 'running')
    ORDER BY started_at DESC LIMIT 1
  `).get(agentId) as Record<string, unknown> | null
  return row ? rowToTaskRun(row) : null
}

function rowToTaskRun(r: Record<string, unknown>): TaskRun {
  return {
    id: r.id as string,
    targetType: r.target_type as TaskRun["targetType"],
    targetId: r.target_id as string,
    targetName: r.target_name as string | undefined,
    agentId: r.agent_id as string | undefined,
    prompt: r.prompt as string,
    status: r.status as TaskRun["status"],
    startedAt: r.started_at as number,
    finishedAt: r.finished_at as number | undefined,
    tokenUsed: (r.token_used as number) ?? 0,
    error: r.error as string | undefined,
  }
}

// ── TOKEN USAGE ──────────────────────────────────────────────────────────────
export function upsertTokenUsage(hour: number, agentId: string, model: string, input: number, output: number): void {
  db.query(`
    INSERT INTO token_usage (hour, agent_id, model, input_tokens, output_tokens)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(hour, agent_id, model) DO UPDATE SET
      input_tokens = input_tokens + excluded.input_tokens,
      output_tokens = output_tokens + excluded.output_tokens
  `).run(hour, agentId, model, input, output)
}

export function getTokenUsage(agentId?: string, since?: number): { hour: number; agentId: string; model: string; inputTokens: number; outputTokens: number }[] {
  let sql = "SELECT * FROM token_usage"
  const params: unknown[] = []
  const conditions: string[] = []
  if (agentId) { conditions.push("agent_id = ?"); params.push(agentId) }
  if (since) { conditions.push("hour >= ?"); params.push(since) }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ")
  sql += " ORDER BY hour DESC LIMIT 168"  // 7 days of hourly data

  const rows = db.query(sql).all(...params) as Record<string, unknown>[]
  return rows.map(r => ({
    hour: r.hour as number,
    agentId: r.agent_id as string,
    model: r.model as string,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
  }))
}

// ── MCP SERVERS ──────────────────────────────────────────────────────────────
export function getAllMcpServers(): McpServerConfig[] {
  const rows = db.query("SELECT * FROM mcp_servers ORDER BY created_at ASC").all() as Record<string, unknown>[]
  return rows.map(rowToMcp)
}

export function upsertMcpServer(server: McpServerConfig): void {
  const config: Record<string, unknown> = {}
  if (server.command) config.command = server.command
  if (server.args) config.args = server.args
  if (server.env) config.env = server.env
  if (server.url) config.url = server.url
  if (server.authToken) config.authToken = server.authToken
  if (server.endpoint) config.endpoint = server.endpoint

  db.query(`
    INSERT INTO mcp_servers (id, name, description, transport, config, assigned_agents, auto_connect, reconnect_ms, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, description = excluded.description,
      transport = excluded.transport, config = excluded.config,
      assigned_agents = excluded.assigned_agents, auto_connect = excluded.auto_connect,
      reconnect_ms = excluded.reconnect_ms, updated_at = excluded.updated_at
  `).run(
    server.id, server.name, server.description,
    server.transport, JSON.stringify(config),
    JSON.stringify(server.assignedAgents),
    server.autoConnect ? 1 : 0, server.reconnectMs,
    server.createdAt, server.updatedAt
  )
}

export function deleteMcpServer(id: string): void {
  db.query("DELETE FROM mcp_servers WHERE id = ?").run(id)
}

function rowToMcp(row: Record<string, unknown>): McpServerConfig {
  const config = JSON.parse((row.config as string) || "{}") as Record<string, unknown>
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    transport: row.transport as McpServerConfig["transport"],
    command: config.command as string | undefined,
    args: config.args as string[] | undefined,
    env: config.env as Record<string, string> | undefined,
    url: config.url as string | undefined,
    authToken: config.authToken as string | undefined,
    endpoint: config.endpoint as string | undefined,
    assignedAgents: JSON.parse((row.assigned_agents as string) || "[]"),
    autoConnect: (row.auto_connect as number) === 1,
    reconnectMs: (row.reconnect_ms as number) ?? 3000,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }
}

// ── CHANNELS ─────────────────────────────────────────────────────────────────
export function getAllChannels(): Channel[] {
  const rows = db.query("SELECT * FROM channels ORDER BY id ASC").all() as Record<string, unknown>[]
  return rows.map(r => ({
    id: r.id as Channel["id"],
    name: r.name as string,
    config: JSON.parse((r.config as string) || "{}"),
    routing: JSON.parse((r.routing as string) || "[]"),
    enabled: (r.enabled as number) === 1,
    lastTestedAt: r.last_tested_at as number | undefined,
    updatedAt: r.updated_at as number,
  }))
}

export function upsertChannel(channel: Channel): void {
  db.query(`
    INSERT INTO channels (id, name, config, routing, enabled, last_tested_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, config = excluded.config, routing = excluded.routing,
      enabled = excluded.enabled, last_tested_at = excluded.last_tested_at, updated_at = excluded.updated_at
  `).run(
    channel.id, channel.name, JSON.stringify(channel.config),
    JSON.stringify(channel.routing), channel.enabled ? 1 : 0,
    channel.lastTestedAt ?? null, channel.updatedAt
  )
}

// ── PIPELINES ────────────────────────────────────────────────────────────────
export function getAllPipelines(): Pipeline[] {
  const rows = db.query("SELECT * FROM pipelines ORDER BY created_at DESC").all() as Record<string, unknown>[]
  return rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | undefined,
    nodes: JSON.parse((r.nodes as string) || "[]"),
    edges: JSON.parse((r.edges as string) || "[]"),
    trigger: {
      type: (r.trigger_type as Pipeline["trigger"]["type"]) ?? "manual",
      schedule: r.trigger_val as string | undefined,
    },
    status: (r.status as Pipeline["status"]) ?? "draft",
    enabled: (r.enabled as number) === 1,
    lastRunAt: r.last_run_at as number | undefined,
    runCount: (r.run_count as number) ?? 0,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  }))
}

export function upsertPipeline(p: Pipeline): void {
  db.query(`
    INSERT INTO pipelines (id, name, description, nodes, edges, trigger_type, trigger_val, status, enabled, last_run_at, run_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, description = excluded.description,
      nodes = excluded.nodes, edges = excluded.edges,
      trigger_type = excluded.trigger_type, trigger_val = excluded.trigger_val,
      status = excluded.status, enabled = excluded.enabled,
      last_run_at = excluded.last_run_at, run_count = excluded.run_count,
      updated_at = excluded.updated_at
  `).run(
    p.id, p.name, p.description ?? null,
    JSON.stringify(p.nodes), JSON.stringify(p.edges),
    p.trigger.type, p.trigger.schedule ?? null,
    p.status, p.enabled ? 1 : 0, p.lastRunAt ?? null,
    p.runCount ?? 0, p.createdAt, p.updatedAt
  )
}

export function deletePipeline(id: string): void {
  db.query("DELETE FROM pipelines WHERE id = ?").run(id)
}

export function getPipelineById(id: string): Pipeline | null {
  const rows = db.query("SELECT * FROM pipelines WHERE id = ?").all(id) as Record<string, unknown>[]
  if (!rows.length) return null
  const r = rows[0]!
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | undefined,
    nodes: JSON.parse((r.nodes as string) || "[]"),
    edges: JSON.parse((r.edges as string) || "[]"),
    trigger: { type: (r.trigger_type as Pipeline["trigger"]["type"]) ?? "manual", schedule: r.trigger_val as string | undefined },
    status: (r.status as Pipeline["status"]) ?? "draft",
    enabled: (r.enabled as number) === 1,
    lastRunAt: r.last_run_at as number | undefined,
    runCount: (r.run_count as number) ?? 0,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  }
}

// ── PIPELINE RUNS ─────────────────────────────────────────────────────────────

export interface PipelineRun {
  id: string
  pipelineId: string
  status: "running" | "done" | "error" | "cancelled"
  triggerType: string
  startedAt: number
  finishedAt?: number
  vars: Record<string, string>
  nodeResults: Record<string, { status: string; output?: string; error?: string }>
  error?: string
}

export function insertPipelineRun(run: PipelineRun): void {
  db.query(`
    INSERT INTO pipeline_runs (id, pipeline_id, status, trigger_type, started_at, vars, node_results)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(run.id, run.pipelineId, run.status, run.triggerType, run.startedAt,
    JSON.stringify(run.vars), JSON.stringify(run.nodeResults))
}

export function updatePipelineRun(
  id: string,
  fields: Partial<Pick<PipelineRun, "status" | "finishedAt" | "vars" | "nodeResults" | "error">>,
): void {
  const sets: string[] = []
  const params: unknown[] = []
  if (fields.status !== undefined)      { sets.push("status = ?");       params.push(fields.status) }
  if (fields.finishedAt !== undefined)  { sets.push("finished_at = ?");  params.push(fields.finishedAt) }
  if (fields.vars !== undefined)        { sets.push("vars = ?");         params.push(JSON.stringify(fields.vars)) }
  if (fields.nodeResults !== undefined) { sets.push("node_results = ?"); params.push(JSON.stringify(fields.nodeResults)) }
  if (fields.error !== undefined)       { sets.push("error = ?");        params.push(fields.error) }
  if (!sets.length) return
  params.push(id)
  db.query(`UPDATE pipeline_runs SET ${sets.join(", ")} WHERE id = ?`).run(...params)
}

export function getPipelineRuns(pipelineId: string, limit = 20): PipelineRun[] {
  const rows = db.query(
    "SELECT * FROM pipeline_runs WHERE pipeline_id = ? ORDER BY started_at DESC LIMIT ?"
  ).all(pipelineId, limit) as Record<string, unknown>[]
  return rows.map(rowToPipelineRun)
}

export function getPipelineRunById(id: string): PipelineRun | null {
  const row = db.query("SELECT * FROM pipeline_runs WHERE id = ?").get(id) as Record<string, unknown> | null
  return row ? rowToPipelineRun(row) : null
}

function rowToPipelineRun(r: Record<string, unknown>): PipelineRun {
  return {
    id: r.id as string,
    pipelineId: r.pipeline_id as string,
    status: r.status as PipelineRun["status"],
    triggerType: (r.trigger_type as string) ?? "manual",
    startedAt: r.started_at as number,
    finishedAt: r.finished_at as number | undefined,
    vars: JSON.parse((r.vars as string) || "{}"),
    nodeResults: JSON.parse((r.node_results as string) || "{}"),
    error: r.error as string | undefined,
  }
}

// ── CRAWLED ITEMS ─────────────────────────────────────────────────────────────

export interface CrawledItem {
  id: string
  source: string
  category?: string
  url?: string
  title?: string
  content?: string
  structuredData?: Record<string, unknown>
  agentId?: string
  pipelineRunId?: string
  crawledAt: number
  publishedAt?: number
  tags: string[]
}

export function insertCrawledItem(item: CrawledItem): void {
  db.query(`
    INSERT OR IGNORE INTO crawled_items
      (id, source, category, url, title, content, structured_data, agent_id, pipeline_run_id, crawled_at, published_at, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    item.id, item.source, item.category ?? null, item.url ?? null,
    item.title ?? null, item.content ?? null,
    item.structuredData ? JSON.stringify(item.structuredData) : null,
    item.agentId ?? null, item.pipelineRunId ?? null,
    item.crawledAt, item.publishedAt ?? null,
    JSON.stringify(item.tags),
  )
}

export function getCrawledItems(params: {
  source?: string
  category?: string
  from?: number
  to?: number
  limit?: number
  offset?: number
}): CrawledItem[] {
  let sql = "SELECT * FROM crawled_items"
  const conditions: string[] = []
  const args: unknown[] = []

  if (params.source)   { conditions.push("source = ?");        args.push(params.source) }
  if (params.category) { conditions.push("category = ?");      args.push(params.category) }
  if (params.from)     { conditions.push("crawled_at >= ?");   args.push(params.from) }
  if (params.to)       { conditions.push("crawled_at <= ?");   args.push(params.to) }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ")
  sql += " ORDER BY crawled_at DESC"
  sql += ` LIMIT ${params.limit ?? 100} OFFSET ${params.offset ?? 0}`

  return (db.query(sql).all(...args) as Record<string, unknown>[]).map(rowToCrawledItem)
}

export function getCrawledSourceStats(): { source: string; count: number; lastCrawledAt: number }[] {
  const rows = db.query(`
    SELECT source, COUNT(*) as count, MAX(crawled_at) as last_crawled_at
    FROM crawled_items GROUP BY source ORDER BY count DESC
  `).all() as Record<string, unknown>[]
  return rows.map(r => ({
    source: r.source as string,
    count: r.count as number,
    lastCrawledAt: r.last_crawled_at as number,
  }))
}

export function deleteCrawledItem(id: string): void {
  db.query("DELETE FROM crawled_items WHERE id = ?").run(id)
}

export function deleteOldCrawledItems(olderThanMs: number): number {
  const cutoff = Date.now() - olderThanMs
  db.query("DELETE FROM crawled_items WHERE crawled_at < ?").run(cutoff)
  return (db.query("SELECT changes() as n").get() as { n: number }).n
}

function rowToCrawledItem(r: Record<string, unknown>): CrawledItem {
  return {
    id: r.id as string,
    source: r.source as string,
    category: r.category as string | undefined,
    url: r.url as string | undefined,
    title: r.title as string | undefined,
    content: r.content as string | undefined,
    structuredData: r.structured_data ? JSON.parse(r.structured_data as string) : undefined,
    agentId: r.agent_id as string | undefined,
    pipelineRunId: r.pipeline_run_id as string | undefined,
    crawledAt: r.crawled_at as number,
    publishedAt: r.published_at as number | undefined,
    tags: JSON.parse((r.tags as string) || "[]"),
  }
}
