import { getRecentEvents, getTokenUsage } from "../db/queries"

export async function handleEvents(req: Request, url: URL): Promise<Response> {
  const path = url.pathname

  // GET /api/events
  if (req.method === "GET" && path === "/api/events") {
    const limit = Number(url.searchParams.get("limit") ?? "200")
    const agentId = url.searchParams.get("agentId") ?? undefined
    const type = url.searchParams.get("type") ?? undefined
    const since = url.searchParams.get("since") ? Number(url.searchParams.get("since")) : undefined
    const events = getRecentEvents(limit, agentId, type, since)
    return json({ events })
  }

  // GET /api/metrics/tokens
  if (req.method === "GET" && path === "/api/metrics/tokens") {
    const agentId = url.searchParams.get("agentId") ?? undefined
    const since = url.searchParams.get("since")
      ? Number(url.searchParams.get("since"))
      : Date.now() - 24 * 60 * 60 * 1000
    const data = getTokenUsage(agentId, since)
    return json({ data })
  }

  return json({ error: "Not found" }, 404)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
