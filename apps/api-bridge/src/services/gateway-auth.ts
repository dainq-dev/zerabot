/**
 * Gateway Authentication — login via JSON-RPC `auth.login` and manage JWT tokens.
 *
 * Flow:
 *   1. Process-manager starts gateway
 *   2. `loginToGateway()` calls `auth.login` RPC → receives JWT `token`
 *   3. Token is stored in-memory and used for:
 *      - WS connect frame `auth.token`
 *      - HTTP `/rpc` Authorization Bearer header
 *   4. Token is refreshed periodically (before expiry)
 */

import { createLogger } from "../utils/logger"

const log = createLogger("GatewayAuth")

const GATEWAY_PORT = Number(process.env.OPENCLAW_PORT ?? 18789)
const GATEWAY_ADMIN_USER = process.env.OPENCLAW_ADMIN_USER ?? "admin"
const GATEWAY_ADMIN_PASS = process.env.OPENCLAW_ADMIN_PASS ?? "admin123"

let currentToken: string | null = null
let tokenExpiresAt: number | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

/** Get the current access token (may be null if not logged in) */
export function getGatewayToken(): string | null {
  return currentToken
}

/** Login to gateway via `/rpc` `auth.login` method */
export async function loginToGateway(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "auth.login",
        id: `login-${Date.now()}`,
        params: { username: GATEWAY_ADMIN_USER, password: GATEWAY_ADMIN_PASS },
      }),
      signal: AbortSignal.timeout(10_000),
    })

    const data = await res.json() as {
      result?: { token?: string; expires_at?: string; refresh_token?: string }
      error?: { code: number; message: string }
    }

    if (data.error) {
      log.error("Login failed", { error: data.error.message })
      return false
    }

    const token = data.result?.token
    if (!token) {
      log.error("No token in login response", { result: data.result })
      return false
    }

    currentToken = token
    tokenExpiresAt = data.result?.expires_at
      ? new Date(data.result.expires_at).getTime()
      : Date.now() + 3600_000

    log.info("Logged in to gateway", {
      expiresAt: new Date(tokenExpiresAt).toISOString(),
    })

    // Schedule token refresh (5 min before expiry)
    scheduleRefresh()
    return true
  } catch (err) {
    log.error("Login request failed", { err: String(err) })
    return false
  }
}

/** Refresh token before it expires */
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer)
  if (!tokenExpiresAt) return

  const msUntilExpiry = tokenExpiresAt - Date.now()
  const refreshIn = Math.max(msUntilExpiry - 5 * 60_000, 30_000) // 5min before, min 30s

  refreshTimer = setTimeout(async () => {
    log.debug("Token refresh triggered")
    await loginToGateway()
  }, refreshIn)
}

/**
 * Send a task to an agent via gateway `/rpc` JSON-RPC.
 * Flow: session.create → session.message (string message).
 * Ensures token is fresh, retries once on expiry (-32001).
 */
export async function sendTaskViaRpc(
  agentId: string,
  prompt: string,
  taskId?: string,
  _retried = false,
): Promise<{ ok: boolean; error?: string }> {
  // Ensure we have a valid token
  if (!getGatewayToken()) {
    const loggedIn = await loginToGateway()
    if (!loggedIn) return { ok: false, error: "Not authenticated" }
  }

  try {
    const sessionKey = await createSession(agentId)
    if (!sessionKey) return { ok: false, error: "Failed to create session" }

    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getGatewayToken()}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "session.message",
        id: taskId ?? `task-${Date.now()}`,
        // agent_id required — gateway reads params.agent_id, NOT session_key
        params: { session_key: sessionKey, agent_id: agentId, message: prompt },
      }),
      signal: AbortSignal.timeout(60_000),
    })

    const data = await res.json() as {
      result?: unknown
      error?: { code: number; message: string }
    }

    if (data.error) {
      if (data.error.code === -32001 && !_retried) {
        // Token expired — re-login and retry once (guard against infinite recursion)
        log.warn("Token expired, re-logging in...")
        const ok = await loginToGateway()
        if (ok) return sendTaskViaRpc(agentId, prompt, taskId, true)
      }
      return { ok: false, error: data.error.message }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Create or retrieve a gateway session for an agent.
 * Returns the session_key, or null on failure.
 */
async function createSession(agentId: string): Promise<string | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getGatewayToken()}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "session.create",
        id: `sess-${Date.now()}`,
        params: { agent_id: agentId },
      }),
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json() as {
      result?: { session_key?: string }
      error?: { message: string }
    }
    return data.result?.session_key ?? null
  } catch {
    return null
  }
}

/** Cleanup */
export function destroyAuth() {
  if (refreshTimer) clearTimeout(refreshTimer)
  currentToken = null
  tokenExpiresAt = null
}
