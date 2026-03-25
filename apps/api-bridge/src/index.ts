import "./db/index"  // Initialize DB
import { handleAgents } from "./routes/agents"
import { handleCron } from "./routes/cron"
import { handleEvents } from "./routes/events"
import { handleMcp } from "./routes/mcp"
import { handleChannels } from "./routes/channels"
import { handleConfig } from "./routes/config"
import { handlePipelines } from "./routes/pipelines"
import { handleTasks } from "./routes/tasks"
import { handleData } from "./routes/data"
import { handleAgentTemplates } from "./routes/agent-templates"
import { wsClients } from "./services/ws-hub"
import { startIngestion } from "./services/openclaw-ingestion"
import { startCronScheduler } from "./services/cron-scheduler"
import {
  onTerminalOpen, onTerminalMessage, onTerminalClose
} from "./services/terminal"
import { createLogger } from "./utils/logger"

const log = createLogger("Server")
const wsLog = createLogger("WS")

const PORT = Number(process.env.API_BRIDGE_PORT ?? 3001)
const WEB_ORIGIN = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": WEB_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

// Set for O(1) polling-path lookup (vs Array.includes O(n))
const POLLING_PATHS = new Set(["/api/agents/tokens", "/api/health", "/api/events", "/api/tasks", "/api/agents"])

// WebSocket connection type discriminator via data
type WsData = { type: "events" } | { type: "terminal"; agentId: string }

const server = Bun.serve<WsData>({
  port: PORT,

  websocket: {
    open(ws) {
      if (ws.data.type === "events") {
        wsClients.add(ws as never)
        wsLog.info("Event client connected", { clients: wsClients.size })
      } else if (ws.data.type === "terminal") {
        onTerminalOpen(ws as never)
        wsLog.info("Terminal client connected", { agentId: ws.data.agentId })
      }
    },
    message(ws, message) {
      if (ws.data.type === "events") {
        try {
          const msg = JSON.parse(message as string)
          if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }))
        } catch {}
      } else if (ws.data.type === "terminal") {
        onTerminalMessage(ws as never, message as string)
      }
    },
    close(ws) {
      if (ws.data.type === "events") {
        wsClients.delete(ws as never)
        wsLog.info("Event client disconnected", { clients: wsClients.size })
      } else if (ws.data.type === "terminal") {
        onTerminalClose(ws as never)
        wsLog.info("Terminal client disconnected", { agentId: ws.data.agentId })
      }
    },
  },

  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname
    const start = performance.now()

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // WebSocket: frontend event stream
    if (path === "/api/events/ws") {
      const upgraded = server.upgrade(req, { data: { type: "events" } })
      if (upgraded) return undefined as unknown as Response
      log.warn("WS upgrade failed", { path })
      return new Response("WebSocket upgrade failed", { status: 400 })
    }

    // WebSocket: terminal relay
    const termMatch = path.match(/^\/api\/terminal\/([^/]+)\/ws$/)
    if (termMatch) {
      const agentId = termMatch[1]
      const upgraded = server.upgrade(req, { data: { type: "terminal", agentId } })
      if (upgraded) return undefined as unknown as Response
      log.warn("Terminal WS upgrade failed", { agentId })
      return new Response("WebSocket upgrade failed", { status: 400 })
    }

    let response: Response

    try {
      if (path.startsWith("/api/agents")) {
        response = await handleAgents(req, url)
      } else if (path.startsWith("/api/cron")) {
        response = await handleCron(req, url)
      } else if (path.startsWith("/api/events") || path.startsWith("/api/metrics")) {
        response = await handleEvents(req, url)
      } else if (path.startsWith("/api/mcp")) {
        response = await handleMcp(req, url)
      } else if (path.startsWith("/api/channels")) {
        response = await handleChannels(req, url)
      } else if (path.startsWith("/api/pipelines")) {
        response = await handlePipelines(req, url)
      } else if (path.startsWith("/api/data")) {
        response = await handleData(req, url)
      } else if (path.startsWith("/api/agent-templates")) {
        response = handleAgentTemplates(req, url)
      } else if (path.startsWith("/api/tasks")) {
        response = await handleTasks(req, url)
      } else if (path === "/api/debug/exec" && req.method === "POST") {
        // Temporary debug: test executor directly, catch and return error details
        try {
          const { executeTask } = await import("./services/agent-executor")
          const { getAgentById } = await import("./db/queries")
          const body = await req.json().catch(() => ({})) as { agentId?: string; prompt?: string }
          const agent = getAgentById(body.agentId ?? "research-and-crawler")
          if (!agent) {
            response = new Response(JSON.stringify({ error: "no agent" }), { status: 404, headers: { "Content-Type": "application/json" } })
          } else {
            const result = await executeTask(agent, body.prompt ?? "say pong", `debug-${Date.now()}`)
            response = new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } })
          }
        } catch (execErr) {
          response = new Response(JSON.stringify({ error: String(execErr), stack: execErr instanceof Error ? execErr.stack : undefined }), { status: 500, headers: { "Content-Type": "application/json" } })
        }
      } else if (path.startsWith("/api/config") || path.startsWith("/api/health")) {
        response = await handleConfig(req, url)
      } else {
        response = new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }
    } catch (err) {
      log.error("Unhandled request error", {
        method: req.method,
        path,
        err: err instanceof Error ? err.message : String(err),
      })
      response = new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Add CORS headers
    response.headers.set("Access-Control-Allow-Origin", CORS_HEADERS["Access-Control-Allow-Origin"])
    response.headers.set("Access-Control-Allow-Methods", CORS_HEADERS["Access-Control-Allow-Methods"])
    response.headers.set("Access-Control-Allow-Headers", CORS_HEADERS["Access-Control-Allow-Headers"])

    const ms = Math.round(performance.now() - start)
    // Suppress noisy polling endpoints (frontend polls every 2-10s)
    const isPolling = POLLING_PATHS.has(path)
    if (!isPolling || response.status >= 400) {
      const level = response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "debug"
      log[level](`${req.method} ${path}`, { status: response.status, ms })
    }

    return response
  },
})

// Start ZeroClaw → SQLite → WebSocket event ingestion pipeline
startIngestion()

// Start cron scheduler (polls DB every 30s, dispatches jobs via ZeroClaw webhook)
startCronScheduler()

log.info(`ZeraBot API Bridge started`, {
  port: PORT,
  openclaw: process.env.OPENCLAW_PORT ?? "18789",
})
