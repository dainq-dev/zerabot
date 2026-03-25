import { z } from "zod"
import {
  getAllCronJobs, getCronJobById, upsertCronJob, deleteCronJob,
  insertCronRun, getCronRunsByJob, getAgentById,
} from "../db/queries"
import { getAgentEntry } from "../services/process-manager"
import { executeTask } from "../services/agent-executor"
import { createLogger } from "../utils/logger"

const log = createLogger("Cron")

const CreateCronSchema = z.object({
  name: z.string().min(1),
  schedule: z.string().min(1),
  agentId: z.string().min(1),
  task: z.string().min(1),
  notifyChannel: z.string().optional(),
  enabled: z.boolean().default(true),
})

export async function handleCron(req: Request, url: URL): Promise<Response> {
  const parts = url.pathname.replace("/api/cron", "").split("/").filter(Boolean)
  const id = parts[0]
  const action = parts[1]

  // GET /api/cron
  if (req.method === "GET" && !id) {
    return json({ jobs: getAllCronJobs() })
  }

  // POST /api/cron — create
  if (req.method === "POST" && !id) {
    const body = await req.json().catch(() => null)
    const parsed = CreateCronSchema.safeParse(body)
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400)

    const now = Date.now()
    const job = {
      id: `cron-${now}`,
      ...parsed.data,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
    }
    upsertCronJob(job)
    return json({ job }, 201)
  }

  // GET /api/cron/:id/runs
  if (req.method === "GET" && id && action === "runs") {
    const limit = Number(url.searchParams.get("limit") ?? "50")
    return json({ runs: getCronRunsByJob(id, limit) })
  }

  // POST /api/cron/:id/run — trigger manually
  if (req.method === "POST" && id && action === "run") {
    const job = getCronJobById(id)
    if (!job) return json({ error: "Not found" }, 404)

    const entry = getAgentEntry(job.agentId)
    if (!entry) return json({ error: "Agent not running" }, 409)

    const runId = `run-${Date.now()}`
    const runRecord = {
      id: runId, jobId: job.id, jobName: job.name, agentId: job.agentId,
      startedAt: Date.now(), status: "running" as const, tokenUsed: 0,
    }
    insertCronRun(runRecord)
    log.info("Cron job triggered manually", { jobId: id, agentId: job.agentId })

    const agent = getAgentById(job.agentId)
    if (agent) {
      executeTask(agent, job.task, runId).catch((err: Error) =>
        log.error("Failed to execute cron task", { jobId: id, err: err?.message })
      )
    } else {
      log.error("Agent not found in DB for cron trigger", { jobId: id, agentId: job.agentId })
    }
    return json({ ok: true, runId })
  }

  // POST /api/cron/:id/pause
  if (req.method === "POST" && id && action === "pause") {
    const job = getCronJobById(id)
    if (!job) return json({ error: "Not found" }, 404)
    upsertCronJob({ ...job, status: "paused", updatedAt: Date.now() })
    return json({ ok: true })
  }

  // POST /api/cron/:id/resume
  if (req.method === "POST" && id && action === "resume") {
    const job = getCronJobById(id)
    if (!job) return json({ error: "Not found" }, 404)
    upsertCronJob({ ...job, status: "active", updatedAt: Date.now() })
    return json({ ok: true })
  }

  // DELETE /api/cron/:id
  if (req.method === "DELETE" && id && !action) {
    deleteCronJob(id)
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
