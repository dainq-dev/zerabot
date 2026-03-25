import { z } from "zod"
import { getAllMcpServers, upsertMcpServer, deleteMcpServer } from "../db/queries"
import type { McpServerConfig } from "@zerobot/shared"
import { discoverMcpTools } from "../openclaw/mcp-probe"

const McpCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  transport: z.enum(["stdio", "ws", "http"]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().optional(),
  authToken: z.string().optional(),
  endpoint: z.string().optional(),
  assignedAgents: z.array(z.string()).default([]),
  autoConnect: z.boolean().default(true),
  reconnectMs: z.number().default(3000),
})

function generateId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export async function handleMcp(req: Request, url: URL): Promise<Response> {
  const parts = url.pathname.replace("/api/mcp", "").split("/").filter(Boolean)
  const id = parts[0]
  const action = parts[1]

  // GET /api/mcp
  if (req.method === "GET" && !id) {
    const servers = getAllMcpServers()
    return json({ servers })
  }

  // POST /api/mcp — create
  if (req.method === "POST" && !id) {
    const body = await req.json().catch(() => null)
    const parsed = McpCreateSchema.safeParse(body)
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400)

    const now = Date.now()
    const server: McpServerConfig = {
      id: generateId(parsed.data.name),
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    }
    upsertMcpServer(server)
    return json({ server }, 201)
  }

  // PATCH /api/mcp/:id
  if (req.method === "PATCH" && id && !action) {
    const existing = getAllMcpServers().find(s => s.id === id)
    if (!existing) return json({ error: "Not found" }, 404)
    const body = await req.json().catch(() => null)
    const updated = { ...existing, ...body, id, updatedAt: Date.now() }
    upsertMcpServer(updated)
    return json({ server: updated })
  }

  // DELETE /api/mcp/:id
  if (req.method === "DELETE" && id && !action) {
    deleteMcpServer(id)
    return json({ ok: true })
  }

  // POST /api/mcp/:id/discover — auto-discover tools
  if (req.method === "POST" && id && action === "discover") {
    const server = getAllMcpServers().find(s => s.id === id)
    if (!server) return json({ error: "Not found" }, 404)

    const tools = await discoverMcpTools(server)
    // Update server with discovered tools
    const updated: McpServerConfig = {
      ...server,
      tools,
      toolCount: tools.length,
      updatedAt: Date.now(),
    }
    upsertMcpServer(updated)
    return json({ tools, count: tools.length })
  }

  return json({ error: "Not found" }, 404)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
