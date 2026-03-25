/**
 * Direct AI execution for agent tasks.
 *
 * OpenClaw v0.1.0 gateway never loads agents from openclaw.json config into
 * its runtime — `state.agents` is always empty, so `session.message` always
 * returns "Agent not found". This service bypasses the gateway for execution
 * and calls AI providers directly, streaming events to the WS hub.
 *
 * Supports: Anthropic, OpenAI, OpenRouter, Google (via OpenAI-compat endpoint).
 */

import { broadcast } from "./ws-hub"
import { upsertTokenUsage } from "../db/queries"
import { createLogger } from "../utils/logger"
import type { Agent, ZerabotEvent } from "@zerobot/shared"

const log = createLogger("AgentExec")

// ── Provider endpoints ────────────────────────────────────────────────────────

const ENDPOINTS: Record<string, string> = {
  openai:      "https://api.openai.com/v1/chat/completions",
  openrouter:  "https://openrouter.ai/api/v1/chat/completions",
  google:      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  anthropic:   "https://api.anthropic.com/v1/messages",
}

const API_KEYS: Record<string, string | undefined> = {
  openai:      process.env.OPENAI_API_KEY,
  openrouter:  process.env.OPENROUTER_API_KEY,
  google:      process.env.GOOGLE_AI_API_KEY ?? process.env.GOOGLE_API_KEY,
  anthropic:   process.env.ANTHROPIC_API_KEY,
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function executeTask(
  agent: Agent,
  prompt: string,
  runId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { provider, model } = parseModel(agent.model)
  const apiKey = API_KEYS[provider]

  if (!apiKey) {
    const err = `No API key for provider: ${provider}`
    log.error(err, { agentId: agent.id, runId })
    emitError(runId, agent.id, err)
    return { ok: false, error: err }
  }

  emitStatus(runId, agent.id, "running")
  log.info("Executing task directly", { agentId: agent.id, provider, model, runId })

  try {
    if (provider === "anthropic") {
      await streamAnthropic(agent, model, prompt, runId, apiKey)
    } else {
      await streamOpenAI(agent, model, prompt, runId, ENDPOINTS[provider]!, apiKey)
    }
    emitStatus(runId, agent.id, "done")
    return { ok: true }
  } catch (err) {
    const msg = String(err)
    log.error("Task execution failed", { agentId: agent.id, runId, err: msg })
    emitError(runId, agent.id, msg)
    return { ok: false, error: msg }
  }
}

// ── Anthropic streaming ───────────────────────────────────────────────────────

async function streamAnthropic(
  agent: Agent,
  model: string,
  prompt: string,
  runId: string,
  apiKey: string,
): Promise<void> {
  const systemParts: string[] = []
  if (agent.soul) systemParts.push(agent.soul)
  if (agent.mission) systemParts.push(agent.mission)
  if (agent.instructions) systemParts.push(agent.instructions)

  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    stream: true,
    messages: [{ role: "user", content: prompt }],
  }
  if (systemParts.length > 0) body.system = systemParts.join("\n\n")

  const res = await fetch(ENDPOINTS.anthropic, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Anthropic ${res.status}: ${text}`)
  }

  let fullContent = ""
  let inputTokens = 0
  let outputTokens = 0

  for await (const rawChunk of parseSse(res.body)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunk = rawChunk as any
    if (chunk.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
      const text = chunk.delta.text as string
      fullContent += text
      emitChunk(runId, agent.id, text)
    } else if (chunk.type === "message_delta" && chunk.usage) {
      outputTokens = (chunk.usage.output_tokens as number) ?? 0
    } else if (chunk.type === "message_start" && chunk.message?.usage) {
      inputTokens = (chunk.message.usage.input_tokens as number) ?? 0
      outputTokens = (chunk.message.usage.output_tokens as number) ?? 0
    }
  }

  emitFinalMessage(runId, agent.id, fullContent, model, inputTokens + outputTokens)
}

// ── OpenAI-compatible streaming ───────────────────────────────────────────────

async function streamOpenAI(
  agent: Agent,
  model: string,
  prompt: string,
  runId: string,
  endpoint: string,
  apiKey: string,
): Promise<void> {
  const messages: Array<{ role: string; content: string }> = []

  const systemParts: string[] = []
  if (agent.soul) systemParts.push(agent.soul)
  if (agent.mission) systemParts.push(agent.mission)
  if (agent.instructions) systemParts.push(agent.instructions)
  if (systemParts.length > 0) {
    messages.push({ role: "system", content: systemParts.join("\n\n") })
  }
  messages.push({ role: "user", content: prompt })

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal: AbortSignal.timeout(300_000),
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${endpoint} ${res.status}: ${text}`)
  }

  let fullContent = ""
  let totalTokens = 0

  for await (const rawChunk of parseSse(res.body)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunk = rawChunk as any
    const delta = chunk.choices?.[0]?.delta?.content
    if (typeof delta === "string" && delta) {
      fullContent += delta
      emitChunk(runId, agent.id, delta)
    }
    if (chunk.usage?.total_tokens) {
      totalTokens = chunk.usage.total_tokens as number
    }
  }

  emitFinalMessage(runId, agent.id, fullContent, model, totalTokens)
}

// ── SSE parser ────────────────────────────────────────────────────────────────

async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })

      const lines = buf.split("\n")
      buf = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        const data = line.slice(6).trim()
        if (data === "[DONE]") return
        try {
          yield JSON.parse(data) as Record<string, unknown>
        } catch { /* malformed chunk */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── Event emission ────────────────────────────────────────────────────────────

function emit(event: ZerabotEvent): void {
  // broadcast() in ws-hub already calls insertEvent — no double-insert needed
  broadcast(event)
}

function emitChunk(runId: string, agentId: string, delta: string): void {
  // Stream chunks directly — no persistence per chunk (avoids DB bloat)
  const event: ZerabotEvent = {
    id: `${runId}-chunk-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    ts: Date.now(),
    agentId,
    type: "session.message",
    severity: "info",
    payload: { role: "assistant", content: delta, delta: true },
    tokenUsed: 0,
  }
  broadcast(event)
}

function emitFinalMessage(
  runId: string,
  agentId: string,
  content: string,
  model: string,
  tokens: number,
): void {
  const event: ZerabotEvent = {
    id: `${runId}-final`,
    ts: Date.now(),
    agentId,
    type: "session.message",
    severity: "info",
    payload: { role: "assistant", content, model },
    tokenUsed: tokens,
  }
  emit(event)

  if (tokens > 0) {
    const hourBucket = Math.floor(event.ts / 3_600_000) * 3_600_000
    upsertTokenUsage(hourBucket, agentId, model, tokens, 0)
  }
}

function emitStatus(runId: string, agentId: string, status: string): void {
  const event: ZerabotEvent = {
    id: `${runId}-status-${status}`,
    ts: Date.now(),
    agentId,
    type: "agent.status",
    severity: "info",
    payload: { event: status },
    tokenUsed: 0,
  }
  emit(event)
}

function emitError(runId: string, agentId: string, message: string): void {
  const event: ZerabotEvent = {
    id: `${runId}-error-${Date.now()}`,
    ts: Date.now(),
    agentId,
    type: "agent.error",
    severity: "error",
    payload: { message },
    tokenUsed: 0,
  }
  emit(event)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseModel(model: string): { provider: string; model: string } {
  if (model.startsWith("anthropic/")) return { provider: "anthropic", model: model.slice(10) }
  if (model.startsWith("openai/"))    return { provider: "openai",    model: model.slice(7)  }
  if (model.startsWith("google/"))    return { provider: "google",    model: model.slice(7)  }
  // Default to openrouter for any other prefix or bare model names
  const slash = model.indexOf("/")
  return { provider: "openrouter", model: slash >= 0 ? model : model }
}
