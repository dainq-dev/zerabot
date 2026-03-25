import { z } from "zod"
import { insertTaskRun, getRecentTaskRuns, deleteTaskRun } from "../db/queries"
import { getAllAgents, getAllPipelines, getAgentById } from "../db/queries"
import { executeTask } from "../services/agent-executor"
import { broadcast } from "../services/ws-hub"
import { createLogger } from "../utils/logger"
import type { ZerabotEvent } from "@zerobot/shared"

const log = createLogger("Tasks")

const RunTaskSchema = z.object({
  targetType: z.enum(["agent", "pipeline"]),
  targetId: z.string().min(1),
  prompt: z.string().min(1),
})

export async function handleTasks(req: Request, url: URL): Promise<Response> {
  const parts = url.pathname.replace("/api/tasks", "").split("/").filter(Boolean)
  const id = parts[0]

  // GET /api/tasks — list recent runs
  if (req.method === "GET" && !id) {
    const limit = Number(url.searchParams.get("limit") ?? "100")
    return json({ runs: getRecentTaskRuns(limit) })
  }

  // POST /api/tasks — dispatch a one-shot task (async, non-blocking)
  if (req.method === "POST" && !id) {
    const body = await req.json().catch(() => null)
    const parsed = RunTaskSchema.safeParse(body)
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400)

    const { targetType, targetId, prompt } = parsed.data

    let targetName: string | undefined

    if (targetType === "agent") {
      // Resolve agent — direct execution doesn't require gateway process
      const agents = getAllAgents()
      const foundAgent = agents.find(a => a.id === targetId)
      if (!foundAgent) return json({ error: "Agent not found" }, 404)
      targetName = foundAgent.name

      const runId = `task-${Date.now()}`
      insertTaskRun({
        id: runId,
        targetType: "agent",
        targetId,
        targetName,
        agentId: targetId,
        prompt,
        status: "dispatched",
        startedAt: Date.now(),
        tokenUsed: 0,
      })

      // Fire-and-forget: execute task directly via AI provider
      executeTask(foundAgent, prompt, runId)
        .then((result: { ok: boolean; error?: string }) => {
          if (!result.ok) log.error("Task execution failed", { agentId: targetId, runId, err: result.error })
          else log.info("Task completed", { agentId: targetId, runId })
        })
        .catch((err: unknown) => log.error("Task exception", { agentId: targetId, runId, err: String(err) }))

      // Broadcast user prompt event so OutputPanel shows the sent message
      broadcastUserPrompt(runId, targetId, prompt)

      log.info("Task dispatched (async)", { agentId: targetId, runId })
      return json({ ok: true, runId }, 201)
    }

    if (targetType === "pipeline") {
      const pipelines = getAllPipelines()
      const pipeline = pipelines.find(p => p.id === targetId)
      if (!pipeline) return json({ error: "Pipeline not found" }, 404)
      targetName = pipeline.name

      // Find first agent node in the pipeline and dispatch to it
      const agentNode = pipeline.nodes.find((n: { type: string }) => n.type === "agent")
      if (!agentNode) return json({ error: "Pipeline has no agent node" }, 422)

      const agentId = (agentNode as { data?: { agentId?: string } }).data?.agentId
      if (!agentId) return json({ error: "Pipeline agent node has no agentId" }, 422)

      const pipelineAgent = getAgentById(agentId)
      if (!pipelineAgent) return json({ error: "Pipeline agent not found" }, 404)

      const runId = `task-${Date.now()}`
      insertTaskRun({
        id: runId,
        targetType: "pipeline",
        targetId,
        targetName,
        agentId,
        prompt,
        status: "dispatched",
        startedAt: Date.now(),
        tokenUsed: 0,
      })

      // Fire-and-forget: execute task directly via AI provider
      executeTask(pipelineAgent, prompt, runId)
        .then((result: { ok: boolean; error?: string }) => {
          if (!result.ok) log.error("Pipeline task failed", { pipelineId: targetId, agentId, runId, err: result.error })
          else log.info("Pipeline task completed", { pipelineId: targetId, agentId, runId })
        })
        .catch((err: unknown) => log.error("Pipeline task exception", { pipelineId: targetId, agentId, runId, err: String(err) }))

      broadcastUserPrompt(runId, agentId, prompt)

      log.info("Task dispatched via pipeline (async)", { pipelineId: targetId, agentId, runId })
      return json({ ok: true, runId }, 201)
    }

    return json({ error: "Invalid targetType" }, 400)
  }

  // DELETE /api/tasks/:id
  if (req.method === "DELETE" && id) {
    deleteTaskRun(id)
    return json({ ok: true })
  }

  return json({ error: "Not found" }, 404)
}

/** Broadcast the user prompt as a session.message event so the OutputPanel shows it */
function broadcastUserPrompt(runId: string, agentId: string, prompt: string): void {
  const event: ZerabotEvent = {
    id: `${runId}-prompt`,
    ts: Date.now(),
    agentId,
    type: "session.message",
    severity: "info",
    payload: { role: "user", content: prompt },
    tokenUsed: 0,
  }
  try { broadcast(event) } catch { /* ignore */ }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
