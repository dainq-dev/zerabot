/**
 * OpenClaw Gateway Client.
 * Single gateway process on port 18789 — all agents share one instance.
 *
 * Communication:
 *   WS:   ws://127.0.0.1:18789/ws  (streaming events — see openclaw-ingestion.ts)
 *   HTTP: http://127.0.0.1:18789   (health, status, rpc)
 *
 * Task dispatch → use sendTaskViaRpc() in services/gateway-auth.ts
 * Event ingestion → see services/openclaw-ingestion.ts
 */

const GATEWAY_PORT = Number(process.env.OPENCLAW_PORT ?? 18789)
const GATEWAY_HOST = "127.0.0.1"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OcStatus {
  status: string
  version?: string
  uptime?: number
  agents?: Array<{ id: string; status: string }>
}

// ── Health / Status ───────────────────────────────────────────────────────────

export async function ocHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function ocGetStatus(): Promise<OcStatus | null> {
  try {
    const res = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/api/status`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return await res.json() as OcStatus
  } catch {
    return null
  }
}

// ── Config RPC (async HTTP, no blocking execSync) ─────────────────────────────

/**
 * Get current live config + hash from gateway via JSON-RPC.
 * Used for config.patch baseHash requirement.
 */
export async function ocConfigGet(
  token?: string,
): Promise<{ config: Record<string, unknown>; hash: string } | null> {
  try {
    const res = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: "cfg-get", method: "config.get", params: {} }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json() as {
      result?: { hash?: string; config?: Record<string, unknown> }
    }
    return {
      config: data.result?.config ?? {},
      hash:   data.result?.hash   ?? "",
    }
  } catch {
    return null
  }
}

/**
 * Patch live gateway config via JSON-RPC.
 * Objects merge recursively; null deletes a key; arrays replace.
 */
export async function ocConfigPatch(
  patch: Record<string, unknown>,
  baseHash: string,
  token?: string,
): Promise<boolean> {
  try {
    const res = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0", id: "cfg-patch", method: "config.patch",
        params: { patch, baseHash },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── URL helpers ───────────────────────────────────────────────────────────────

export function getGatewayWsUrl(): string {
  return `ws://${GATEWAY_HOST}:${GATEWAY_PORT}/ws`
}

export function getGatewayHttpUrl(): string {
  return `http://${GATEWAY_HOST}:${GATEWAY_PORT}`
}
