/**
 * Direct AI execution for agent tasks.
 *
 * OpenClaw v0.1.0 gateway never loads agents from openclaw.json config into
 * its runtime — `state.agents` is always empty, so `session.message` always
 * returns "Agent not found". This service bypasses the gateway for execution
 * and calls AI providers directly, streaming events to the WS hub.
 *
 * Supports: Anthropic, OpenAI, OpenRouter, Google (via OpenAI-compat endpoint).
 *
 * Tools (registered in TOOL_REGISTRY):
 *   web_search       — Brave → Exa → Tavily → DuckDuckGo (weighted fallback chain)
 *   web_fetch        — HTTP GET with LRU cache (200 entries, 5 min TTL)
 *   firecrawl_scrape — Deep crawl via Firecrawl API (rate-limited: 10 burst / 0.5 rps)
 *   api_fetch        — JSON API call with custom headers (Vietnamese financial APIs etc.)
 */

import { broadcast, broadcastLive } from "./ws-hub"
import { upsertTokenUsage, updateTaskRunById } from "../db/queries"
import { createLogger } from "../utils/logger"
import { LruCache } from "../utils/lru-cache"
import { TokenBucket } from "../utils/rate-limiter"
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

// ── External service keys ──────────────────────────────────────────────────────

const BRAVE_API_KEY      = process.env.BRAVE_SEARCH_API_KEY
const EXA_API_KEY        = process.env.EXA_API_KEY
const TAVILY_API_KEY     = process.env.TAVILY_API_KEY
const FIRECRAWL_API_KEY  = process.env.FIRECRAWL_API_KEY

// ── Shared caches & rate limiters ─────────────────────────────────────────────

// LRU cache for web_fetch results: 200 entries, 5-min TTL
const fetchCache = new LruCache<string, string>(200, 5 * 60 * 1_000)

// Token bucket for Firecrawl: 10 burst, 0.5 rps (1 req/2s steady)
const firecrawlBucket = new TokenBucket(10, 0.5)

// ── Intent detection ─────────────────────────────────────────────────────────

type TaskIntent = "lookup_current" | "lookup_historical" | "research" | "crawl" | "conversation"

/**
 * Heuristic intent detection — O(1) per signal via Set lookup.
 * No extra LLM call needed.
 */
function detectIntent(prompt: string): TaskIntent {
  const lower = prompt.toLowerCase()

  const researchSet = new Set([
    "phân tích", "nghiên cứu", "báo cáo", "tổng hợp", "so sánh",
    "đánh giá", "xu hướng", "dự báo", "chiến lược", "toàn diện",
    "analyze", "research", "report", "comprehensive", "deep dive", "trends",
  ])
  const crawlSet = new Set([
    "crawl", "thu thập", "cào dữ liệu", "scrape", "lấy dữ liệu", "harvest",
    "collect", "import dữ liệu", "nhập liệu", "lưu vào", "post về",
  ])
  const currentSet = new Set([
    "hôm nay", "hiện tại", "bây giờ", "lúc này", "mới nhất", "cập nhật", "live",
    "today", "now", "current", "latest", "real-time",
  ])
  const lookupSet = new Set(["giá", "tỷ giá", "thị trường", "price", "rate"])

  if (crawlSet.has(lower) || [...crawlSet].some(s => lower.includes(s))) return "crawl"
  if ([...researchSet].some(s => lower.includes(s))) return "research"

  // Historical: has specific past year/date
  const yearMatch = lower.match(/\b(20[012]\d)\b/)
  const currentYear = new Date().getFullYear()
  const isHistorical =
    yearMatch && parseInt(yearMatch[1]) < currentYear - 1 ||
    /\d{1,2}\/\d{1,2}\/20\d{2}|tháng\s+\d{1,2}\/20\d{2}/.test(lower)

  if (isHistorical && [...lookupSet].some(s => lower.includes(s))) return "lookup_historical"
  if ([...currentSet].some(s => lower.includes(s)) || [...lookupSet].some(s => lower.includes(s))) return "lookup_current"
  return "conversation"
}

/**
 * Build an effective system prompt based on task intent.
 */
function buildSystemPrompt(agent: Agent, intent: TaskIntent): string {
  const persona  = agent.soul?.trim()
  const mission  = agent.mission?.trim()
  const guidance = agent.instructions?.trim()
  const parts: string[] = []

  if (intent === "lookup_current") {
    if (persona) parts.push(persona)
    parts.push(
      "## Nhiệm vụ: TRA CỨU DỮ LIỆU HIỆN TẠI\n" +
      "Hành động ngay, không cần kế hoạch.\n\n" +
      "Ưu tiên: dùng `api_fetch` hoặc `web_fetch` trực tiếp vào nguồn (real-time).\n\n" +
      "## API & Nguồn real-time Việt Nam\n" +
      "- Giá vàng SJC (JSON): https://sjc.com.vn/GoldPrice/Services/PriceService.ashx\n" +
      "- Giá vàng PNJ: https://www.pnj.com.vn/blog/gia-vang/\n" +
      "- Tỷ giá Vietcombank: https://vietcombank.com.vn/vi/KHCN/Cong-cu-Tien-ich/Ty-gia\n" +
      "- Chứng khoán: https://vietstock.vn/, https://cafef.vn/\n\n" +
      "⚠ Các API này CHỈ trả về giá HIỆN TẠI. Trả lời TRỰC TIẾP với số liệu + nguồn + thời điểm.",
    )
  } else if (intent === "lookup_historical") {
    if (persona) parts.push(persona)
    parts.push(
      "## Nhiệm vụ: TRA CỨU DỮ LIỆU LỊCH SỬ\n" +
      "⚠ Các API real-time CHỈ trả về giá hiện tại — KHÔNG dùng cho dữ liệu lịch sử.\n\n" +
      "Cách tìm:\n" +
      "1. `web_search` với query: 'giá vàng SJC [ngày/tháng/năm] site:vnexpress.net OR site:cafef.vn'\n" +
      "2. `web_fetch` hoặc `firecrawl_scrape` bài báo lưu trữ tìm được\n" +
      "3. Không tìm được → thành thật nói không có dữ liệu. KHÔNG bịa số liệu.",
    )
  } else if (intent === "crawl") {
    if (persona) parts.push(persona)
    if (guidance) parts.push(guidance)
    parts.push(
      "## Nhiệm vụ: THU THẬP DỮ LIỆU\n" +
      "Thu thập và chuẩn hoá dữ liệu theo cấu trúc JSON để nhập vào hệ thống.\n\n" +
      "Tool ưu tiên:\n" +
      "- `firecrawl_scrape` — trang JS-heavy, bài báo, trang động\n" +
      "- `api_fetch` — JSON endpoints, REST APIs\n" +
      "- `web_fetch` — trang tĩnh đơn giản\n" +
      "- `web_search` — tìm URL nguồn trước khi scrape\n\n" +
      "Output PHẢI là JSON hợp lệ với cấu trúc:\n" +
      "{ \"source\": string, \"category\": string, \"items\": [{ \"url\", \"title\", \"content\", \"structured_data\", \"published_at\" }] }\n\n" +
      "Sau khi thu thập xong, POST kết quả tới: POST http://localhost:3001/api/data/ingest",
    )
  } else if (intent === "research") {
    if (persona)  parts.push(persona)
    if (mission)  parts.push(mission)
    if (guidance) parts.push(guidance)
    parts.push(
      "## Yêu cầu bắt buộc\n" +
      "Mọi phân tích PHẢI dựa trên dữ liệu thu thập thực từ web (web_search, web_fetch, firecrawl_scrape).\n" +
      "Không đưa kết luận chỉ từ kiến thức training. Thu thập dữ liệu trước, phân tích sau.",
    )
  } else {
    if (persona) parts.push(persona)
    if (mission) parts.push(mission)
  }

  return parts.join("\n\n")
}

// ── Tool schemas ──────────────────────────────────────────────────────────────

const TOOL_SCHEMAS: Record<string, { type: "object"; properties: Record<string, unknown>; required: string[] }> = {
  web_search: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query (Vietnamese or English)" },
    },
    required: ["query"],
  },
  web_fetch: {
    type: "object",
    properties: {
      url: { type: "string", description: "Full URL to fetch" },
    },
    required: ["url"],
  },
  firecrawl_scrape: {
    type: "object",
    properties: {
      url:     { type: "string",  description: "URL to deep-scrape (handles JS, removes ads/nav)" },
      markdown:{ type: "boolean", description: "Return as Markdown (default true)" },
    },
    required: ["url"],
  },
  api_fetch: {
    type: "object",
    properties: {
      url:     { type: "string", description: "API endpoint URL" },
      headers: { type: "object", description: "Optional HTTP headers (key-value)", additionalProperties: { type: "string" } },
      method:  { type: "string", enum: ["GET", "POST"], description: "HTTP method (default GET)" },
      body:    { type: "string", description: "Request body for POST (JSON string)" },
    },
    required: ["url"],
  },
}

/** Build tool list in OpenAI or Anthropic format from the shared schema registry. */
function buildTools(format: "openai" | "anthropic"): unknown[] {
  const descriptions: Record<string, string> = {
    web_search:       "Search the web for current, real-time information. Use for news, prices, statistics.",
    web_fetch:        "Fetch and read the text content of a specific URL.",
    firecrawl_scrape: "Deep scrape a URL — handles JS-heavy pages, removes ads/nav. Returns clean Markdown. Use for news articles, dynamic pages.",
    api_fetch:        "Call a JSON API endpoint with optional custom headers. Use for Vietnamese financial APIs (SJC, Vietcombank, VNDirect), structured data sources.",
  }

  return Object.entries(TOOL_SCHEMAS).map(([name, schema]) =>
    format === "openai"
      ? { type: "function", function: { name, description: descriptions[name], parameters: schema } }
      : { name, description: descriptions[name], input_schema: schema },
  )
}

// ── Search providers (weighted fallback chain) ────────────────────────────────

type SearchProvider = {
  name: string
  available: () => boolean
  search: (query: string) => Promise<string>
}

// Sorted by priority (ascending) at module load — O(k log k) once
const SEARCH_PROVIDERS: SearchProvider[] = [
  {
    name: "brave",
    available: () => !!BRAVE_API_KEY,
    search: async (query) => {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6&country=vn&search_lang=vi`,
        {
          headers: { "Accept": "application/json", "X-Subscription-Token": BRAVE_API_KEY! },
          signal: AbortSignal.timeout(10_000),
        },
      )
      const data = await res.json() as { web?: { results?: Array<{ title: string; description: string; url: string }> } }
      const results = data.web?.results ?? []
      if (!results.length) return ""
      return results.slice(0, 5).map(r => `**${r.title}**\n${r.description}\n${r.url}`).join("\n\n")
    },
  },
  {
    name: "exa",
    available: () => !!EXA_API_KEY,
    search: async (query) => {
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": EXA_API_KEY! },
        body: JSON.stringify({ query, numResults: 5, useAutoprompt: true }),
        signal: AbortSignal.timeout(12_000),
      })
      const data = await res.json() as { results?: Array<{ title: string; url: string; snippet?: string }> }
      const results = data.results ?? []
      if (!results.length) return ""
      return results.map(r => `**${r.title}**\n${r.snippet ?? ""}\n${r.url}`).join("\n\n")
    },
  },
  {
    name: "tavily",
    available: () => !!TAVILY_API_KEY,
    search: async (query) => {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: TAVILY_API_KEY, query, max_results: 5, search_depth: "basic" }),
        signal: AbortSignal.timeout(15_000),
      })
      const data = await res.json() as { results?: Array<{ title: string; url: string; content: string }> }
      const results = data.results ?? []
      if (!results.length) return ""
      return results.map(r => `**${r.title}**\n${r.content}\n${r.url}`).join("\n\n")
    },
  },
  {
    name: "ddg",
    available: () => true,
    search: async (query) => {
      const res = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        {
          headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(10_000),
        },
      )
      const data = await res.json() as {
        Abstract?: string; AbstractURL?: string; AbstractSource?: string
        Answer?: string
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>
      }
      const parts: string[] = []
      if (data.Answer)   parts.push(`**Answer**: ${data.Answer}`)
      if (data.Abstract) parts.push(`**${data.AbstractSource ?? "Source"}**: ${data.Abstract}\n${data.AbstractURL ?? ""}`)
      ;(data.RelatedTopics ?? []).slice(0, 3).forEach(t => {
        if (t.Text) parts.push(`- ${t.Text}\n  ${t.FirstURL ?? ""}`)
      })
      return parts.join("\n\n")
    },
  },
]

// ── Tool executors ────────────────────────────────────────────────────────────

async function executeSearch(args: Record<string, unknown>): Promise<string> {
  const query = String(args.query ?? "")
  for (const p of SEARCH_PROVIDERS) {
    if (!p.available()) continue
    try {
      const result = await p.search(query)
      if (result) return result
    } catch { /* try next */ }
  }
  return "No results found. Try using web_fetch with a direct URL."
}

async function executeFetch(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? "")

  const cached = fetchCache.get(url)
  if (cached !== undefined) return cached

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/json,*/*",
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return `HTTP ${res.status}: ${res.statusText}`

    const contentType = res.headers.get("content-type") ?? ""
    const body = await res.text()
    let result: string

    if (contentType.includes("json") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
      result = body.slice(0, 8_000)
    } else {
      result = body
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
        .replace(/&#\d+;/g, "").replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, 8_000)
        || "Empty page content."
    }

    fetchCache.set(url, result)
    return result
  } catch (err) {
    return `Fetch error: ${String(err)}`
  }
}

async function executeFirecrawl(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? "")

  if (!FIRECRAWL_API_KEY) {
    // Graceful degradation: fall back to plain web_fetch
    log.warn("Firecrawl API key not set, falling back to web_fetch", { url })
    return executeFetch({ url })
  }

  if (!firecrawlBucket.consume()) {
    return "Rate limited: Firecrawl (too many requests). Try again shortly."
  }

  // Check fetch cache first (Firecrawl results also cached)
  const cacheKey = `firecrawl:${url}`
  const cached = fetchCache.get(cacheKey)
  if (cached !== undefined) return cached

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${FIRECRAWL_API_KEY}` },
      body: JSON.stringify({ url, formats: ["markdown"] }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      return `Firecrawl error ${res.status}: ${text}`
    }

    const data = await res.json() as { data?: { markdown?: string; content?: string } }
    const content = (data.data?.markdown ?? data.data?.content ?? "").slice(0, 10_000)

    fetchCache.set(cacheKey, content)
    return content || "Empty page content."
  } catch (err) {
    return `Firecrawl error: ${String(err)}`
  }
}

async function executeApiFetch(args: Record<string, unknown>): Promise<string> {
  const url     = String(args.url ?? "")
  const method  = (args.method as string | undefined) ?? "GET"
  const headers = (args.headers as Record<string, string> | undefined) ?? {}
  const body    = args.body as string | undefined

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
        ...headers,
      },
      body: method === "POST" && body ? body : undefined,
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) return `HTTP ${res.status}: ${res.statusText}`

    const text = await res.text()
    return text.slice(0, 8_000)
  } catch (err) {
    return `API fetch error: ${String(err)}`
  }
}

/** Central tool dispatcher — keyed by tool name. */
async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "web_search":       return executeSearch(args)
    case "web_fetch":        return executeFetch(args)
    case "firecrawl_scrape": return executeFirecrawl(args)
    case "api_fetch":        return executeApiFetch(args)
    default:                 return `Unknown tool: ${name}`
  }
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
  updateTaskRunById(runId, { status: "running" })
  log.info("Executing task", { agentId: agent.id, provider, model, runId })

  try {
    const tokens = provider === "anthropic"
      ? await runAnthropic(agent, model, prompt, runId, apiKey)
      : await runOpenAI(agent, model, prompt, runId, ENDPOINTS[provider]!, apiKey)
    emitStatus(runId, agent.id, "done")
    updateTaskRunById(runId, { status: "done", finishedAt: Date.now(), tokenUsed: tokens })
    return { ok: true }
  } catch (err) {
    const msg = String(err)
    log.error("Task execution failed", { agentId: agent.id, runId, err: msg })
    emitError(runId, agent.id, msg)
    updateTaskRunById(runId, { status: "error", finishedAt: Date.now(), error: msg })
    return { ok: false, error: msg }
  }
}

// ── OpenAI-compatible (tool loop) ────────────────────────────────────────────

type OaiMessage = Record<string, unknown>

async function runOpenAI(
  agent: Agent,
  model: string,
  prompt: string,
  runId: string,
  endpoint: string,
  apiKey: string,
): Promise<number> {
  const intent = detectIntent(prompt)
  const systemPrompt = buildSystemPrompt(agent, intent)
  log.debug("Intent detected", { agentId: agent.id, runId, intent })

  const messages: OaiMessage[] = []
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt })
  messages.push({ role: "user", content: prompt })

  let totalTokens = 0
  const MAX_STEPS = 10

  for (let step = 0; step < MAX_STEPS; step++) {
    const isLastStep = step === MAX_STEPS - 1

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, messages,
        tools: buildTools("openai"),
        tool_choice: isLastStep ? "none" : "auto",
        stream: false,
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`${endpoint} ${res.status}: ${text}`)
    }

    const data = await res.json() as {
      choices: Array<{
        message: {
          role: string
          content: string | null
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
        }
        finish_reason: string
      }>
      usage?: { total_tokens: number }
    }

    totalTokens += data.usage?.total_tokens ?? 0
    const msg = data.choices[0]?.message
    if (!msg) throw new Error("Empty response from API")
    messages.push(msg as OaiMessage)

    if (msg.tool_calls?.length && !isLastStep) {
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
        emitToolCall(runId, agent.id, tc.function.name, args)
        const result = await executeTool(tc.function.name, args)
        emitToolResult(runId, agent.id, result)
        messages.push({ role: "tool", tool_call_id: tc.id, content: result })
      }
    } else {
      const content = msg.content ?? ""
      if (content) await streamFinalText(runId, agent.id, content)
      emitFinalMessage(runId, agent.id, content, model, totalTokens)
      return totalTokens
    }
  }

  return totalTokens
}

// ── Anthropic (tool loop) ─────────────────────────────────────────────────────

type AnthMessage = { role: string; content: unknown }

async function runAnthropic(
  agent: Agent,
  model: string,
  prompt: string,
  runId: string,
  apiKey: string,
): Promise<number> {
  const intent = detectIntent(prompt)
  const systemPrompt = buildSystemPrompt(agent, intent)
  log.debug("Intent detected", { agentId: agent.id, runId, intent })

  const messages: AnthMessage[] = [{ role: "user", content: prompt }]
  let totalTokens = 0
  const MAX_STEPS = 10

  for (let step = 0; step < MAX_STEPS; step++) {
    const isLastStep = step === MAX_STEPS - 1

    const body: Record<string, unknown> = {
      model, max_tokens: 4096, stream: false, messages,
    }
    if (systemPrompt) body.system = systemPrompt
    if (!isLastStep) {
      body.tools = buildTools("anthropic")
      body.tool_choice = { type: "auto" }
    }

    const res = await fetch(ENDPOINTS.anthropic, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new Error(`Anthropic ${res.status}: ${text}`)
    }

    const data = await res.json() as {
      content: Array<{
        type: string; text?: string
        id?: string; name?: string; input?: Record<string, unknown>
      }>
      stop_reason: string
      usage: { input_tokens: number; output_tokens: number }
    }

    totalTokens += (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
    messages.push({ role: "assistant", content: data.content })

    if (data.stop_reason === "tool_use" && !isLastStep) {
      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = []
      for (const block of data.content) {
        if (block.type === "tool_use" && block.id && block.name) {
          emitToolCall(runId, agent.id, block.name, block.input ?? {})
          const result = await executeTool(block.name, block.input ?? {})
          emitToolResult(runId, agent.id, result)
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result })
        }
      }
      messages.push({ role: "user", content: toolResults })
    } else {
      const textBlock = data.content.find(b => b.type === "text")
      const content = textBlock?.text ?? ""
      if (content) await streamFinalText(runId, agent.id, content)
      emitFinalMessage(runId, agent.id, content, model, totalTokens)
      return totalTokens
    }
  }

  return totalTokens
}

// ── Fake-stream final text (word-by-word for live UX) ─────────────────────────

async function streamFinalText(runId: string, agentId: string, text: string): Promise<void> {
  const chunks = text.match(/\S+\s*/g) ?? []
  for (const chunk of chunks) {
    emitChunk(runId, agentId, chunk)
  }
}

// ── Event emission ────────────────────────────────────────────────────────────

function emit(event: ZerabotEvent): void {
  broadcast(event)
}

function emitChunk(runId: string, agentId: string, delta: string): void {
  broadcastLive({
    id: `${runId}-chunk-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    ts: Date.now(), agentId,
    type: "session.message", severity: "info",
    payload: { role: "assistant", content: delta, delta: true },
    tokenUsed: 0,
  })
}

function emitFinalMessage(runId: string, agentId: string, content: string, model: string, tokens: number): void {
  const event: ZerabotEvent = {
    id: `${runId}-final`, ts: Date.now(), agentId,
    type: "session.message", severity: "info",
    payload: { role: "assistant", content, model },
    tokenUsed: tokens,
  }
  emit(event)

  if (tokens > 0) {
    const hourBucket = Math.floor(event.ts / 3_600_000) * 3_600_000
    upsertTokenUsage(hourBucket, agentId, model, tokens, 0)
  }
}

function emitToolCall(runId: string, agentId: string, tool: string, input: Record<string, unknown>): void {
  emit({
    id: `${runId}-tool-call-${tool}-${Date.now()}`,
    ts: Date.now(), agentId,
    type: "tool.call", severity: "info",
    payload: { tool, input }, tokenUsed: 0,
  })
}

function emitToolResult(runId: string, agentId: string, output: string): void {
  const noResults = output.startsWith("No results") || output.startsWith("Search error") || output.startsWith("Fetch error")
  emit({
    id: `${runId}-tool-result-${Date.now()}`,
    ts: Date.now(), agentId,
    type: "tool.result", severity: noResults ? "warning" : "info",
    payload: { output: output.slice(0, 500), noResults },
    tokenUsed: 0,
  })
}

function emitStatus(runId: string, agentId: string, status: string): void {
  emit({
    id: `${runId}-status-${status}`,
    ts: Date.now(), agentId,
    type: "agent.status", severity: "info",
    payload: { event: status }, tokenUsed: 0,
  })
}

function emitError(runId: string, agentId: string, message: string): void {
  emit({
    id: `${runId}-error-${Date.now()}`,
    ts: Date.now(), agentId,
    type: "agent.error", severity: "error",
    payload: { message }, tokenUsed: 0,
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseModel(model: string): { provider: string; model: string } {
  if (model.startsWith("anthropic/")) return { provider: "anthropic", model: model.slice(10) }
  if (model.startsWith("openai/"))    return { provider: "openai",    model: model.slice(7)  }
  if (model.startsWith("google/"))    return { provider: "google",    model: model.slice(7)  }
  return { provider: "openrouter", model }
}
