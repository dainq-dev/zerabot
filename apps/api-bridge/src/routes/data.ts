/**
 * Data Ingestion & Query API
 *
 * Agents POST structured crawl results here after completing a crawl task.
 * Frontend queries crawled items with filtering, pagination, and export.
 *
 * Security: ingest endpoint only accepts requests from localhost (127.0.0.1 / ::1).
 */

import { z } from "zod"
import {
  insertCrawledItem, getCrawledItems, getCrawledSourceStats,
  deleteCrawledItem, deleteOldCrawledItems,
  type CrawledItem,
} from "../db/queries"
import { broadcast } from "../services/ws-hub"
import { isDuplicate } from "../services/crawl-dedup"
import { createLogger } from "../utils/logger"
import type { ZerabotEvent } from "@zerobot/shared"

const log = createLogger("DataRoute")

// ── Zod schemas ───────────────────────────────────────────────────────────────

const IngestItemSchema = z.object({
  url:             z.string().url().optional(),
  title:           z.string().max(500).optional(),
  content:         z.string().max(50_000).optional(),
  structured_data: z.record(z.unknown()).optional(),
  published_at:    z.number().optional(),
  tags:            z.array(z.string()).optional(),
})

const IngestPayloadSchema = z.object({
  source:         z.string().min(1).max(100),
  category:       z.string().max(100).optional(),
  agent_id:       z.string().optional(),
  pipeline_run_id:z.string().optional(),
  items:          z.array(IngestItemSchema).min(1).max(200),
})

// ── Route handler ─────────────────────────────────────────────────────────────

export async function handleData(req: Request, url: URL): Promise<Response> {
  const subpath = url.pathname.replace("/api/data", "")

  // POST /api/data/ingest
  if (req.method === "POST" && subpath === "/ingest") {
    return handleIngest(req)
  }

  // GET /api/data/items
  if (req.method === "GET" && subpath === "/items") {
    return handleListItems(url)
  }

  // DELETE /api/data/items/:id
  const itemMatch = subpath.match(/^\/items\/([^/]+)$/)
  if (req.method === "DELETE" && itemMatch) {
    deleteCrawledItem(itemMatch[1]!)
    return json({ ok: true })
  }

  // GET /api/data/sources
  if (req.method === "GET" && subpath === "/sources") {
    return json({ sources: getCrawledSourceStats() })
  }

  // GET /api/data/export
  if (req.method === "GET" && subpath === "/export") {
    return handleExport(url)
  }

  // POST /api/data/cleanup  (manual trigger for retention policy)
  if (req.method === "POST" && subpath === "/cleanup") {
    const days = Number(url.searchParams.get("days") ?? "30")
    const deleted = deleteOldCrawledItems(days * 24 * 60 * 60 * 1_000)
    log.info("Manual cleanup", { days, deleted })
    return json({ ok: true, deleted })
  }

  return json({ error: "Not found" }, 404)
}

// ── Ingest ────────────────────────────────────────────────────────────────────

async function handleIngest(req: Request): Promise<Response> {
  // Accept only from localhost
  const xff = req.headers.get("x-forwarded-for")
  const host = req.headers.get("host") ?? ""
  const isLocal = host.startsWith("localhost") || host.startsWith("127.") || host.startsWith("[::1]")
  const hasInternalToken = req.headers.get("x-internal-token") === process.env.INTERNAL_TOKEN
  if (!isLocal && !hasInternalToken) {
    return json({ error: "Forbidden: ingest endpoint is localhost-only" }, 403)
  }
  void xff  // suppress unused warning

  const body = await req.json().catch(() => null)
  const parsed = IngestPayloadSchema.safeParse(body)
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400)

  const { source, category, agent_id, pipeline_run_id, items } = parsed.data
  const now = Date.now()
  let inserted = 0
  let skipped = 0

  for (const item of items) {
    // URL dedup: skip if seen this session
    if (item.url && isDuplicate(item.url)) {
      skipped++
      continue
    }

    const crawledItem: CrawledItem = {
      id:             `ci-${now}-${Math.random().toString(36).slice(2, 8)}`,
      source,
      category,
      url:            item.url,
      title:          item.title,
      content:        item.content,
      structuredData: item.structured_data,
      agentId:        agent_id,
      pipelineRunId:  pipeline_run_id,
      crawledAt:      now,
      publishedAt:    item.published_at,
      tags:           item.tags ?? [],
    }

    insertCrawledItem(crawledItem)
    inserted++
  }

  if (inserted > 0) {
    const event: ZerabotEvent = {
      id: `data-ingested-${now}`,
      ts: now,
      agentId: agent_id,
      type: "data.ingested" as ZerabotEvent["type"],
      severity: "info",
      payload: { source, category, inserted, skipped },
      tokenUsed: 0,
    }
    broadcast(event)
  }

  log.info("Ingest complete", { source, category, inserted, skipped })
  return json({ ok: true, inserted, skipped }, 201)
}

// ── List items ────────────────────────────────────────────────────────────────

function handleListItems(url: URL): Response {
  const source   = url.searchParams.get("source")   ?? undefined
  const category = url.searchParams.get("category") ?? undefined
  const from     = url.searchParams.get("from")     ? Number(url.searchParams.get("from"))  : undefined
  const to       = url.searchParams.get("to")       ? Number(url.searchParams.get("to"))    : undefined
  const limit    = Math.min(Number(url.searchParams.get("limit") ?? "50"), 500)
  const offset   = Number(url.searchParams.get("offset") ?? "0")

  const items = getCrawledItems({ source, category, from, to, limit, offset })
  return json({ items, count: items.length, offset })
}

// ── Export ────────────────────────────────────────────────────────────────────

function handleExport(url: URL): Response {
  const source   = url.searchParams.get("source")   ?? undefined
  const category = url.searchParams.get("category") ?? undefined
  const from     = url.searchParams.get("from")     ? Number(url.searchParams.get("from")) : undefined
  const to       = url.searchParams.get("to")       ? Number(url.searchParams.get("to"))   : undefined

  const items = getCrawledItems({ source, category, from, to, limit: 5_000 })
  const body = JSON.stringify({ exported_at: Date.now(), count: items.length, items }, null, 2)

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="crawled-${Date.now()}.json"`,
    },
  })
}

// ── Helper ────────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
