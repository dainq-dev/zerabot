import { z } from "zod"
import {
  getAllAgents, getAgentById, upsertAgent, deleteAgent,
  getNextAgentPort, getAgentPort,
} from "../db/queries"
import { syncAgentConfig } from "../services/agent-sync"
import { startAgent, stopAgent, isAgentRunning, getAgentEntry, getAgentStatus, getAllRunningAgents } from "../services/process-manager"
import { createLogger } from "../utils/logger"

const log = createLogger("Agents")

const AgentCreateSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  emoji: z.string().optional(),
  model: z.string().min(1),
  soul: z.string().optional(),
  mission: z.string().optional(),
  instructions: z.string().optional(),
  toolsProfile: z.enum(["minimal", "standard", "full", "custom", "coding", "messaging"]).default("minimal"),
  toolsAllow: z.array(z.string()).default([]),
  toolsDeny: z.array(z.string()).default([]),
  allowAgents: z.array(z.string()).default([]),
  mcpServers: z.array(z.string()).default([]),
  limits: z.object({
    maxRamMb: z.number().default(50),
    maxTokensPerHour: z.number().default(3000),
    maxConcurrentTasks: z.number().default(2),
  }).default({}),
  enabled: z.boolean().default(true),
})

export async function handleAgents(req: Request, url: URL): Promise<Response> {
  const parts = url.pathname.replace("/api/agents", "").split("/").filter(Boolean)
  const id = parts[0]
  const action = parts[1]

  // GET /api/agents
  if (req.method === "GET" && !id) {
    const dbAgents = getAllAgents()
    const agents = await Promise.all(dbAgents.map(async (a) => {
      const entry = getAgentEntry(a.id)
      const status = entry ? await getAgentStatus(a.id) : "stopped"
      return { ...a, status, port: entry?.port ?? getAgentPort(a.id) }
    }))
    return json({ agents })
  }

  // POST /api/agents — create
  if (req.method === "POST" && !id) {
    const body = await req.json().catch(() => null)
    const parsed = AgentCreateSchema.safeParse(body)
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400)

    const port = getNextAgentPort()
    const now = Date.now()
    const agent = { ...parsed.data, createdAt: now, updatedAt: now, port }
    upsertAgent(agent)
    syncAgentConfig(agent).catch(err =>
      log.error("Failed to sync agent config", { agentId: agent.id, err: err?.message })
    )
    return json({ agent }, 201)
  }

  // GET /api/agents/tokens — dev: all running agents with connection info
  if (req.method === "GET" && id === "tokens" && !action) {
    const running = getAllRunningAgents()
    const all = getAllAgents()
    const agentMap = new Map(all.map(a => [a.id, a]))
    const result = running.map(entry => {
      const agent = agentMap.get(entry.agentId)
      return {
        agentId:  entry.agentId,
        name:     agent?.name  ?? entry.agentId,
        emoji:    agent?.emoji ?? null,
        port:     entry.port,
        token:    entry.token,
        pairCode: entry.pairCode ?? null,
      }
    })
    return json({ agents: result })
  }

  // GET /api/agents/:id
  if (req.method === "GET" && id && !action) {
    const agent = getAgentById(id)
    if (!agent) return json({ error: "Not found" }, 404)
    const status = await getAgentStatus(id)
    const port = getAgentPort(id)
    return json({ agent: { ...agent, status, port } })
  }

  // PATCH /api/agents/:id — update
  if (req.method === "PATCH" && id && !action) {
    const existing = getAgentById(id)
    if (!existing) return json({ error: "Not found" }, 404)
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const updated = { ...existing, ...(body ?? {}), updatedAt: Date.now() }
    upsertAgent(updated)
    syncAgentConfig(updated).catch(err =>
      log.error("Failed to sync agent config", { agentId: id, err: err?.message })
    )
    return json({ agent: updated })
  }

  // DELETE /api/agents/:id
  if (req.method === "DELETE" && id && !action) {
    if (isAgentRunning(id)) stopAgent(id)
    deleteAgent(id)
    return json({ ok: true })
  }

  // POST /api/agents/:id/start
  if (req.method === "POST" && id && action === "start") {
    const agent = getAgentById(id)
    if (!agent) return json({ error: "Agent not found" }, 404)

    if (isAgentRunning(id)) return json({ ok: true, message: "Already running" })

    const existingPort = getAgentPort(id)
    const port = existingPort ?? getNextAgentPort()
    if (!existingPort) upsertAgent({ ...agent, port, updatedAt: Date.now() })

    log.info("Starting agent", { agentId: id, port })
    startAgent({ ...agent, port }).catch(err =>
      log.error("Agent start failed", { agentId: id, err: err?.message })
    )
    return json({ ok: true, message: "Starting…", port })
  }

  // POST /api/agents/:id/stop
  if (req.method === "POST" && id && action === "stop") {
    if (!isAgentRunning(id)) return json({ ok: true, message: "Not running" })
    log.info("Stopping agent", { agentId: id })
    stopAgent(id)
    return json({ ok: true })
  }

  // GET /api/agents/:id/token — return the bearer token + pair code for direct ZeroClaw access
  if (req.method === "GET" && id && action === "token") {
    const entry = getAgentEntry(id)
    if (!entry) return json({ error: "Agent not running" }, 409)
    return json({ token: entry.token, port: entry.port, pairCode: entry.pairCode ?? null })
  }

  // POST /api/agents/:id/pair-code — deprecated (OpenClaw uses config-based pairing)
  if (req.method === "POST" && id && action === "pair-code") {
    return json({ error: "Pair codes not needed with OpenClaw" }, 410)
  }

  // POST /api/agents/:id/restart
  if (req.method === "POST" && id && action === "restart") {
    const agent = getAgentById(id)
    if (!agent) return json({ error: "Agent not found" }, 404)
    if (isAgentRunning(id)) stopAgent(id)
    const port = getAgentPort(id) ?? getNextAgentPort()
    log.info("Restarting agent", { agentId: id, port })
    startAgent({ ...agent, port }).catch(err =>
      log.error("Agent restart failed", { agentId: id, err: err?.message })
    )
    return json({ ok: true, message: "Restarting…" })
  }

  return json({ error: "Not found" }, 404)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
