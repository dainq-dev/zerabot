import { getAllPipelines, upsertPipeline, deletePipeline, getPipelineById, getPipelineRuns, getPipelineRunById } from "../db/queries"
import { executePipeline } from "../services/pipeline-executor"
import type { Pipeline } from "@zerobot/shared"

function generateId(): string {
  return `pipeline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export async function handlePipelines(req: Request, url: URL): Promise<Response> {
  const parts = url.pathname.replace("/api/pipelines", "").split("/").filter(Boolean)
  const id = parts[0]
  const action = parts[1]
  const subAction = parts[2]

  // GET /api/pipelines
  if (req.method === "GET" && !id) {
    const pipelines = getAllPipelines()
    return json({ pipelines })
  }

  // POST /api/pipelines — create
  if (req.method === "POST" && !id) {
    const body = await req.json().catch(() => null) as Partial<Pipeline>
    if (!body?.name) return json({ error: "name required" }, 400)
    const now = Date.now()
    const pipeline: Pipeline = {
      id: generateId(),
      name: body.name,
      description: body.description,
      nodes: body.nodes ?? [],
      edges: body.edges ?? [],
      trigger: body.trigger ?? { type: "manual" },
      status: "draft",
      enabled: body.enabled ?? true,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    upsertPipeline(pipeline)
    return json({ pipeline }, 201)
  }

  // PATCH /api/pipelines/:id
  if (req.method === "PATCH" && id && !action) {
    const pipelines = getAllPipelines()
    const existing = pipelines.find(p => p.id === id)
    if (!existing) return json({ error: "Not found" }, 404)
    const body = await req.json().catch(() => ({})) as Partial<Pipeline>
    const updated = { ...existing, ...body, id, updatedAt: Date.now() }
    upsertPipeline(updated)
    return json({ pipeline: updated })
  }

  // DELETE /api/pipelines/:id
  if (req.method === "DELETE" && id && !action) {
    deletePipeline(id)
    return json({ ok: true })
  }

  // GET /api/pipelines/:id/runs
  if (req.method === "GET" && id && action === "runs" && !subAction) {
    const limit = Number(url.searchParams.get("limit") ?? "20")
    return json({ runs: getPipelineRuns(id, limit) })
  }

  // GET /api/pipelines/:id/runs/:runId
  if (req.method === "GET" && id && action === "runs" && subAction) {
    const run = getPipelineRunById(subAction)
    if (!run || run.pipelineId !== id) return json({ error: "Not found" }, 404)
    return json({ run })
  }

  // POST /api/pipelines/:id/run — trigger manually
  if (req.method === "POST" && id && action === "run") {
    const pipeline = getPipelineById(id)
    if (!pipeline) return json({ error: "Pipeline not found" }, 404)
    if (!pipeline.enabled) return json({ error: "Pipeline is disabled" }, 422)

    // Fire-and-forget: return runId immediately, execution continues async
    const triggerType = url.searchParams.get("trigger") ?? "manual"
    executePipeline(pipeline, triggerType)
      .catch(() => { /* errors are logged + persisted in pipeline-executor */ })

    const runId = `prun-pending-${Date.now()}`
    return json({ ok: true, runId })
  }

  // POST /api/pipelines/:id/cancel
  if (req.method === "POST" && id && action === "cancel") {
    // Cancellation is best-effort: mark in DB, executor checks status per node
    const pipeline = getPipelineById(id)
    if (!pipeline) return json({ error: "Pipeline not found" }, 404)
    upsertPipeline({ ...pipeline, status: "paused", updatedAt: Date.now() })
    return json({ ok: true })
  }

  return json({ error: "Not found" }, 404)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
