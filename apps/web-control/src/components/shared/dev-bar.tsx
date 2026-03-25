"use client"

import { useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Terminal, Copy, Check, ChevronUp, ChevronDown, Wifi, WifiOff, KeyRound, RefreshCw } from "lucide-react"
import { agentsApi, type AgentDevInfo } from "@/lib/api"
import { cn } from "@/lib/utils"

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyBtn({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])

  return (
    <button
      onClick={copy}
      title={`Copy ${label}`}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors text-[14px] font-mono",
        copied
          ? "border-green-500/40 bg-green-500/10 text-green-400"
          : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:border-primary/40",
      )}
    >
      {copied ? <Check className="w-2.5 h-2.5 shrink-0" /> : <Copy className="w-2.5 h-2.5 shrink-0" />}
      <span className="max-w-40 truncate">{copied ? "Copied!" : value}</span>
    </button>
  )
}

// ── Agent row ─────────────────────────────────────────────────────────────────

function AgentRow({ agent }: { agent: AgentDevInfo }) {
  const qc = useQueryClient()
  // Local override for freshly-generated code
  const [freshCode, setFreshCode] = useState<string | null>(null)

  const pairMut = useMutation({
    mutationFn: () => agentsApi.newPairCode(agent.agentId),
    onSuccess: (data) => {
      setFreshCode(data.pairCode)
      // Invalidate so the list re-fetches the new code too
      qc.invalidateQueries({ queryKey: ["dev-tokens"] })
    },
  })

  const displayCode = freshCode ?? agent.pairCode
  const url    = `http://127.0.0.1:${agent.port}`
  const wsUrl  = `ws://127.0.0.1:${agent.port}/ws/chat`
  const bearer = `Bearer ${agent.token}`

  return (
    <div className="py-2 border-b border-white/5 last:border-0 space-y-2">
      {/* Agent name */}
      <span className="text-[16px] font-semibold text-foreground">
        {agent.emoji ?? "🤖"} {agent.name}
        <span className="ml-1.5 text-[14px] text-muted-foreground/50 font-mono">:{agent.port}</span>
      </span>

      {/* Pair code row */}
      <div className="flex items-center gap-2">
        <KeyRound className="w-3 h-3 text-amber-400 shrink-0" />
        <span className="text-[10px] text-amber-400/70 uppercase tracking-wider shrink-0">Pair code</span>

        {displayCode ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[20px] font-mono font-bold tracking-[0.3em] text-amber-300 tabular-nums select-all leading-none">
              {displayCode}
            </span>
            <CopyBtn value={displayCode} label="pair code" />
          </div>
        ) : (
          <span className="text-[14px] text-muted-foreground/40 italic">not captured</span>
        )}

        {/* Generate fresh code button */}
        <button
          onClick={() => { setFreshCode(null); pairMut.mutate() }}
          disabled={pairMut.isPending}
          title="Generate new pairing code"
          className={cn(
            "ml-auto flex items-center gap-1 px-2 py-0.5 rounded border text-[14px] transition-colors",
            pairMut.isPending
              ? "border-amber-500/20 text-amber-400/40 cursor-not-allowed"
              : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10",
          )}
        >
          <RefreshCw className={cn("w-2.5 h-2.5", pairMut.isPending && "animate-spin")} />
          New code
        </button>
      </div>

      {/* Connection links */}
      <div className="flex flex-wrap items-center gap-1.5">
        <CopyBtn value={url}    label="HTTP URL" />
        <CopyBtn value={wsUrl}  label="WS URL"   />
        <CopyBtn value={bearer} label="Bearer token" />
      </div>
    </div>
  )
}

// ── DevBar ────────────────────────────────────────────────────────────────────

export function DevBar() {
  const [expanded, setExpanded] = useState(true)

  const { data: agents = [], dataUpdatedAt } = useQuery({
    queryKey: ["dev-tokens"],
    queryFn: agentsApi.devTokens,
    refetchInterval: 5_000,
    retry: false,
  })

  const running = agents.length
  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-US", { hour12: false })
    : "--:--:--"

  return (
    <div className="fixed bottom-3 right-3 z-50 w-150 max-w-[calc(100vw-1.5rem)]">
      <div className="rounded-lg border border-amber-500/30 bg-background/95 backdrop-blur-sm shadow-lg shadow-black/40 overflow-hidden">

        {/* Header */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-amber-500/5 transition-colors"
        >
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[14px] font-bold tracking-widest bg-amber-500/15 text-amber-400 border border-amber-500/30">
            DEV
          </span>
          <Terminal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[16px] font-mono text-amber-300 font-semibold tracking-wide uppercase">
            ZeroClaw Agents
          </span>
          <div className="flex items-center gap-1.5 ml-1">
            {running > 0
              ? <Wifi    className="w-5 h-5 text-green-400" />
              : <WifiOff className="w-5 h-5 text-muted-foreground/40" />
            }
            <span className={cn(
              "text-[14px] font-mono tabular-nums",
              running > 0 ? "text-green-400" : "text-muted-foreground/40",
            )}>
              {running} running
            </span>
          </div>
          <span className="ml-auto text-[14px] font-mono text-muted-foreground/40 tabular-nums">
            {lastUpdate}
          </span>
          {expanded
            ? <ChevronDown className="w-6 h-6 text-muted-foreground shrink-0" />
            : <ChevronUp   className="w-6 h-6 text-muted-foreground shrink-0" />
          }
        </button>

        {/* Content */}
        {expanded && (
          <div className="px-3 pb-2 border-t border-white/5">
            {running === 0 ? (
              <p className="text-[15px] text-green-600/80 py-3 text-center font-mono">
                No agents running — start one from Agent Manager
              </p>
            ) : (
              agents.map(agent => <AgentRow key={agent.agentId} agent={agent} />)
            )}
            <p className="text-[14px] text-red-600/60 font-mono mt-1.5">
              Only visible in development · Refreshes every 5s
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
