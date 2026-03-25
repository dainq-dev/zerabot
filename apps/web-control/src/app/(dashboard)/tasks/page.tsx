"use client"

import { useState, useEffect, useRef } from "react"
import Markdown from "react-markdown"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Send, RefreshCw, Trash2, Bot, GitFork, Loader2, Zap,
  Terminal, Wrench, AlertTriangle, X, ChevronDown, Eye,
  Clock,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { agentsApi, pipelinesApi, tasksApi, eventsApi } from "@/lib/api"
import { useEventStream } from "@/hooks/use-event-stream"
import type { TaskRun } from "@/lib/api"
import type { ZerabotEvent } from "@zerobot/shared"
import { cn } from "@/lib/utils"

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: number) {
  return new Date(ts).toLocaleString("vi-VN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

function fmtTimeShort(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false })
}

function StatusBadge({ status }: { status: TaskRun["status"] }) {
  const cfg: Record<TaskRun["status"], { label: string; cls: string }> = {
    dispatched: { label: "DISPATCHED", cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
    running: { label: "RUNNING", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    done: { label: "DONE", cls: "bg-green-500/10 text-green-400 border-green-500/20" },
    error: { label: "ERROR", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  }
  const { label, cls } = cfg[status] ?? cfg.dispatched
  return (
    <Badge variant="outline" className={cn("text-[10px] tracking-wider font-mono gap-1.5", cls)}>
      {status === "running" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      {label}
    </Badge>
  )
}

// ── Output panel (live WebSocket + historical REST) ───────────────────────────

const RELEVANT_TYPES = new Set(["session.message", "tool.call", "tool.result", "agent.error", "agent.status"])
const RECENT_MS = 120_000 // poll DB every 2s for 2 minutes after dispatch

function OutputPanel({
  agentId,
  agentName,
  since,
  onClose,
}: {
  agentId: string
  agentName: string
  since: number
  onClose: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Live WebSocket stream (catches real-time events if WS is connected before task finishes)
  const { events: streamEvents, connected } = useEventStream(500)
  const liveFiltered = streamEvents
    .filter(e => e.agentId === agentId && e.ts >= since && RELEVANT_TYPES.has(e.type))

  // Always poll DB — covers the common case where broadcast fires before this panel mounts.
  // Refetch every 2s while task is recent (<2min), then stop.
  const isRecent = Date.now() - since < RECENT_MS
  const { data: dbEvents = [] } = useQuery({
    queryKey: ["task-events", agentId, since],
    queryFn: () => eventsApi.list({ agentId, limit: 200, since }),
    refetchInterval: isRecent ? 2_000 : false,
    staleTime: 1_000,
  }) as { data: ZerabotEvent[] }

  const dbFiltered = (dbEvents as ZerabotEvent[])
    .filter(e => e.ts >= since && RELEVANT_TYPES.has(e.type))

  // Merge WS + DB events, dedupe by id, sort ascending
  const seenIds = new Set<string>()
  const events = [...liveFiltered, ...dbFiltered]
    .filter(e => { if (seenIds.has(e.id)) return false; seenIds.add(e.id); return true })
    .sort((a, b) => a.ts - b.ts)

  const isLoading = isRecent && events.length === 0

  // Compute step numbers for tool.call events
  let stepNum = 0
  const stepMap = new Map<string, number>()
  for (const e of events) {
    if (e.type === "tool.call") {
      stepNum++
      stepMap.set(e.id, stepNum)
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [events.length])

  return (
    <div className="bg-card border border-primary/30 rounded-lg overflow-hidden flex flex-col" style={{ minHeight: 280, maxHeight: 520 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-primary/5 shrink-0">
        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", connected ? "bg-green-400 pulse-dot" : "bg-muted-foreground/40")} />
        <Terminal className="w-3.5 h-3.5 text-primary" />
        <span className="text-sm font-semibold tracking-wide text-primary">LIVE OUTPUT</span>
        <span className="text-xs text-muted-foreground">— {agentName}</span>
        <Badge variant="outline" className="ml-1 text-[9px] h-4 px-1.5">{events.length} events</Badge>
        {stepNum > 0 && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20">
            {stepNum} steps
          </Badge>
        )}
        <div className="flex-1" />
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onClose} title="Close">
          <X className="w-3 h-3" />
        </Button>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto text-[11px] font-mono p-2 space-y-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-24 text-muted-foreground/40 gap-1.5">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Waiting for agent response…</span>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-muted-foreground/40 gap-1.5">
            <Terminal className="w-4 h-4" />
            <span>No events recorded for this task</span>
          </div>
        ) : (
          events.map(e => <OutputLine key={e.id} event={e} step={stepMap.get(e.id)} />)
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground/50 flex items-center gap-1">
        <ChevronDown className="w-3 h-3" />
        Live stream + DB poll · Full history in Monitor
      </div>
    </div>
  )
}

function OutputLine({ event: e, step }: { event: ZerabotEvent; step?: number }) {
  const [expanded, setExpanded] = useState(false)
  const p = e.payload as Record<string, unknown>

  if (e.type === "session.message") {
    const role = (p.role as string) ?? "assistant"
    const content = String(p.full_response ?? p.content ?? p.text ?? p.message ?? JSON.stringify(p))
    const isUser = role === "user"
    return (
      <div className={cn("flex gap-2", isUser ? "opacity-60" : "")}>
        <span className="text-muted-foreground/40 shrink-0 w-14 tabular-nums">{fmtTimeShort(e.ts)}</span>
        <span className={cn("shrink-0 font-bold", isUser ? "text-muted-foreground" : "text-cyan-400")}>
          {isUser ? "USER" : " BOT"}
        </span>
        {isUser ? (
          <span className="text-foreground/90 whitespace-pre-wrap break-words">{content}</span>
        ) : (
          <div className="text-foreground/90 prose prose-invert prose-sm max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
            <Markdown>{content}</Markdown>
          </div>
        )}
      </div>
    )
  }

  if (e.type === "tool.call") {
    const tool = String(p.tool ?? p.name ?? "")
    const input = p.input ?? p.arguments
    const hasInput = input != null && JSON.stringify(input) !== "{}"
    return (
      <div className="space-y-0.5">
        <div
          className={cn("flex gap-2 text-amber-400/80", hasInput && "cursor-pointer hover:text-amber-300")}
          onClick={() => hasInput && setExpanded(!expanded)}
        >
          <span className="text-muted-foreground/40 shrink-0 w-14 tabular-nums">{fmtTimeShort(e.ts)}</span>
          <span className="shrink-0 text-amber-500/60 font-bold w-8 text-right">
            {step != null ? `#${step}` : ""}
          </span>
          <Wrench className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            <span className="text-amber-300 font-semibold">{tool}</span>
            {hasInput && (
              <span className="text-muted-foreground/40 ml-1 text-[10px]">
                {expanded ? "▼" : "▶"} input
              </span>
            )}
          </span>
        </div>
        {expanded && hasInput && (
          <pre className="ml-[6.5rem] text-[10px] text-muted-foreground/60 bg-muted/20 rounded px-2 py-1 max-h-32 overflow-auto whitespace-pre-wrap">
            {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
          </pre>
        )}
      </div>
    )
  }

  if (e.type === "tool.result") {
    const ok = p.error == null
    const output = p.output ?? p.result ?? p.content
    const latency = p.latencyMs as number | undefined
    const hasOutput = output != null && String(output).length > 0
    return (
      <div className="space-y-0.5">
        <div
          className={cn("flex gap-2", ok ? "text-green-400/60" : "text-red-400/70", hasOutput && "cursor-pointer hover:opacity-80")}
          onClick={() => hasOutput && setExpanded(!expanded)}
        >
          <span className="text-muted-foreground/40 shrink-0 w-14 tabular-nums">{fmtTimeShort(e.ts)}</span>
          <span className="shrink-0 w-8 text-right" />
          <span className="shrink-0">{ok ? "✓" : "✗"}</span>
          <span className="truncate">
            {ok ? "tool ok" : String(p.error)}
            {latency != null && <span className="text-muted-foreground/30 ml-1">({latency}ms)</span>}
            {hasOutput && (
              <span className="text-muted-foreground/40 ml-1 text-[10px]">
                {expanded ? "▼" : "▶"} output
              </span>
            )}
          </span>
        </div>
        {expanded && hasOutput && (
          <pre className="ml-[6.5rem] text-[10px] text-muted-foreground/60 bg-muted/20 rounded px-2 py-1 max-h-32 overflow-auto whitespace-pre-wrap">
            {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
          </pre>
        )}
      </div>
    )
  }

  if (e.type === "agent.error") {
    return (
      <div className="flex gap-2 text-red-400">
        <span className="text-muted-foreground/40 shrink-0 w-14 tabular-nums">{fmtTimeShort(e.ts)}</span>
        <span className="shrink-0 w-8 text-right" />
        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
        <span>{String(p.message ?? p.error ?? JSON.stringify(p))}</span>
      </div>
    )
  }

  // agent.status (thinking, session lifecycle, etc.)
  const from = p.from ?? p.event ?? p.to
  return (
    <div className="flex gap-2 text-muted-foreground/50">
      <span className="text-muted-foreground/40 shrink-0 w-14 tabular-nums">{fmtTimeShort(e.ts)}</span>
      <span className="shrink-0 w-8 text-right" />
      <span className="shrink-0">—</span>
      <span>{e.type} {from ? String(from) : ""}</span>
    </div>
  )
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [targetType, setTargetType] = useState<"agent" | "pipeline">("agent")
  const [targetId, setTargetId] = useState("")
  const [prompt, setPrompt] = useState("")
  const [watching, setWatching] = useState<{ agentId: string; agentName: string; since: number } | null>(null)
  const qc = useQueryClient()

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: agentsApi.list,
    refetchInterval: 10_000,
  })

  const { data: pipelines = [] } = useQuery({
    queryKey: ["pipelines"],
    queryFn: pipelinesApi.list,
  })

  const { data: runs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => tasksApi.list(100),
    refetchInterval: 5_000,
  })

  const runMut = useMutation({
    mutationFn: () => tasksApi.run({ targetType, targetId, prompt }),
    onSuccess: () => {
      toast.success("Task dispatched — watching live output")
      const since = Date.now()

      // Resolve agent id for watching
      let agentId = targetId
      let agentName = targetId

      if (targetType === "agent") {
        const agent = agents.find(a => a.id === targetId)
        agentName = agent ? `${agent.emoji ?? "🤖"} ${agent.name}` : targetId
      } else {
        // Pipeline: find first agent node
        const pipeline = pipelines.find(p => p.id === targetId)
        agentName = pipeline?.name ?? targetId
        const agentNode = (pipeline?.nodes ?? []).find((n: { type: string }) => n.type === "agent")
        const nodeAgentId = (agentNode as { data?: { agentId?: string } } | undefined)?.data?.agentId
        if (nodeAgentId) agentId = nodeAgentId
      }

      setWatching({ agentId, agentName, since })
      setPrompt("")
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => {
      toast.success("Run deleted")
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  })

  const runningAgents = agents.filter(a => a.status === "running")
  const targetOptions = targetType === "agent"
    ? runningAgents.map(a => ({ id: a.id, label: `${a.emoji ?? "🤖"} ${a.name}` }))
    : pipelines.map(p => ({ id: p.id, label: p.name }))

  const canSubmit = !!targetId && prompt.trim().length > 0 && !runMut.isPending

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
      runMut.mutate()
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl uppercase font-bold tracking-wide">Tasks</h1>
          <p className="text-md text-muted-foreground mt-0.5">
            Dispatch one-shot commands to agents or pipelines instantly
          </p>
        </div>
        <Button
          variant="destructive"
          size="lg"
          className="h-8 gap-2 text-md uppercase"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Dispatch panel */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-wide uppercase text-primary">
          <Zap className="w-4 h-4" />
          Dispatch Task
        </div>

        {/* Target type + target selector */}
        <div className="flex gap-2">
          <Select value={targetType} onValueChange={(v) => { setTargetType(v as "agent" | "pipeline"); setTargetId("") }}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">
                <span className="flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> Agent</span>
              </SelectItem>
              <SelectItem value="pipeline">
                <span className="flex items-center gap-1.5"><GitFork className="w-3.5 h-3.5" /> Pipeline</span>
              </SelectItem>
            </SelectContent>
          </Select>

          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger className="flex-1 h-9 text-sm">
              <SelectValue placeholder={targetType === "agent" ? "Select a running agent…" : "Select a pipeline…"} />
            </SelectTrigger>
            <SelectContent>
              {targetOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {targetType === "agent" ? "No running agents" : "No pipelines found"}
                </div>
              ) : (
                targetOptions.map(opt => (
                  <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Prompt */}
        <Textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe what you want the agent to do… (Ctrl+Enter to send)"
          className="min-h-[100px] text-sm font-mono resize-none"
        />

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {targetType === "agent" && runningAgents.length === 0 && (
              <span className="text-amber-400">No running agents — start one first</span>
            )}
          </p>
          <Button
            size="sm"
            className="gap-2 uppercase tracking-wide"
            onClick={() => runMut.mutate()}
            disabled={!canSubmit}
          >
            {runMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Send
          </Button>
        </div>
      </div>

      {/* Live output panel — appears after dispatch */}
      {watching && (
        <OutputPanel
          agentId={watching.agentId}
          agentName={watching.agentName}
          since={watching.since}
          onClose={() => setWatching(null)}
        />
      )}

      {/* Run history */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          Recent dispatches
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-md" />)}
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center border border-dashed border-border rounded-lg">
            <Send className="w-10 h-10 text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">No tasks dispatched yet</p>
          </div>
        ) : (
          <div className="border border-border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {["Target", "Type", "Prompt", "Dispatched", "Status", ""].map(h => (
                    <TableHead
                      key={h}
                      className={cn(
                        "text-[11px] tracking-wider text-muted-foreground uppercase",
                        h === "" && "text-right w-10"
                      )}
                    >
                      {h || ""}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map(run => (
                  <TableRow key={run.id} className="border-border hover:bg-muted/20">
                    <TableCell className="font-medium max-w-[140px] truncate">
                      {run.targetName ?? run.targetId}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-mono gap-1 border-muted">
                        {run.targetType === "agent"
                          ? <><Bot className="w-2.5 h-2.5" /> Agent</>
                          : <><GitFork className="w-2.5 h-2.5" /> Pipeline</>
                        }
                      </Badge>
                    </TableCell>

                    <TableCell className="max-w-[320px]">
                      <p className="text-xs text-muted-foreground truncate font-mono">{run.prompt}</p>
                    </TableCell>

                    <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {fmtTime(run.startedAt)}
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-cyan-400 hover:text-cyan-300"
                          title="View output"
                          onClick={() => setWatching({
                            agentId: run.agentId ?? run.targetId,
                            agentName: run.targetName ?? run.targetId,
                            since: run.startedAt,
                          })}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-red-400 hover:text-red-300"
                          title="Delete"
                          disabled={deleteMut.isPending}
                          onClick={() => deleteMut.mutate(run.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
