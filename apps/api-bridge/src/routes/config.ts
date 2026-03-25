import { readConfig, patchConfig } from "../openclaw/config"
import { getAllRunningAgents } from "../services/process-manager"
import { ocHealthCheck } from "../openclaw/client"

export async function handleConfig(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // GET /api/config
  if (req.method === "GET" && path === "/api/config") {
    const config = await readConfig()
    return json({ config })
  }

  // PATCH /api/config
  if (req.method === "PATCH" && path === "/api/config") {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return json({ error: "Invalid body" }, 400)
    await patchConfig(body as Record<string, unknown>)
    return json({ ok: true })
  }

  // GET /api/health
  if (req.method === "GET" && path === "/api/health") {
    const running = getAllRunningAgents()
    const gatewayHealthy = await ocHealthCheck()
    return json({
      status: "ok",
      bridge: "ok",
      openclaw: { ok: gatewayHealthy },
      runningAgents: running.length,
    })
  }

  return json({ error: "Not found" }, 404)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
