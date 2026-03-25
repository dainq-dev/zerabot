/**
 * Terminal relay service
 * Bridges frontend WebSocket ↔ OpenClaw Gateway WebSocket per agent
 */

import type { ServerWebSocket } from "bun"
import { getAgentEntry } from "./process-manager"
import { getGatewayWsUrl } from "../openclaw/client"

interface TerminalSession {
  agentId: string
  clientWs: ServerWebSocket<unknown>
  ocWs: WebSocket | null
}

const sessions = new Map<string, TerminalSession>()

export function handleTerminalUpgrade(req: Request, server: ReturnType<typeof Bun.serve>, agentId: string): boolean {
  return server.upgrade(req, {
    data: { agentId },
  })
}

export function onTerminalOpen(ws: ServerWebSocket<{ agentId: string }>): void {
  const { agentId } = ws.data
  const sessionId = `${agentId}-${Date.now()}`

  const session: TerminalSession = { agentId, clientWs: ws, ocWs: null }
  sessions.set(sessionId, session)

  // Connect to OpenClaw Gateway WS
  const entry = getAgentEntry(agentId)
  if (!entry) {
    ws.send(JSON.stringify({ type: "error", message: "Agent not running" }))
    return
  }
  const ocWsUrl = getGatewayWsUrl()
  try {
    const ocWs = new WebSocket(ocWsUrl)

    session.ocWs = ocWs

    ocWs.onopen = () => {
      ws.send(JSON.stringify({ type: "output", data: "\r\n" }))
    }

    ocWs.onmessage = (e) => {
      const data = typeof e.data === "string" ? e.data : e.data.toString()
      ws.send(JSON.stringify({ type: "output", data }))
    }

    ocWs.onclose = () => {
      ws.send(JSON.stringify({ type: "error", message: "Agent session closed" }))
    }

    ocWs.onerror = () => {
      // Gateway not running — send simulated response
      ws.send(JSON.stringify({
        type: "output",
        data: `\x1b[33m[Bridge] OpenClaw not connected. Running in echo mode.\x1b[0m\r\n> `
      }))
    }
  } catch {
    ws.send(JSON.stringify({ type: "error", message: "Cannot connect to OpenClaw" }))
  }
}

export function onTerminalMessage(ws: ServerWebSocket<{ agentId: string }>, message: string | Buffer): void {
  const { agentId } = ws.data
  const session = [...sessions.values()].find(s => s.agentId === agentId && s.clientWs === ws)

  if (!session) return

  try {
    const msg = JSON.parse(message.toString()) as { type: string; data?: string }

    if (msg.type === "input" && msg.data) {
      if (session.ocWs?.readyState === WebSocket.OPEN) {
        session.ocWs.send(JSON.stringify({ type: "input", data: msg.data }))
      } else {
        // Echo mode fallback
        ws.send(JSON.stringify({ type: "output", data: msg.data }))
        if (msg.data === "\r") {
          ws.send(JSON.stringify({ type: "output", data: "\r\n[echo mode — OpenClaw offline]\r\n> " }))
        }
      }
    }
  } catch {
    // Raw input passthrough
    if (session.ocWs?.readyState === WebSocket.OPEN) {
      session.ocWs.send(message.toString())
    }
  }
}

export function onTerminalClose(ws: ServerWebSocket<{ agentId: string }>): void {
  const toDelete = [...sessions.entries()]
    .filter(([, s]) => s.clientWs === ws)
    .map(([id]) => id)

  for (const id of toDelete) {
    const session = sessions.get(id)
    session?.ocWs?.close()
    sessions.delete(id)
  }
}
