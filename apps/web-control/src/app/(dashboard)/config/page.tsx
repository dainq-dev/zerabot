"use client"

import { useState, useEffect, useRef } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { configApi } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Save, RefreshCw, Download, Upload, Eye, EyeOff,
  Shield, AlertTriangle, Server, Key, Bot, Wrench,
  Archive, Terminal, Globe, Cpu, RotateCcw, Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Util ──────────────────────────────────────────────────────────────────────
function dig(obj: Record<string, unknown>, ...keys: string[]): unknown {
  return keys.reduce(
    (acc: unknown, k) =>
      acc && typeof acc === "object"
        ? (acc as Record<string, unknown>)[k]
        : undefined,
    obj,
  )
}

const str = (v: unknown, fallback = "") =>
  v !== undefined && v !== null ? String(v) : fallback
const num = (v: unknown, fallback = 0) =>
  typeof v === "number" ? v : fallback
const bool = (v: unknown, fallback = false) =>
  typeof v === "boolean" ? v : fallback

// ── Shared components ─────────────────────────────────────────────────────────
function SectionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="bg-card border border-border overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border bg-muted/30">
        {icon && (
          <span className="text-primary/80 [&_svg]:w-4 [&_svg]:h-4">{icon}</span>
        )}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
            {title}
          </h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </Card>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[220px_1fr] items-start gap-3 py-3 border-b border-border/30 last:border-0 last:pb-0 first:pt-0">
      <div className="pt-0.5">
        <Label className="text-sm text-foreground font-medium leading-none">
          {label}
        </Label>
        {hint && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {hint}
          </p>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function SecretInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative flex items-center">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("pr-9 font-mono text-sm", className)}
        placeholder={placeholder}
      />
      <button
        type="button"
        tabIndex={-1}
        className="absolute right-2.5 text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShow((s) => !s)}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  suffix,
  className,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  suffix?: string
  className?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn("w-28 font-mono text-sm", className)}
      />
      {suffix && (
        <span className="text-sm text-muted-foreground shrink-0">{suffix}</span>
      )}
    </div>
  )
}

function SaveRow({
  onSave,
  saving,
  label = "Save Changes",
}: {
  onSave: () => void
  saving: boolean
  label?: string
}) {
  return (
    <div className="flex justify-end pt-2">
      <Button
        onClick={onSave}
        disabled={saving}
        className="gap-2 uppercase tracking-wide"
      >
        <Save className={cn("w-4 h-4", saving && "animate-spin")} />
        {saving ? "Saving..." : label}
      </Button>
    </div>
  )
}

// ── MODEL LIST ────────────────────────────────────────────────────────────────
const MODEL_OPTIONS = [
  { value: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6 (Most capable)" },
  { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Balanced)" },
  { value: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5 (Fast & cheap)" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini (Fast & cheap)" },
  { value: "openai/o3-mini", label: "o3-mini (Reasoning)" },
  { value: "ollama/llama3.2", label: "Llama 3.2 (Local)" },
  { value: "ollama/qwen2.5", label: "Qwen 2.5 (Local)" },
  { value: "ollama/mistral", label: "Mistral (Local)" },
]

// ── TABS ──────────────────────────────────────────────────────────────────────

// ── Tab: Runtime ──────────────────────────────────────────────────────────────
function RuntimeTab({
  config,
  saving,
  onSave,
}: {
  config: Record<string, unknown>
  saving: boolean
  onSave: (patch: Record<string, unknown>) => void
}) {
  const rt = (dig(config, "runtime") ?? {}) as Record<string, unknown>
  const [logLevel, setLogLevel] = useState(str(rt.log_level, "info"))
  const [dataDir, setDataDir] = useState(str(rt.data_dir, "~/.zerabot"))

  useEffect(() => {
    setLogLevel(str(rt.log_level, "info"))
    setDataDir(str(rt.data_dir, "~/.zerabot"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const LOG_LEVEL_COLORS: Record<string, string> = {
    trace: "text-muted-foreground",
    debug: "text-green-400",
    info: "text-cyan-400",
    warn: "text-amber-400",
    error: "text-red-400",
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Runtime"
        description="Core ZeroClaw runtime settings"
        icon={<Terminal />}
      >
        <Field
          label="Log Level"
          hint="Verbosity of ZeroClaw logs. Use info for production, debug for troubleshooting."
        >
          <Select value={logLevel} onValueChange={setLogLevel}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["trace", "debug", "info", "warn", "error"] as const).map((lvl) => (
                <SelectItem key={lvl} value={lvl}>
                  <span className={cn("font-mono uppercase text-xs font-bold", LOG_LEVEL_COLORS[lvl])}>
                    {lvl}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    {{
                      trace: "— All internal details",
                      debug: "— Developer diagnostics",
                      info: "— Normal operation",
                      warn: "— Non-critical warnings",
                      error: "— Errors only",
                    }[lvl]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Data Directory"
          hint="Where ZeroClaw stores agents' workspaces, memory, and persistent data."
        >
          <Input
            value={dataDir}
            onChange={(e) => setDataDir(e.target.value)}
            className="font-mono text-sm"
            placeholder="~/.zerabot"
          />
        </Field>
      </SectionCard>

      <SaveRow
        onSave={() => onSave({ runtime: { log_level: logLevel, data_dir: dataDir } })}
        saving={saving}
      />
    </div>
  )
}

// ── Tab: Gateway ──────────────────────────────────────────────────────────────
function GatewayTab({
  config,
  saving,
  onSave,
}: {
  config: Record<string, unknown>
  saving: boolean
  onSave: (patch: Record<string, unknown>) => void
}) {
  const gw = (dig(config, "gateway") ?? {}) as Record<string, unknown>
  const gwAuth = (dig(config, "gateway", "auth") ?? {}) as Record<string, unknown>
  const gwRl = (dig(config, "gateway", "rate_limit") ?? {}) as Record<string, unknown>

  const [port, setPort] = useState(num(gw.port, 18789))
  const [bind, setBind] = useState(str(gw.bind, "loopback"))
  const [authMode, setAuthMode] = useState(str(gwAuth.mode, "token"))
  const [authToken, setAuthToken] = useState(str(gwAuth.token, ""))
  const [maxAttempts, setMaxAttempts] = useState(num(gwRl.max_attempts, 10))
  const [windowMs, setWindowMs] = useState(num(gwRl.window_ms, 60000))
  const [lockoutMs, setLockoutMs] = useState(num(gwRl.lockout_ms, 300000))

  useEffect(() => {
    setPort(num(gw.port, 18789))
    setBind(str(gw.bind, "loopback"))
    setAuthMode(str(gwAuth.mode, "token"))
    setAuthToken(str(gwAuth.token, ""))
    setMaxAttempts(num(gwRl.max_attempts, 10))
    setWindowMs(num(gwRl.window_ms, 60000))
    setLockoutMs(num(gwRl.lockout_ms, 300000))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const MS_OPTIONS = [
    { value: 30000, label: "30 seconds" },
    { value: 60000, label: "1 minute" },
    { value: 300000, label: "5 minutes" },
    { value: 600000, label: "10 minutes" },
  ]
  const LOCKOUT_OPTIONS = [
    { value: 60000, label: "1 minute" },
    { value: 300000, label: "5 minutes" },
    { value: 900000, label: "15 minutes" },
    { value: 1800000, label: "30 minutes" },
  ]

  const handleSave = () =>
    onSave({
      gateway: {
        port,
        bind,
        auth: { mode: authMode, token: authToken },
        rate_limit: { max_attempts: maxAttempts, window_ms: windowMs, lockout_ms: lockoutMs },
      },
    })

  return (
    <div className="space-y-4">
      <SectionCard
        title="Gateway Server"
        description="HTTP API server that agents and the web dashboard connect to"
        icon={<Server />}
      >
        <Field label="Port" hint="TCP port ZeroClaw listens on. Default is 18789.">
          <NumberInput value={port} onChange={setPort} min={1024} max={65535} />
        </Field>

        <Field
          label="Bind Address"
          hint="Choose who can reach the gateway. Loopback = local machine only (recommended). All = all network interfaces."
        >
          <Select value={bind} onValueChange={setBind}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="loopback">
                <span>Loopback only</span>
                <span className="text-xs text-green-400 ml-2">— Recommended</span>
              </SelectItem>
              <SelectItem value="all">
                <span>All interfaces</span>
                <span className="text-xs text-amber-400 ml-2">— Exposes to network</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </SectionCard>

      <SectionCard
        title="Authentication"
        description="Secure access to the gateway API"
        icon={<Key />}
      >
        <Field
          label="Auth Mode"
          hint="Token mode requires a Bearer token in every request. None disables authentication (not recommended)."
        >
          <Select value={authMode} onValueChange={setAuthMode}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="token">
                <span>Token</span>
                <span className="text-xs text-green-400 ml-2">— Recommended</span>
              </SelectItem>
              <SelectItem value="none">
                <span>None</span>
                <span className="text-xs text-red-400 ml-2">— No authentication</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {authMode === "token" && (
          <Field label="Auth Token" hint="Secret token sent in Authorization header. Use a long random string.">
            <SecretInput
              value={authToken}
              onChange={setAuthToken}
              placeholder="${GATEWAY_TOKEN}"
              className="w-full"
            />
          </Field>
        )}
      </SectionCard>

      <SectionCard
        title="Rate Limiting"
        description="Protect the gateway from brute-force and abuse"
        icon={<Shield />}
      >
        <Field
          label="Max Login Attempts"
          hint="Number of failed auth attempts before the client is locked out."
        >
          <NumberInput value={maxAttempts} onChange={setMaxAttempts} min={1} max={100} suffix="attempts" />
        </Field>

        <Field
          label="Counting Window"
          hint="Time window in which failed attempts are counted."
        >
          <Select value={String(windowMs)} onValueChange={(v) => setWindowMs(Number(v))}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Lockout Duration"
          hint="How long a client stays blocked after exceeding max attempts."
        >
          <Select value={String(lockoutMs)} onValueChange={(v) => setLockoutMs(Number(v))}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCKOUT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </SectionCard>

      <SaveRow onSave={handleSave} saving={saving} />
    </div>
  )
}

// ── Tab: Providers ────────────────────────────────────────────────────────────
function ProvidersTab({
  config,
  saving,
  onSave,
}: {
  config: Record<string, unknown>
  saving: boolean
  onSave: (patch: Record<string, unknown>) => void
}) {
  const anthropic = (dig(config, "providers", "anthropic") ?? {}) as Record<string, unknown>
  const openai = (dig(config, "providers", "openai") ?? {}) as Record<string, unknown>
  const defaults = (dig(config, "agents", "defaults") ?? {}) as Record<string, unknown>

  const [anthropicKey, setAnthropicKey] = useState(str(anthropic.api_key))
  const [openaiKey, setOpenaiKey] = useState(str(openai.api_key))
  const [ollamaEndpoint, setOllamaEndpoint] = useState(str(openai.endpoint))
  const [defaultModel, setDefaultModel] = useState(str(defaults.model, "anthropic/claude-haiku-4-5"))
  const [sandbox, setSandbox] = useState(str(defaults.sandbox, "non-main"))

  useEffect(() => {
    setAnthropicKey(str(anthropic.api_key))
    setOpenaiKey(str(openai.api_key))
    setOllamaEndpoint(str(openai.endpoint))
    setDefaultModel(str(defaults.model, "anthropic/claude-haiku-4-5"))
    setSandbox(str(defaults.sandbox, "non-main"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const handleSave = () =>
    onSave({
      providers: {
        anthropic: { api_key: anthropicKey },
        openai: {
          api_key: openaiKey,
          ...(ollamaEndpoint ? { endpoint: ollamaEndpoint } : {}),
        },
      },
      agents: {
        defaults: {
          model: defaultModel,
          sandbox,
        },
      },
    })

  return (
    <div className="space-y-4">
      <SectionCard
        title="Anthropic"
        description="Claude models — Opus, Sonnet, Haiku"
        icon={<Cpu />}
      >
        <Field label="API Key" hint="Your Anthropic API key. Get it at console.anthropic.com.">
          <SecretInput
            value={anthropicKey}
            onChange={setAnthropicKey}
            placeholder="${ANTHROPIC_API_KEY}"
            className="w-full"
          />
        </Field>
      </SectionCard>

      <SectionCard
        title="OpenAI / Ollama"
        description="GPT-4o models or local Ollama endpoint"
        icon={<Globe />}
      >
        <Field label="OpenAI API Key" hint="Your OpenAI API key. Leave empty if not using OpenAI.">
          <SecretInput
            value={openaiKey}
            onChange={setOpenaiKey}
            placeholder="${OPENAI_API_KEY}"
            className="w-full"
          />
        </Field>

        <Field
          label="Custom Endpoint"
          hint="Override API endpoint. Use this to point to a local Ollama instance (e.g. http://localhost:11434/v1). Leave empty for the default OpenAI endpoint."
        >
          <Input
            value={ollamaEndpoint}
            onChange={(e) => setOllamaEndpoint(e.target.value)}
            className="font-mono text-sm"
            placeholder="http://localhost:11434/v1"
          />
        </Field>
      </SectionCard>

      <SectionCard
        title="Agent Defaults"
        description="Default model and security mode applied to all agents unless overridden"
        icon={<Bot />}
      >
        <Field
          label="Default Model"
          hint="The AI model used by agents that don't specify their own model."
        >
          <Select value={defaultModel} onValueChange={setDefaultModel}>
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Sandbox Mode"
          hint="Controls which file system operations agents are allowed to perform."
        >
          <Select value={sandbox} onValueChange={setSandbox}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="non-main">
                Non-main branch
                <span className="text-xs text-green-400 ml-2">— Recommended</span>
              </SelectItem>
              <SelectItem value="strict">
                Strict
                <span className="text-xs text-amber-400 ml-2">— Read-only FS</span>
              </SelectItem>
              <SelectItem value="off">
                Off
                <span className="text-xs text-red-400 ml-2">— No restrictions</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </SectionCard>

      <SaveRow onSave={handleSave} saving={saving} />
    </div>
  )
}

// ── Tab: Agent Defaults ───────────────────────────────────────────────────────
function AgentDefaultsTab({
  config,
  saving,
  onSave,
}: {
  config: Record<string, unknown>
  saving: boolean
  onSave: (patch: Record<string, unknown>) => void
}) {
  const limits = (dig(config, "agents", "defaults", "limits") ?? {}) as Record<string, unknown>
  const subagents = (dig(config, "agents", "defaults", "subagents") ?? {}) as Record<string, unknown>

  const [maxRam, setMaxRam] = useState(num(limits.max_ram_mb, 50))
  const [maxTokens, setMaxTokens] = useState(num(limits.max_tokens_per_hour, 3000))
  const [maxConcurrent, setMaxConcurrent] = useState(num(limits.max_concurrent_tasks, 2))
  const [spawnDepth, setSpawnDepth] = useState(num(subagents.max_spawn_depth, 2))
  const [maxChildren, setMaxChildren] = useState(num(subagents.max_children, 5))
  const [concurrentSub, setConcurrentSub] = useState(num(subagents.max_concurrent, 8))

  useEffect(() => {
    setMaxRam(num(limits.max_ram_mb, 50))
    setMaxTokens(num(limits.max_tokens_per_hour, 3000))
    setMaxConcurrent(num(limits.max_concurrent_tasks, 2))
    setSpawnDepth(num(subagents.max_spawn_depth, 2))
    setMaxChildren(num(subagents.max_children, 5))
    setConcurrentSub(num(subagents.max_concurrent, 8))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const handleSave = () =>
    onSave({
      agents: {
        defaults: {
          limits: {
            max_ram_mb: maxRam,
            max_tokens_per_hour: maxTokens,
            max_concurrent_tasks: maxConcurrent,
          },
          subagents: {
            max_spawn_depth: spawnDepth,
            max_children: maxChildren,
            max_concurrent: concurrentSub,
          },
        },
      },
    })

  return (
    <div className="space-y-4">
      <SectionCard
        title="Default Resource Limits"
        description="Applied to every agent unless overridden in the Agent Manager"
        icon={<Bot />}
      >
        <Field
          label="Max RAM"
          hint="Maximum memory each agent can use. ZeroClaw will pause the agent if this limit is exceeded."
        >
          <NumberInput value={maxRam} onChange={setMaxRam} min={10} max={4096} suffix="MB" />
        </Field>

        <Field
          label="Max Tokens per Hour"
          hint="Token budget per agent per hour across all AI calls. Protects against runaway costs."
        >
          <NumberInput value={maxTokens} onChange={setMaxTokens} min={100} suffix="tokens/hr" />
        </Field>

        <Field
          label="Max Concurrent Tasks"
          hint="Maximum number of tasks an agent can work on simultaneously."
        >
          <NumberInput value={maxConcurrent} onChange={setMaxConcurrent} min={1} max={20} suffix="tasks" />
        </Field>
      </SectionCard>

      <SectionCard
        title="Subagent Limits"
        description="Controls how agents can spawn child agents"
        icon={<Bot />}
      >
        <Field
          label="Max Spawn Depth"
          hint="How many levels deep the agent hierarchy can go. Agent → Child → Grandchild = depth 2."
        >
          <NumberInput value={spawnDepth} onChange={setSpawnDepth} min={0} max={5} suffix="levels" />
        </Field>

        <Field
          label="Max Children per Agent"
          hint="Maximum number of subagents a single agent can spawn."
        >
          <NumberInput value={maxChildren} onChange={setMaxChildren} min={0} max={20} suffix="agents" />
        </Field>

        <Field
          label="Max Concurrent Subagents"
          hint="Maximum number of subagents running at the same time across the whole system."
        >
          <NumberInput value={concurrentSub} onChange={setConcurrentSub} min={1} max={50} suffix="agents" />
        </Field>
      </SectionCard>

      <SaveRow onSave={handleSave} saving={saving} />
    </div>
  )
}

// ── Tab: Tools & Security ─────────────────────────────────────────────────────
function ToolsTab({
  config,
  saving,
  onSave,
}: {
  config: Record<string, unknown>
  saving: boolean
  onSave: (patch: Record<string, unknown>) => void
}) {
  const loop = (dig(config, "tools", "loop_detection") ?? {}) as Record<string, unknown>
  const webSearch = (dig(config, "tools", "web", "search") ?? {}) as Record<string, unknown>
  const webFetch = (dig(config, "tools", "web", "fetch") ?? {}) as Record<string, unknown>
  const exec = (dig(config, "tools", "exec") ?? {}) as Record<string, unknown>

  const [loopEnabled, setLoopEnabled] = useState(bool(loop.enabled, true))
  const [historySize, setHistorySize] = useState(num(loop.history_size, 30))
  const [warnThreshold, setWarnThreshold] = useState(num(loop.warning_threshold, 10))
  const [critThreshold, setCritThreshold] = useState(num(loop.critical_threshold, 20))

  const [searchEnabled, setSearchEnabled] = useState(bool(webSearch.enabled, true))
  const [maxResults, setMaxResults] = useState(num(webSearch.max_results, 10))
  const [searchTtl, setSearchTtl] = useState(num(webSearch.cache_ttl_minutes, 15))

  const [fetchEnabled, setFetchEnabled] = useState(bool(webFetch.enabled, true))
  const [maxChars, setMaxChars] = useState(num(webFetch.max_chars, 80000))
  const [fetchTtl, setFetchTtl] = useState(num(webFetch.cache_ttl_minutes, 15))

  const [execSecurity, setExecSecurity] = useState(str(exec.security, "allowlist"))
  const [allowedCommands, setAllowedCommands] = useState(
    Array.isArray(exec.allowed_commands)
      ? (exec.allowed_commands as string[]).join(", ")
      : "bun, node, python3, git, curl, jq",
  )

  useEffect(() => {
    setLoopEnabled(bool(loop.enabled, true))
    setHistorySize(num(loop.history_size, 30))
    setWarnThreshold(num(loop.warning_threshold, 10))
    setCritThreshold(num(loop.critical_threshold, 20))
    setSearchEnabled(bool(webSearch.enabled, true))
    setMaxResults(num(webSearch.max_results, 10))
    setSearchTtl(num(webSearch.cache_ttl_minutes, 15))
    setFetchEnabled(bool(webFetch.enabled, true))
    setMaxChars(num(webFetch.max_chars, 80000))
    setFetchTtl(num(webFetch.cache_ttl_minutes, 15))
    setExecSecurity(str(exec.security, "allowlist"))
    setAllowedCommands(
      Array.isArray(exec.allowed_commands)
        ? (exec.allowed_commands as string[]).join(", ")
        : "bun, node, python3, git, curl, jq",
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const MAX_RESULTS_OPTIONS = [5, 10, 20, 50]
  const TTL_OPTIONS = [
    { value: 5, label: "5 minutes" },
    { value: 15, label: "15 minutes" },
    { value: 30, label: "30 minutes" },
    { value: 60, label: "1 hour" },
    { value: 0, label: "No cache" },
  ]
  const MAX_CHARS_OPTIONS = [
    { value: 20000, label: "20 000 chars" },
    { value: 40000, label: "40 000 chars" },
    { value: 80000, label: "80 000 chars" },
    { value: 160000, label: "160 000 chars" },
  ]

  const handleSave = () =>
    onSave({
      tools: {
        loop_detection: {
          enabled: loopEnabled,
          history_size: historySize,
          warning_threshold: warnThreshold,
          critical_threshold: critThreshold,
        },
        web: {
          search: {
            enabled: searchEnabled,
            max_results: maxResults,
            cache_ttl_minutes: searchTtl,
          },
          fetch: {
            enabled: fetchEnabled,
            max_chars: maxChars,
            cache_ttl_minutes: fetchTtl,
          },
        },
        exec: {
          security: execSecurity,
          allowed_commands: allowedCommands
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      },
    })

  return (
    <div className="space-y-4">
      {/* Loop Detection */}
      <SectionCard
        title="Loop Detection"
        description="Prevent agents from getting stuck in repetitive cycles"
        icon={<AlertTriangle />}
      >
        <Field label="Enable Loop Detection" hint="Monitor agent actions for repetitive patterns.">
          <Switch checked={loopEnabled} onCheckedChange={setLoopEnabled} />
        </Field>

        {loopEnabled && (
          <>
            <Field
              label="History Size"
              hint="Number of past actions to scan for repeated patterns."
            >
              <NumberInput value={historySize} onChange={setHistorySize} min={10} max={200} suffix="actions" />
            </Field>

            <Field
              label="Warning Threshold"
              hint="How many repeated patterns before a warning is raised."
            >
              <NumberInput value={warnThreshold} onChange={setWarnThreshold} min={1} max={50} suffix="repeats" />
            </Field>

            <Field
              label="Critical Threshold"
              hint="How many repeated patterns before the agent is automatically stopped."
            >
              <NumberInput value={critThreshold} onChange={setCritThreshold} min={1} max={100} suffix="repeats" />
            </Field>
          </>
        )}
      </SectionCard>

      {/* Web Tools */}
      <SectionCard
        title="Web Tools"
        description="Search and fetch tools available to agents"
        icon={<Globe />}
      >
        <Field label="Web Search" hint="Allow agents to search the web.">
          <Switch checked={searchEnabled} onCheckedChange={setSearchEnabled} />
        </Field>

        {searchEnabled && (
          <>
            <Field label="Max Search Results" hint="Maximum number of results returned per search query.">
              <Select value={String(maxResults)} onValueChange={(v) => setMaxResults(Number(v))}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAX_RESULTS_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} results
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Search Cache TTL" hint="How long search results are cached before re-fetching.">
              <Select value={String(searchTtl)} onValueChange={(v) => setSearchTtl(Number(v))}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        <Separator className="my-1" />

        <Field label="Web Fetch" hint="Allow agents to download and read web pages.">
          <Switch checked={fetchEnabled} onCheckedChange={setFetchEnabled} />
        </Field>

        {fetchEnabled && (
          <>
            <Field
              label="Max Page Size"
              hint="Maximum number of characters fetched from a single URL. Larger = more context, more tokens."
            >
              <Select value={String(maxChars)} onValueChange={(v) => setMaxChars(Number(v))}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MAX_CHARS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Fetch Cache TTL" hint="How long fetched pages are cached.">
              <Select value={String(fetchTtl)} onValueChange={(v) => setFetchTtl(Number(v))}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={String(o.value)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
      </SectionCard>

      {/* Command Execution */}
      <SectionCard
        title="Command Execution"
        description="Controls which shell commands agents are allowed to run"
        icon={<Terminal />}
      >
        <Field
          label="Security Mode"
          hint="Allowlist: only listed commands are permitted. Denylist: all commands allowed except listed. Off: no restrictions (dangerous)."
        >
          <Select value={execSecurity} onValueChange={setExecSecurity}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allowlist">
                Allowlist
                <span className="text-xs text-green-400 ml-2">— Permitted list only</span>
              </SelectItem>
              <SelectItem value="denylist">
                Denylist
                <span className="text-xs text-amber-400 ml-2">— Block listed cmds</span>
              </SelectItem>
              <SelectItem value="off">
                Off
                <span className="text-xs text-red-400 ml-2">— No restrictions</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {execSecurity !== "off" && (
          <Field
            label={execSecurity === "allowlist" ? "Allowed Commands" : "Blocked Commands"}
            hint="Comma-separated list of commands (e.g. bun, node, python3, git)."
          >
            <Textarea
              value={allowedCommands}
              onChange={(e) => setAllowedCommands(e.target.value)}
              className="font-mono text-sm min-h-16 resize-none"
              placeholder="bun, node, python3, git, curl, jq"
            />
          </Field>
        )}
      </SectionCard>

      <SaveRow onSave={handleSave} saving={saving} />
    </div>
  )
}

// ── Tab: Backup & Restore ─────────────────────────────────────────────────────
function BackupTab({
  config,
  refetch,
}: {
  config: Record<string, unknown>
  refetch: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const handleExport = () => {
    // Build a simple TOML representation for download
    const json = JSON.stringify(config, null, 2)
    const blob = new Blob([`// zerabot.toml — exported ${new Date().toISOString()}\n// Raw JSON representation\n${json}`], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `zerabot-config-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Config exported")
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text.replace(/^\/\/.*\n/gm, "").trim())
      await configApi.update(parsed)
      toast.success("Config imported and saved")
      refetch()
    } catch (err) {
      toast.error("Import failed: " + String(err))
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const handleReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true)
      setTimeout(() => setConfirmReset(false), 5000)
      return
    }
    try {
      await configApi.update({
        runtime: { log_level: "info", data_dir: "~/.zerabot" },
        gateway: { port: 18789, bind: "loopback", auth: { mode: "token" }, rate_limit: { max_attempts: 10, window_ms: 60000, lockout_ms: 300000 } },
        agents: { defaults: { model: "anthropic/claude-haiku-4-5", sandbox: "non-main", limits: { max_ram_mb: 50, max_tokens_per_hour: 3000, max_concurrent_tasks: 2 } } },
        tools: { loop_detection: { enabled: true, history_size: 30, warning_threshold: 10, critical_threshold: 20 } },
      })
      toast.success("Config reset to defaults")
      refetch()
    } catch (err) {
      toast.error(String(err))
    }
    setConfirmReset(false)
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Export Configuration"
        description="Download a snapshot of the current configuration"
        icon={<Download />}
      >
        <div className="py-2">
          <p className="text-sm text-muted-foreground mb-4">
            Exports the full ZeraBot config as a JSON file. You can use this to back up
            your settings or transfer them to another machine.
          </p>
          <Button variant="outline" className="gap-2 uppercase tracking-wide" onClick={handleExport}>
            <Download className="w-4 h-4" />
            Export Config
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Import Configuration"
        description="Restore settings from a previously exported file"
        icon={<Upload />}
      >
        <div className="py-2">
          <p className="text-sm text-muted-foreground mb-4">
            Import a previously exported config file. This will overwrite the current
            configuration and trigger a ZeroClaw hot-reload.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <Button
            variant="outline"
            className="gap-2 uppercase tracking-wide"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
          >
            <Upload className={cn("w-4 h-4", importing && "animate-spin")} />
            {importing ? "Importing..." : "Import Config"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Reset to Defaults"
        description="Restore all settings to factory defaults"
        icon={<AlertTriangle />}
      >
        <div className="py-2">
          <p className="text-sm text-muted-foreground mb-4">
            This will reset all configuration values to their defaults. Your agents,
            cron jobs, and channel configs are stored separately and will not be affected.
          </p>
          <Button
            variant={confirmReset ? "destructive" : "outline"}
            className="gap-2 uppercase tracking-wide"
            onClick={handleReset}
          >
            <RotateCcw className="w-4 h-4" />
            {confirmReset ? "Click again to confirm reset" : "Reset to Defaults"}
          </Button>
          {confirmReset && (
            <p className="text-xs text-red-400 mt-2">
              Click again within 5 seconds to confirm. This cannot be undone.
            </p>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

// ── PAGE ──────────────────────────────────────────────────────────────────────
const TABS = [
  { value: "runtime", label: "Runtime", icon: Terminal },
  { value: "gateway", label: "Gateway", icon: Server },
  { value: "providers", label: "Providers", icon: Key },
  { value: "defaults", label: "Agent Defaults", icon: Bot },
  { value: "tools", label: "Tools & Security", icon: Wrench },
  { value: "backup", label: "Backup & Restore", icon: Archive },
]

export default function ConfigPage() {
  const [activeTab, setActiveTab] = useState("runtime")

  const { data: config = {}, isLoading, refetch } = useQuery({
    queryKey: ["config"],
    queryFn: configApi.get,
  })

  const mutation = useMutation({
    mutationFn: configApi.update,
    onSuccess: () => {
      toast.success("Configuration saved — ZeroClaw hot-reloaded")
      refetch()
    },
    onError: (err) => toast.error("Save failed: " + String(err)),
  })

  const handleSave = (patch: unknown) => mutation.mutate(patch)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl uppercase font-bold tracking-wide flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Config Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All settings are saved to{" "}
            <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">zerabot.toml</code>{" "}
            and hot-reloaded into ZeroClaw instantly.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-8 uppercase text-xs"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
          Reload
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <div>
          {/* Custom Tab Nav */}
          <div className="flex flex-wrap gap-1 bg-muted/40 p-1.5 rounded-lg border border-border">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium uppercase tracking-wide transition-all duration-150",
                  activeTab === tab.value
                    ? "bg-card text-primary border border-primary/30 shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60 border border-transparent",
                )}
              >
                <tab.icon className="w-3.5 h-3.5 shrink-0" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Panels */}
          <div className="mt-4">
            {activeTab === "runtime" && (
              <RuntimeTab config={config} saving={mutation.isPending} onSave={handleSave} />
            )}
            {activeTab === "gateway" && (
              <GatewayTab config={config} saving={mutation.isPending} onSave={handleSave} />
            )}
            {activeTab === "providers" && (
              <ProvidersTab config={config} saving={mutation.isPending} onSave={handleSave} />
            )}
            {activeTab === "defaults" && (
              <AgentDefaultsTab config={config} saving={mutation.isPending} onSave={handleSave} />
            )}
            {activeTab === "tools" && (
              <ToolsTab config={config} saving={mutation.isPending} onSave={handleSave} />
            )}
            {activeTab === "backup" && (
              <BackupTab config={config} refetch={refetch} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
