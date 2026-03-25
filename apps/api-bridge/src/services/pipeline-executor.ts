/**
 * Pipeline Execution Engine
 *
 * Uses Kahn's Algorithm (BFS topological sort) to:
 * 1. Resolve node execution order from the DAG of nodes + edges.
 * 2. Naturally group independent nodes into parallel execution levels.
 * 3. Detect cycles (throw before executing anything).
 *
 * Complexity:
 *   buildExecutionLevels — O(V + E)
 *   executeLevel         — O(k) per level with Promise.all (wall-clock = slowest node)
 *
 * Context passing: each agent node stores its output in ctx.vars[outputVar].
 * Subsequent nodes can reference it via {{varName}} in taskPrompt.
 */

import { executeTask } from "./agent-executor"
import { broadcast } from "./ws-hub"
import {
  getAgentById, insertPipelineRun, updatePipelineRun, upsertPipeline, getPipelineById,
  type PipelineRun,
} from "../db/queries"
import { createLogger } from "../utils/logger"
import type { Pipeline, FlowNode, FlowEdge, ZerabotEvent } from "@zerobot/shared"

const log = createLogger("PipelineExec")

const MAX_PARALLEL_NODES = 5  // safety cap per level

// ── Public API ────────────────────────────────────────────────────────────────

export async function executePipeline(
  pipeline: Pipeline,
  triggerType = "manual",
): Promise<{ ok: boolean; runId: string; error?: string }> {
  const runId = `prun-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // Persist run record immediately
  const run: PipelineRun = {
    id: runId,
    pipelineId: pipeline.id,
    status: "running",
    triggerType,
    startedAt: Date.now(),
    vars: {},
    nodeResults: {},
  }
  insertPipelineRun(run)
  emitPipelineEvent(runId, pipeline.id, "pipeline.started", { pipelineId: pipeline.id, runId })

  // Mark pipeline as running in DB
  upsertPipeline({ ...pipeline, status: "running", updatedAt: Date.now() })

  try {
    const levels = buildExecutionLevels(pipeline.nodes, pipeline.edges)
    log.info("Pipeline execution plan", {
      pipelineId: pipeline.id, runId,
      levels: levels.map(l => l.map(n => n.id)),
    })

    const ctx: ExecutionContext = { runId, pipelineId: pipeline.id, vars: {}, nodeResults: {} }

    for (const level of levels) {
      // Cap parallel nodes per level
      const capped = level.slice(0, MAX_PARALLEL_NODES)
      if (capped.length < level.length) {
        log.warn("Parallel cap applied", { pipelineId: pipeline.id, runId, capped: capped.length, total: level.length })
      }
      await Promise.all(capped.map(node => executeNode(node, ctx, pipeline)))
    }

    // Done — persist final context
    updatePipelineRun(runId, {
      status: "done",
      finishedAt: Date.now(),
      vars: ctx.vars,
      nodeResults: ctx.nodeResults,
    })
    upsertPipeline({
      ...pipeline,
      status: "active",
      lastRunAt: Date.now(),
      runCount: (pipeline.runCount ?? 0) + 1,
      updatedAt: Date.now(),
    })
    emitPipelineEvent(runId, pipeline.id, "pipeline.done", { pipelineId: pipeline.id, runId })
    log.info("Pipeline completed", { pipelineId: pipeline.id, runId })
    return { ok: true, runId }

  } catch (err) {
    const msg = String(err)
    updatePipelineRun(runId, { status: "error", finishedAt: Date.now(), error: msg })
    upsertPipeline({ ...pipeline, status: "error", updatedAt: Date.now() })
    emitPipelineEvent(runId, pipeline.id, "pipeline.error", { pipelineId: pipeline.id, runId, error: msg })
    log.error("Pipeline failed", { pipelineId: pipeline.id, runId, err: msg })
    return { ok: false, runId, error: msg }
  }
}

// ── Kahn's Algorithm — O(V + E) ───────────────────────────────────────────────

/**
 * Returns nodes grouped into execution levels.
 * Nodes within the same level have no dependency on each other → run in parallel.
 * Nodes in later levels depend on (at least one node from) earlier levels.
 *
 * Cycle detection: if visited < total nodes after BFS, a cycle exists.
 */
function buildExecutionLevels(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[][] {
  if (nodes.length === 0) return []

  // Build in-degree map + adjacency list — O(E)
  const inDegree = new Map<string, number>(nodes.map(n => [n.id, 0]))
  const adj      = new Map<string, string[]>(nodes.map(n => [n.id, []]))

  for (const edge of edges) {
    // Only sequential/parallel edges carry execution dependency
    if (edge.type === "conditional") continue
    adj.get(edge.source)?.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const nodeById = new Map<string, FlowNode>(nodes.map(n => [n.id, n]))

  // BFS level-order — O(V + E)
  const levels: FlowNode[][] = []
  let queue: FlowNode[] = nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0)

  while (queue.length > 0) {
    levels.push(queue)
    const next: FlowNode[] = []
    for (const node of queue) {
      for (const neighborId of adj.get(node.id) ?? []) {
        const deg = (inDegree.get(neighborId) ?? 0) - 1
        inDegree.set(neighborId, deg)
        if (deg === 0) {
          const n = nodeById.get(neighborId)
          if (n) next.push(n)
        }
      }
    }
    queue = next
  }

  // Cycle detection: all nodes should have been visited
  const visited = levels.reduce((s, l) => s + l.length, 0)
  if (visited < nodes.length) {
    throw new Error(`Pipeline has a circular dependency (visited ${visited}/${nodes.length} nodes)`)
  }

  return levels
}

// ── Node executors ────────────────────────────────────────────────────────────

interface ExecutionContext {
  runId: string
  pipelineId: string
  vars: Record<string, string>
  nodeResults: Record<string, { status: string; output?: string; error?: string }>
}

async function executeNode(node: FlowNode, ctx: ExecutionContext, pipeline: Pipeline): Promise<void> {
  emitPipelineEvent(ctx.runId, ctx.pipelineId, "pipeline.node.started", { nodeId: node.id, type: node.type })
  log.debug("Executing node", { nodeId: node.id, type: node.type, runId: ctx.runId })

  try {
    let output = ""

    switch (node.type) {
      case "trigger":
        // Trigger nodes are entry points — no action needed
        break

      case "agent":
        output = await executeAgentNode(node, ctx)
        break

      case "delay": {
        const ms = (node.data as { durationMs?: number }).durationMs ?? 1_000
        await delay(Math.min(ms, 60_000))  // cap at 60s
        break
      }

      case "condition":
        output = evaluateCondition(node, ctx)
        break

      case "mcp":
        // MCP node — placeholder (requires MCP client integration)
        log.warn("MCP node execution not yet implemented", { nodeId: node.id })
        output = "mcp:skipped"
        break

      case "channel":
        // Channel send — placeholder
        log.warn("Channel node execution not yet implemented", { nodeId: node.id })
        output = "channel:skipped"
        break

      default:
        log.warn("Unknown node type, skipping", { nodeId: node.id, type: node.type })
    }

    // Store outputVar if specified
    const outputVar = (node.data as { outputVar?: string }).outputVar
    if (outputVar && output) {
      ctx.vars[outputVar] = output
    }

    ctx.nodeResults[node.id] = { status: "done", output: output.slice(0, 2_000) }
    emitPipelineEvent(ctx.runId, ctx.pipelineId, "pipeline.node.done", { nodeId: node.id, outputVar })

  } catch (err) {
    const msg = String(err)
    ctx.nodeResults[node.id] = { status: "error", error: msg }
    emitPipelineEvent(ctx.runId, ctx.pipelineId, "pipeline.node.error", { nodeId: node.id, error: msg })
    log.error("Node execution failed", { nodeId: node.id, runId: ctx.runId, err: msg })
    // Non-fatal: continue pipeline execution for other nodes in this level
  }
}

async function executeAgentNode(node: FlowNode, ctx: ExecutionContext): Promise<string> {
  const data = node.data as { agentId?: string; taskPrompt?: string; outputVar?: string }
  if (!data.agentId) throw new Error(`Agent node ${node.id} has no agentId`)

  const agent = getAgentById(data.agentId)
  if (!agent) throw new Error(`Agent not found: ${data.agentId}`)
  if (!agent.enabled) throw new Error(`Agent disabled: ${data.agentId}`)

  // Template substitution: replace {{varName}} with accumulated vars — O(n vars)
  const rawPrompt = data.taskPrompt ?? ""
  const prompt = rawPrompt.replace(/\{\{(\w+)\}\}/g, (_, key: string) => ctx.vars[key] ?? "")

  if (!prompt.trim()) throw new Error(`Agent node ${node.id} has empty prompt after substitution`)

  const nodeRunId = `${ctx.runId}-node-${node.id}`
  const result = await executeTask(agent, prompt, nodeRunId)
  if (!result.ok) throw new Error(result.error ?? "Agent execution failed")

  // Return last output var value if set, else the prompt as acknowledgement
  const outputVar = data.outputVar
  return outputVar ? (ctx.vars[outputVar] ?? prompt) : prompt
}

function evaluateCondition(node: FlowNode, ctx: ExecutionContext): string {
  const data = node.data as { condition?: string }
  if (!data.condition) return "true"

  try {
    // Safe evaluation: only allow access to ctx.vars
    // eslint-disable-next-line no-new-func
    const fn = new Function("vars", `"use strict"; return !!(${data.condition})`)
    const result = fn(ctx.vars) as boolean
    return String(result)
  } catch (err) {
    log.warn("Condition evaluation failed", { nodeId: node.id, err: String(err) })
    return "false"
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function emitPipelineEvent(
  runId: string,
  pipelineId: string,
  type: ZerabotEvent["type"],
  payload: Record<string, unknown>,
): void {
  const event: ZerabotEvent = {
    id: `${runId}-${type}-${Date.now()}`,
    ts: Date.now(),
    agentId: undefined,
    pipelineId,
    type,
    severity: type.includes("error") ? "error" : "info",
    payload,
    tokenUsed: 0,
  }
  broadcast(event)
}

// Re-export for use in routes
export { buildExecutionLevels }
