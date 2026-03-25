"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import type { ZerabotEvent, EventType } from "@zerobot/shared"
import {
  Wrench, Bot, Clock, MessageSquare, Cpu, Radio,
  AlertTriangle, Info, GitFork, Wifi, WifiOff, Trash2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const EVENT_ICONS: Partial<Record<EventType, React.ComponentType<{ className?: string }>>> = {
  "tool.call": Wrench,
  "tool.result": Wrench,
  "agent.status": Bot,
  "agent.error": AlertTriangle,
  "session.message": MessageSquare,
  "cron.fired": Clock,
  "cron.completed": Clock,
  "mcp.call": Cpu,
  "mcp.result": Cpu,
  "channel.message": Radio,
  "channel.sent": Radio,
  "pipeline.started": GitFork,
  "pipeline.completed": GitFork,
  "pipeline.failed": GitFork,
  "system.info": Info,
  "system.warning": AlertTriangle,
  "system.error": AlertTriangle,
}

const SEVERITY_COLOR: Record<string, string> = {
  info: "text-cyan-400/70",
  warning: "text-amber-400",
  error: "text-red-400",
  debug: "text-muted-foreground/50",
}

const EVENT_TYPE_FILTERS: EventType[] = [
  "tool.call", "agent.status", "session.message", "cron.fired",
  "mcp.call", "channel.message", "system.error"
]

interface EventFeedProps {
  events: ZerabotEvent[]
  connected: boolean
  onClear: () => void
}

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false })
}

export function EventFeed({ events, connected, onClear }: EventFeedProps) {
  const [typeFilter, setTypeFilter] = useState<EventType | null>(null)
  const [agentFilter] = useState<string | null>(null)

  const filtered = events.filter(e => {
    if (typeFilter && e.type !== typeFilter) return false
    if (agentFilter && e.agentId !== agentFilter) return false
    return true
  })

  return (
    <div className="flex flex-col h-full border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <div
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            connected ? "bg-green-400 pulse-dot" : "bg-muted-foreground",
          )}
        />
        <span className="text-lg font-bold tracking-wide">EVENT STREAM</span>
        <span className="text-[15px] text-muted-foreground ml-6">
          {connected ? "CONNECTED" : "RECONNECTING..."}
        </span>
        <Badge variant="outline" className="ml-1 text-[9px] h-4 px-1">
          {filtered.length}
        </Badge>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onClear}
          title="Clear feed"
          data-testid="btn-clear-feed"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>

      {/* Type filters */}
      <div className="flex gap-4 px-3 py-1.5 border-b border-border overflow-x-auto shrink-0">
        <button
          data-testid="filter-all"
          onClick={() => setTypeFilter(null)}
          className={cn(
            "text-[16px] tracking-wider px-1.5 py-0.5 rounded border transition-colors whitespace-nowrap",
            !typeFilter
              ? "border-primary/40 text-primary bg-primary/10"
              : "border-border text-muted-foreground hover:border-primary/20",
          )}
        >
          ALL
        </button>
        {EVENT_TYPE_FILTERS.map((t) => (
          <button
            key={t}
            data-testid={`filter-${t.replace(".", "_")}`}
            onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            className={cn(
              "text-[16px] tracking-wider px-1.5 py-0.5 rounded border transition-colors whitespace-nowrap",
              typeFilter === t
                ? "border-primary/40 text-primary bg-primary/10"
                : "border-border text-muted-foreground hover:border-primary/20",
            )}
          >
            {t.replace(".", "_").toUpperCase()}
          </button>
        ))}
      </div>

      {/* Events */}
      <div data-testid="event-feed-list" className="flex-1 overflow-y-auto text-[11px] font-mono">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/40 text-lg">
            {connected ? "Waiting for events..." : "Disconnected"}
          </div>
        ) : (
          filtered.map((e) => {
            const Icon = EVENT_ICONS[e.type] ?? Info;
            return (
              <div
                key={e.id}
                className="flex items-start gap-2 px-3 py-1.5 border-b border-border/30 hover:bg-muted/20 transition-colors"
              >
                <span className="text-muted-foreground/40 tabular-nums shrink-0 w-16">
                  {formatTs(e.ts)}
                </span>
                <Icon
                  className={cn(
                    "w-3 h-3 mt-0.5 shrink-0",
                    SEVERITY_COLOR[e.severity ?? "info"],
                  )}
                />
                <div className="flex-1 min-w-0">
                  <span
                    className={cn(
                      "font-bold mr-2",
                      SEVERITY_COLOR[e.severity ?? "info"],
                    )}
                  >
                    {e.type}
                  </span>
                  {e.agentId && (
                    <span className="text-cyan-400/60 mr-2">[{e.agentId}]</span>
                  )}
                  <span className="text-muted-foreground truncate">
                    {renderPayloadSummary(e)}
                  </span>
                </div>
                {e.tokenUsed > 0 && (
                  <span className="text-muted-foreground/40 shrink-0">
                    {e.tokenUsed}tk
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function renderPayloadSummary(e: ZerabotEvent): string {
  const p = e.payload
  if (e.type === "tool.call") return `${(p as Record<string, unknown>).tool}`
  if (e.type === "agent.status") return `${(p as Record<string, unknown>).from} → ${(p as Record<string, unknown>).to}`
  if (e.type === "session.message") {
    const content = String((p as Record<string, unknown>).content ?? "")
    return content.slice(0, 80)
  }
  if (e.type === "cron.fired") return `${(p as Record<string, unknown>).jobName}`
  if (e.type === "mcp.call") return `${(p as Record<string, unknown>).serverId}.${(p as Record<string, unknown>).tool}`
  return JSON.stringify(p).slice(0, 100)
}
