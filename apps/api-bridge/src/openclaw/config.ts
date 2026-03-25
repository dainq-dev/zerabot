import path from "path"
import fs from "fs/promises"
import os from "os"
import type { Agent } from "@zerobot/shared"

/** Expand leading `~` or `~/` to the actual home directory */
function resolveTilde(p: string): string {
  if (p === "~") return os.homedir()
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2))
  return p
}

const OPENCLAW_HOME = resolveTilde(
  process.env.OPENCLAW_HOME ?? path.join(os.homedir(), ".openclaw"),
)

const CONFIG_PATH = path.join(OPENCLAW_HOME, "openclaw.json")

// ── OpenClaw config (openclaw.json) ─────────────────────────────────────────

export async function readConfig(): Promise<Record<string, unknown>> {
  try {
    const text = await fs.readFile(CONFIG_PATH, "utf-8")
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function writeConfig(config: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true })
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2))
}

export async function patchConfig(patch: Record<string, unknown>): Promise<void> {
  const current = await readConfig()
  await writeConfig(deepMerge(current, patch))
}

// ── Tool profile → OpenClaw tools config mapping ────────────────────────────

/**
 * Tool profile → OpenClaw tools config mapping.
 *
 * OpenClaw profiles: full, coding, messaging, minimal.
 * OpenClaw groups:   group:web, group:fs, group:runtime, group:sessions,
 *                    group:memory, group:ui, group:automation, group:messaging,
 *                    group:nodes, group:openclaw.
 *
 * Research note: OpenClaw `browser` = Playwright (real browser, JS-capable,
 * handles dynamic pages + login walls). `group:automation` adds GCP-based
 * search pipelines. Both are far superior to plain web_fetch for research.
 *
 * Mapping rationale:
 *   minimal   → minimal profile, deny browser + exec
 *   standard  → coding profile + web/browser for light research
 *   coding    → coding profile, fs + runtime, no browser (dev tools)
 *   messaging → minimal profile + messaging/sessions groups only
 *   full      → full profile, all tools incl. Playwright + GCP automation
 *   custom    → full profile, toolsAllow/toolsDeny from agent definition
 */
const TOOL_PROFILE_MAP: Record<string, { profile: string; allow: string[]; deny: string[] }> = {
  minimal: {
    profile: "minimal",
    allow: [],
    deny: ["exec", "browser"],
  },
  standard: {
    profile: "coding",
    allow: [
      "group:web", "browser", "web_search", "web_fetch",
      "group:fs", "group:memory",
    ],
    deny: [],
  },
  research: {
    // Read & analyse web — browser + memory + sessions, no exec/fs
    profile: "full",
    allow: [
      "group:web", "browser",
      "web_search", "web_fetch",
      "group:memory",   // nhớ context giữa runs
      "group:sessions", // spawn sub-agents
    ],
    deny: ["exec", "group:fs"],
  },
  crawl: {
    // Deep data collection — browser + exec + GCP automation
    profile: "full",
    allow: [
      "group:web", "browser",
      "web_search", "web_fetch",
      "exec",              // curl, jq cho JSON APIs
      "group:automation",  // GCP-backed search pipeline
      "group:memory",
    ],
    deny: [],
  },
  coding: {
    profile: "coding",
    allow: ["group:fs", "group:runtime", "group:memory", "exec"],
    deny: ["browser"],
  },
  messaging: {
    profile: "minimal",
    allow: ["group:messaging", "group:sessions"],
    deny: ["exec", "browser"],
  },
  full: {
    // Playwright browser + GCP-backed automation for deep research
    profile: "full",
    allow: [
      "group:web", "browser", "web_search", "web_fetch",
      "exec", "group:fs", "group:memory", "group:sessions",
      "group:automation",  // Playwright + GCP search pipeline
    ],
    deny: [],
  },
  custom: {
    profile: "full",
    allow: [],
    deny: [],
  },
}

// ── Per-agent config generation ─────────────────────────────────────────────

/**
 * Build an agent list entry for OpenClaw `agents.list[]`.
 * Does NOT write to disk — use `writeGatewayConfig` for that.
 * `id` is included in the entry (list format, not flat map).
 */
export function buildAgentEntry(agent: Agent): Record<string, unknown> {
  const preset = TOOL_PROFILE_MAP[agent.toolsProfile] ?? TOOL_PROFILE_MAP.minimal

  // For custom profile, merge agent's allow/deny lists
  const allow = agent.toolsProfile === "custom"
    ? [...preset.allow, ...agent.toolsAllow]
    : preset.allow

  const deny = agent.toolsProfile === "custom"
    ? [...preset.deny, ...agent.toolsDeny]
    : preset.deny

  // Flat map entry — id is the map key, not included in the value
  const entry: Record<string, unknown> = {
    toolsProfile: preset.profile,
    ...(allow.length > 0 ? { toolsAllow: allow } : {}),
    ...(deny.length > 0 ? { toolsDeny: deny } : {}),
    workspace: path.join(OPENCLAW_HOME, "workspace"),
  }

  // Model — OpenClaw expects a plain string, e.g. "openai/gpt-4o-mini"
  const { provider, model } = parseModelProvider(agent.model)
  entry.model = `${provider}/${model}`

  // System prompt
  const parts: string[] = []
  if (agent.soul) parts.push(agent.soul)
  if (agent.mission) parts.push(agent.mission)
  if (agent.instructions) parts.push(agent.instructions)
  if (parts.length > 0) entry.systemPrompt = parts.join("\n\n")

  return entry
}

/**
 * Writes the full OpenClaw gateway config (`openclaw.json`).
 * Format: agents = { defaults: { workspace }, list: [{ id, model, ... }] }
 * Preserves existing gateway auth config (token from onboarding, etc).
 */
export async function writeGatewayConfig(
  agents: (Agent & { port?: number })[],
  mcpServers?: Array<{
    id: string; transport: string; command?: string;
    args?: string[]; env?: Record<string, string>;
    url?: string; autoConnect?: boolean
  }>,
): Promise<void> {
  const current = await readConfig()

  // OpenClaw agents format: flat map { "agent-id": { model, toolsProfile, ... } }
  // Validated with `openclaw config validate` — { defaults, list[] } format is INVALID
  const agentsConfig: Record<string, unknown> = {}
  for (const agent of agents) {
    agentsConfig[agent.id] = buildAgentEntry(agent)
  }

  // Browser config — Playwright-based, optimised for research tasks
  const browserConfig: Record<string, unknown> = {
    enabled: true,
    headless: true,
    searchEngine: "google",
    gcpSearch: process.env.GOOGLE_CLOUD_PROJECT ? true : false,
    pageTimeoutMs: 30_000,
  }

  // MCP/Plugins
  const plugins: Record<string, unknown> = {}
  if (mcpServers && mcpServers.length > 0) {
    const entries: Record<string, unknown> = {}
    for (const s of mcpServers) {
      const pluginEntry: Record<string, unknown> = {
        transport: s.transport,
        autoConnect: s.autoConnect ?? true,
      }
      if (s.command) pluginEntry.command = s.command
      if (s.args?.length) pluginEntry.args = s.args
      if (s.env && Object.keys(s.env).length > 0) pluginEntry.env = s.env
      if (s.url) pluginEntry.url = s.url
      entries[s.id] = pluginEntry
    }
    plugins.entries = entries
  }

  // Preserve existing gateway config (auth token from onboarding, etc.)
  const currentGateway = (current.gateway ?? {}) as Record<string, unknown>

  const config: Record<string, unknown> = {
    ...current,
    agents: agentsConfig,
    gateway: {
      ...currentGateway,
      bind: currentGateway.bind ?? "loopback",
      mode: currentGateway.mode ?? "local",
      port: parseInt(process.env.OPENCLAW_PORT ?? "18789", 10),
    },
    browser: browserConfig,
    ...(Object.keys(plugins).length > 0 ? { plugins } : {}),
  }

  await writeConfig(config)
}

/**
 * Writes per-agent workspace files (SYSTEM_PROMPT.md, skills, etc).
 */
export async function writeAgentWorkspace(
  agent: Agent,
  configDir: string,
): Promise<void> {
  await fs.mkdir(configDir, { recursive: true })
  await fs.mkdir(path.join(configDir, "workspace"), { recursive: true })

  // System prompt
  const parts: string[] = []
  if (agent.soul) parts.push(`## Personality\n${agent.soul}`)
  if (agent.mission) parts.push(`## Mission\n${agent.mission}`)
  if (agent.instructions) parts.push(`## Instructions\n${agent.instructions}`)
  if (parts.length > 0) {
    await fs.writeFile(path.join(configDir, "SYSTEM_PROMPT.md"), parts.join("\n\n"))
  }
}

// Keep backward-compatible export name for agent-sync.ts
export const writeAgentConfig = async (
  agent: Agent & { port?: number },
  configDir: string,
  _port?: number,
): Promise<void> => {
  await writeAgentWorkspace(agent, configDir)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseModelProvider(model: string): { provider: string; model: string } {
  if (model.startsWith("anthropic/")) return { provider: "anthropic", model: model.slice("anthropic/".length) }
  if (model.startsWith("openai/")) return { provider: "openai", model: model.slice("openai/".length) }
  if (model.startsWith("google/")) return { provider: "google", model: model.slice("google/".length) }
  return { provider: "openrouter", model }
}

/**
 * Deep merge two plain objects (arrays are replaced, not merged).
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target }
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      )
    } else {
      result[key] = value
    }
  }
  return result
}
