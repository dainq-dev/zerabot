/**
 * OpenClaw Process Manager
 *
 * OpenClaw model: 1 Gateway process for ALL agents.
 * Agents are entries in `agents.list[]` of openclaw.json.
 *
 * Lifecycle:
 *   startGateway()  → spawn `openclaw gateway` once
 *   startAgent(a)   → add agent entry to openclaw.json → config hot-reload
 *   stopAgent(id)   → remove agent entry → config hot-reload
 *   stopGateway()   → SIGTERM the gateway process
 */

import { spawn } from "child_process"
import path from "path"
import { loginToGateway } from "./gateway-auth"
import os from "os"
import { createLogger } from "../utils/logger"
import { ocHealthCheck } from "../openclaw/client"
import { writeGatewayConfig, writeAgentWorkspace } from "../openclaw/config"
import { broadcast } from "./ws-hub"
import { getAllAgents } from "../db/queries"
import type { Agent, ZerabotEvent } from "@zerobot/shared"

const log = createLogger("ProcessManager")

/** Expand leading `~` or `~/` to the actual home directory */
function resolveTilde(p: string): string {
  if (p === "~") return os.homedir()
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2))
  return p
}

const OPENCLAW_HOME = resolveTilde(
  process.env.OPENCLAW_HOME ?? path.join(os.homedir(), ".openclaw"),
)
const AGENTS_DIR = path.join(OPENCLAW_HOME, "agents")
const GATEWAY_PORT = Number(process.env.OPENCLAW_PORT ?? 18789)

// ── Gateway process state (single instance) ──────────────────────────────────

interface GatewayState {
  pid: number
  handle: ReturnType<typeof spawn>
}

let gateway: GatewayState | null = null

// Track which agents are "started" (active in config)
const activeAgents = new Set<string>()

// ── Public API ────────────────────────────────────────────────────────────────

export interface ProcessEntry {
  pid: number
  port: number
  token: string
  agentId: string
  pairCode?: string
}

export function getAgentEntry(agentId: string): ProcessEntry | null {
  if (!activeAgents.has(agentId) || !gateway) return null
  return {
    pid: gateway.pid,
    port: GATEWAY_PORT,
    token: "",  // OpenClaw doesn't use per-agent tokens
    agentId,
  }
}

export function isAgentRunning(agentId: string): boolean {
  return activeAgents.has(agentId) && gateway !== null
}

export function getAllRunningAgents(): ProcessEntry[] {
  if (!gateway) return []
  return Array.from(activeAgents).map(agentId => ({
    pid: gateway!.pid,
    port: GATEWAY_PORT,
    token: "",
    agentId,
  }))
}

export async function startAgent(agent: Agent & { port?: number }): Promise<void> {
  // Write per-agent workspace files (SYSTEM_PROMPT.md, skills)
  const agentDir = path.join(AGENTS_DIR, agent.id)
  await writeAgentWorkspace(agent, agentDir)

  // Mark as active
  activeAgents.add(agent.id)

  // Regenerate gateway config with all active agents
  await regenerateGatewayConfig()

  // Start gateway if not running
  if (!gateway) {
    await startGateway()
  }

  log.info("Agent started", { agentId: agent.id })
  broadcastAgentStatus(agent.id, "started")
}

export function stopAgent(agentId: string): void {
  if (!activeAgents.has(agentId)) {
    log.warn("Agent not active", { agentId })
    return
  }

  activeAgents.delete(agentId)
  log.info("Agent stopped", { agentId })
  broadcastAgentStatus(agentId, "stopped")

  // Regenerate config without this agent
  regenerateGatewayConfig().catch(err =>
    log.error("Failed to regenerate config after stop", { agentId, err: String(err) })
  )

  // If no agents active, stop gateway
  if (activeAgents.size === 0 && gateway) {
    stopGateway()
  }
}

export async function getAgentStatus(agentId: string): Promise<"running" | "stopped" | "error"> {
  if (!activeAgents.has(agentId)) return "stopped"
  if (!gateway) return "stopped"

  const healthy = await ocHealthCheck()
  return healthy ? "running" : "error"
}

// ── Gateway lifecycle ─────────────────────────────────────────────────────────

async function startGateway(): Promise<void> {
  if (gateway) return

  // Kill any stale process on the port
  await killPort(GATEWAY_PORT)

  log.info("Spawning OpenClaw gateway", { port: GATEWAY_PORT })

  const child = spawn("openclaw", ["gateway", "run", "--force"], {
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
      OPENCLAW_HOME,
    },
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  })

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString()
    log.debug("OpenClaw stdout", { text: text.trim().slice(0, 200) })
    broadcastStdout(text)
  })

  child.stderr?.on("data", (chunk: Buffer) => {
    log.debug("OpenClaw stderr", { text: chunk.toString().trim().slice(0, 200) })
  })

  child.on("error", (err) => {
    log.error("Failed to spawn OpenClaw", { err: err.message })
    gateway = null
  })

  child.on("exit", (code) => {
    log.info("Gateway process exited", { code })
    gateway = null
  })

  // Wait for gateway to be ready
  const ready = await waitForReady(GATEWAY_PORT, 30)
  if (!ready) {
    child.kill("SIGTERM")
    throw new Error(`OpenClaw gateway did not become ready on port ${GATEWAY_PORT}`)
  }

  gateway = { pid: child.pid!, handle: child }
  log.info("Gateway started", { pid: child.pid, port: GATEWAY_PORT })

  // Login to get JWT token for API/WS auth
  const loggedIn = await loginToGateway()
  if (!loggedIn) {
    log.warn("Gateway login failed — API and WS auth will be unavailable")
  }
}

function stopGateway(): void {
  if (!gateway) return
  log.info("Stopping gateway", { pid: gateway.pid })
  gateway.handle.kill("SIGTERM")
  gateway = null
  activeAgents.clear()
}

// ── Config regeneration ───────────────────────────────────────────────────────

async function regenerateGatewayConfig(): Promise<void> {
  const allAgents = getAllAgents()
  const agentsToInclude = allAgents.filter(a => activeAgents.has(a.id))

  await writeGatewayConfig(agentsToInclude)
  log.debug("Gateway config regenerated", { activeCount: agentsToInclude.length })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g

function isLogLine(line: string): boolean {
  const s = line.replace(ANSI_RE, "").trim()
  if (!s) return true
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true
  if (/^\[\d{4}/.test(s)) return true
  if (/^\d{2}:\d{2}:\d{2}/.test(s)) return true
  if (/^(INFO|WARN|ERROR|DEBUG|TRACE)\b/.test(s)) return true
  if (/^[─═╔╗╚╝╠╣╦╩╬│┌┐└┘├┤┬┴┼▶·]/.test(s)) return true
  return false
}

function broadcastStdout(text: string): void {
  const lines = text.split("\n").filter(line => !isLogLine(line))
  const content = lines.join("\n").trim()
  if (!content) return

  // Try to detect agent ID from OpenClaw output format
  const event: ZerabotEvent = {
    id: `gateway-stdout-${Date.now()}`,
    ts: Date.now(),
    agentId: "gateway",
    type: "session.message",
    severity: "info",
    payload: { role: "assistant", content },
    tokenUsed: 0,
  }
  try { broadcast(event) } catch { /* ignore */ }
}

function broadcastAgentStatus(agentId: string, status: string): void {
  const event: ZerabotEvent = {
    id: `${agentId}-${status}-${Date.now()}`,
    ts: Date.now(),
    agentId,
    type: "agent.status",
    severity: "info",
    payload: { event: status, port: GATEWAY_PORT },
    tokenUsed: 0,
  }
  try { broadcast(event) } catch { /* ignore */ }
}

async function waitForReady(port: number, attempts: number): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    await sleep(500)
    if (await ocHealthCheck()) return true
  }
  return false
}

async function killPort(port: number): Promise<void> {
  try {
    const { execSync } = await import("child_process")
    execSync(`lsof -ti:${port} | xargs -r kill -9 2>/dev/null || true`, { stdio: "ignore" })
    await sleep(300)
  } catch { /* ignore */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
