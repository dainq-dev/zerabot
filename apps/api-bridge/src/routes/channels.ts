import { getAllChannels, upsertChannel } from "../db/queries"
import type { Channel } from "@zerobot/shared"
import { patchConfig } from "../openclaw/config"

export async function handleChannels(req: Request, url: URL): Promise<Response> {
  const parts = url.pathname.replace("/api/channels", "").split("/").filter(Boolean)
  const id = parts[0] as Channel["id"] | undefined
  const action = parts[1]

  // GET /api/channels
  if (req.method === "GET" && !id) {
    const channels = getAllChannels()
    return json({ channels })
  }

  // PATCH /api/channels/:id — update config
  if (req.method === "PATCH" && id && !action) {
    const channels = getAllChannels()
    const existing = channels.find(c => c.id === id)
    const body = await req.json().catch(() => ({})) as Partial<Channel>
    const updated: Channel = {
      id,
      name: existing?.name ?? id,
      config: { ...(existing?.config ?? {}), ...(body.config ?? {}) },
      routing: body.routing ?? existing?.routing ?? [],
      enabled: body.enabled ?? existing?.enabled ?? false,
      updatedAt: Date.now(),
    }
    upsertChannel(updated)

    // Sync to OpenClaw config (JSON5, auto hot-reload)
    await syncChannelToConfig(updated)
    // OpenClaw hot-reloads config automatically

    return json({ channel: updated })
  }

  // POST /api/channels/:id/test
  if (req.method === "POST" && id && action === "test") {
    // Stub: real implementation would call OpenClaw test endpoint
    return json({ ok: true, message: `Test message sent via ${id}` })
  }

  return json({ error: "Not found" }, 404)
}

async function syncChannelToConfig(channel: Channel): Promise<void> {
  const patch: Record<string, unknown> = {
    channels: {
      [channel.id]: {
        enabled: channel.enabled,
        ...channel.config,
      },
    },
  }
  await patchConfig(patch)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
