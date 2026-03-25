import type { ServerWebSocket } from "bun"
import type { ZerabotEvent } from "@zerobot/shared"
import { insertEvent } from "../db/queries"
import { createLogger } from "../utils/logger"

const log = createLogger("WsHub")

export const wsClients = new Set<ServerWebSocket<unknown>>()

export function broadcast(event: ZerabotEvent): void {
  insertEvent(event)

  if (wsClients.size === 0) return

  const msg = JSON.stringify({ type: "event", payload: event })

  // Collect dead clients separately — never modify a Set while iterating it
  let dead: ServerWebSocket<unknown>[] | null = null

  for (const client of wsClients) {
    try {
      client.send(msg)
    } catch {
      ;(dead ??= []).push(client)
    }
  }

  if (dead) {
    for (const c of dead) wsClients.delete(c)
    log.warn("Dropped dead WS clients", { dropped: dead.length, remaining: wsClients.size })
  }
}

/** Broadcast to WS clients only — intentionally skips DB insert (for high-frequency streaming chunks) */
export function broadcastLive(event: ZerabotEvent): void {
  if (wsClients.size === 0) return

  const msg = JSON.stringify({ type: "event", payload: event })
  let dead: ServerWebSocket<unknown>[] | null = null

  for (const client of wsClients) {
    try {
      client.send(msg)
    } catch {
      ;(dead ??= []).push(client)
    }
  }

  if (dead) {
    for (const c of dead) wsClients.delete(c)
    log.warn("Dropped dead WS clients", { dropped: dead.length, remaining: wsClients.size })
  }
}

export function broadcastRaw(data: unknown): void {
  if (wsClients.size === 0) return

  const msg = JSON.stringify(data)
  let dead: ServerWebSocket<unknown>[] | null = null

  for (const client of wsClients) {
    try {
      client.send(msg)
    } catch {
      ;(dead ??= []).push(client)
    }
  }

  if (dead) {
    for (const c of dead) wsClients.delete(c)
  }
}
