/**
 * OpenClaw Event Ingestion
 *
 * Connects to the single OpenClaw Gateway WebSocket and normalizes
 * incoming events into ZerabotEvent format for the frontend.
 *
 * Key differences from ZeroClaw ingestion:
 *  - Single WS connection (not N connections per agent)
 *  - All agent events arrive on one stream, tagged with agentId
 *  - Task dispatch uses WS sessions.send method
 */

import { createLogger } from "../utils/logger"
import { broadcast } from "./ws-hub"
import { getGatewayWsUrl } from "../openclaw/client"
import { getGatewayToken } from "./gateway-auth"
import { upsertTokenUsage, insertEvent } from "../db/queries"
import type { ZerabotEvent } from "@zerobot/shared"

const log = createLogger("IngestionOC")

let gatewayWs: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
let isHandshakeComplete = false
const RECONNECT_INTERVAL = 10_000  // 10s between retries (avoid log spam)

// ── Public API ────────────────────────────────────────────────────────────────

export function startIngestion(): void {
  connectGateway()
}

export function stopIngestion(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  if (gatewayWs) {
    try { gatewayWs.close() } catch { /* ignore */ }
    gatewayWs = null
  }
}

/**
 * Send a message to a specific agent via the gateway WS.
 * Returns true if sent, false if WS is not connected.
 */
export function sendMessageToAgent(agentId: string, message: string): boolean {
  if (!gatewayWs || gatewayWs.readyState !== WebSocket.OPEN || !isHandshakeComplete) {
    log.warn("Cannot send: gateway WS not connected", { agentId, wsOpen: gatewayWs?.readyState === WebSocket.OPEN, handshake: isHandshakeComplete })
    return false
  }

  try {
    gatewayWs.send(JSON.stringify({
      method: "sessions.send",
      params: {
        target: agentId,
        message,
      },
    }))
    return true
  } catch (err) {
    log.error("Failed to send message via WS", { agentId, err: String(err) })
    return false
  }
}

// ── Gateway Connection ────────────────────────────────────────────────────────

async function connectGateway(): Promise<void> {
  const baseUrl = getGatewayWsUrl()

  // JWT token in URL — the only auth mechanism OpenClaw WS supports
  // auth.mode=none in config but WS still requires Bearer token in query string
  const authToken = getGatewayToken()
  const url = authToken
    ? `${baseUrl}?token=${encodeURIComponent(authToken)}`
    : baseUrl

  try {
    gatewayWs = new WebSocket(url)
  } catch (err) {
    log.debug("WS connect failed, will retry", { err: String(err) })
    scheduleReconnect()
    return
  }

  gatewayWs.onopen = () => {
    reconnectAttempts = 0
    isHandshakeComplete = true
    // No connect frame — gateway uses token-in-URL auth, streams events directly
    log.info("Gateway WS connected", { url: baseUrl })
  }

  gatewayWs.onmessage = (rawEvent: MessageEvent) => {
    try {
      const data = typeof rawEvent.data === "string"
        ? rawEvent.data
        : rawEvent.data.toString()
      handleMessage(data)
    } catch (err) {
      log.debug("Failed to handle WS message", { err: String(err) })
    }
  }

  gatewayWs.onclose = () => {
    gatewayWs = null
    isHandshakeComplete = false
    scheduleReconnect()
  }

  gatewayWs.onerror = () => {
    gatewayWs = null
    isHandshakeComplete = false
    scheduleReconnect()
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectAttempts++
  // Only log every 6th attempt (= once per minute at 10s interval)
  if (reconnectAttempts === 1 || reconnectAttempts % 6 === 0) {
    log.debug("Gateway WS offline, retrying...", { attempt: reconnectAttempts })
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectGateway()
  }, RECONNECT_INTERVAL)
}

// ── Message handling ──────────────────────────────────────────────────────────

function handleMessage(raw: string): void {
  const msg = JSON.parse(raw) as OpenClawWsMessage

  // Handshake response — Gateway replies with hello-ok after connect
  if (msg.type === "hello-ok" || msg.method === "hello-ok") {
    isHandshakeComplete = true
    log.info("Gateway WS handshake complete")
    return
  }

  // Ping/pong keepalive
  if (msg.type === "ping") {
    gatewayWs?.send(JSON.stringify({ type: "pong" }))
    return
  }

  // Normalize OpenClaw event → ZerabotEvent
  const event = normalizeEvent(msg)
  if (!event) return

  // Persist event
  try {
    insertEvent(event)
  } catch { /* ignore duplicate IDs */ }

  // Track tokens
  if (event.tokenUsed && event.tokenUsed > 0 && event.agentId) {
    const hourBucket = Math.floor(event.ts / 3_600_000) * 3_600_000
    const model = (event.payload as Record<string, unknown>)?.model as string ?? "unknown"
    upsertTokenUsage(hourBucket, event.agentId, model, event.tokenUsed, 0)
  }

  // Broadcast to frontend clients
  broadcast(event)
}

// ── OpenClaw event normalization ──────────────────────────────────────────────

interface OpenClawWsMessage {
  type: string
  method?: string
  params?: Record<string, unknown>
  payload?: Record<string, unknown>
  sessionKey?: string
  agentId?: string
  [key: string]: unknown
}

// O(1) lookup: OpenClaw WS type → ZerabotEvent type
// Covers native underscore types, dot-notation, and browser/automation events
const OC_EVENT_TYPE: ReadonlyMap<string, ZerabotEvent["type"]> = new Map([
  // Session / message
  ["message",           "session.message"],
  ["sessions.message",  "session.message"],
  // Tool use/result
  ["tool_use",          "tool.call"],
  ["tool.execute",      "tool.call"],
  ["tool_result",       "tool.result"],
  // Browser / Playwright tool events (OpenClaw automation group)
  ["browser.navigate",  "tool.call"],
  ["browser.action",    "tool.call"],
  ["browser.extract",   "tool.result"],
  ["browser.search",    "tool.call"],
  // Status
  ["status",            "agent.status"],
  ["agent.status",      "agent.status"],
  // Error
  ["error",             "agent.error"],
])

/**
 * Map OpenClaw's WS events to ZerabotEvent format.
 * O(1) type lookup via Map, no sequential if-else chain.
 * Returns null for events we don't track.
 */
function normalizeEvent(msg: OpenClawWsMessage): ZerabotEvent | null {
  const ts = Date.now()
  const agentId = extractAgentId(msg)
  // crypto.randomUUID() — collision-safe, no Math.random()
  const id = `oc-${crypto.randomUUID()}`

  const msgType = msg.type ?? msg.method ?? ""
  const eventType = OC_EVENT_TYPE.get(msgType)

  if (msgType === "message" || msg.method === "sessions.message") {
    const payload = msg.params ?? msg.payload ?? {}
    return {
      id, ts, agentId,
      type: "session.message",
      severity: "info",
      payload: {
        role: (payload.role as string) ?? "assistant",
        content: (payload.content as string) ?? (payload.text as string) ?? "",
        model: payload.model,
      },
      tokenUsed: extractTokenCount(payload),
    }
  }

  if (msgType === "tool_use" || msg.method === "tool.execute") {
    const payload = msg.params ?? msg.payload ?? {}
    return {
      id, ts, agentId,
      type: "tool.call",
      severity: "info",
      payload: {
        tool: payload.name ?? payload.tool ?? "unknown",
        input: payload.input ?? payload.args,
      },
      tokenUsed: 0,
    }
  }

  if (msgType === "tool_result") {
    const payload = msg.params ?? msg.payload ?? {}
    return {
      id, ts, agentId,
      type: "tool.result",
      severity: "info",
      payload: {
        tool: payload.name ?? payload.tool ?? "unknown",
        output: payload.output ?? payload.result,
      },
      tokenUsed: 0,
    }
  }

  // Browser / Playwright tool events (group:automation, group:web)
  if (msgType.startsWith("browser.")) {
    const payload = msg.params ?? msg.payload ?? {}
    const isResult = msgType.endsWith(".extract") || msgType.endsWith(".result")
    return {
      id, ts, agentId,
      type: isResult ? "tool.result" : "tool.call",
      severity: "info",
      payload: {
        tool: "browser",
        action: msgType,
        ...(payload.url ? { url: payload.url } : {}),
        ...(payload.query ? { query: payload.query } : {}),
      },
      tokenUsed: 0,
    }
  }

  if (msgType === "status" || msgType === "agent.status") {
    const payload = msg.params ?? msg.payload ?? {}
    return {
      id, ts, agentId,
      type: "agent.status",
      severity: ((payload.level as string) ?? "info") as ZerabotEvent["severity"],
      payload: { event: payload.status ?? payload.event ?? msgType },
      tokenUsed: 0,
    }
  }

  if (msgType === "error") {
    return {
      id, ts, agentId,
      type: "agent.error",
      severity: "error",
      payload: msg.payload ?? { message: "Unknown error" },
      tokenUsed: 0,
    }
  }

  // Use the O(1) map for any remaining known types
  if (eventType) {
    return {
      id, ts, agentId,
      type: eventType,
      severity: "info",
      payload: msg.params ?? msg.payload ?? {},
      tokenUsed: 0,
    }
  }

  return null
}

function extractAgentId(msg: OpenClawWsMessage): string {
  if (msg.agentId) return msg.agentId
  // OpenClaw sessionKey format: "agent:<agentId>:<channel>:<type>:<identifier>"
  if (msg.sessionKey) {
    const parts = msg.sessionKey.split(":")
    if (parts[0] === "agent" && parts[1]) return parts[1]
  }
  return "gateway"
}

function extractTokenCount(payload: Record<string, unknown>): number {
  // OpenClaw reports usage in various fields
  const usage = payload.usage as Record<string, unknown> | undefined
  if (usage) {
    const input = (usage.inputTokens ?? usage.input_tokens ?? 0) as number
    const output = (usage.outputTokens ?? usage.output_tokens ?? 0) as number
    return input + output
  }
  return (payload.tokenUsed ?? payload.tokens ?? 0) as number
}
