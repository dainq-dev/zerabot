"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu"
import {
  Play, Square, RotateCcw, Pause, ChevronRight,
  MoreVertical, Pencil, Trash2, Cpu, Zap, ActivitySquare
} from "lucide-react"
import { AgentStatusBadge } from "./agent-status-badge"
import { AgentIcon } from "@/components/shared/agent-icon"
import { agentsApi } from "@/lib/api"
import type { Agent } from "@zerobot/shared"
import { cn } from "@/lib/utils"

interface AgentCardProps {
  agent: Agent
  onEdit: (agent: Agent) => void
}

export function AgentCard({ agent, onEdit }: AgentCardProps) {
  const qc = useQueryClient()

  const actionMutation = useMutation({
    mutationFn: (action: "start" | "stop" | "restart" | "pause" | "resume") =>
      agentsApi.action(agent.id, action),
    onSuccess: (_, action) => {
      toast.success(`Agent ${agent.name}: ${action}`)
      qc.invalidateQueries({ queryKey: ["agents"] })
    },
    onError: (err) => toast.error(String(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => agentsApi.delete(agent.id),
    onSuccess: () => {
      toast.success(`Agent ${agent.name} deleted`)
      qc.invalidateQueries({ queryKey: ["agents"] })
    },
    onError: (err) => toast.error(String(err)),
  })

  const isRunning = agent.status === "running"
  const isPaused = agent.status === "paused"
  const isStopped = agent.status === "stopped" || !agent.status

  return (
    <Card
      data-testid={`agent-card-${agent.id}`}
      className={cn(
        "relative overflow-hidden border bg-card card-hover",
        isRunning && "border-green-500/20",
        agent.status === "error" && "border-red-500/20"
      )}
    >
      {/* Top accent line */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-0.5",
        isRunning ? "bg-linear-to-r from-transparent via-green-400/60 to-transparent" :
        isPaused ? "bg-linear-to-r from-transparent via-amber-400/40 to-transparent" :
        "bg-transparent"
      )} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <AgentIcon id={agent.emoji} className="w-12 h-12 text-primary/70" />
            <div>
              <div className="font-bold text-lg uppercase tracking-wide text-foreground">{agent.name}</div>
              <div className="text-[14px] text-muted-foreground font-mono">{agent.id}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AgentStatusBadge status={agent.status ?? "stopped"} data-testid={`agent-status-${agent.id}`} />
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <MoreVertical className="w-3.5 h-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem data-testid={`menu-edit-${agent.id}`} onClick={() => onEdit(agent)}>
                  <Pencil className="w-3 h-3 mr-2" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid={`menu-delete-${agent.id}`}
                  className="text-red-400 focus:text-red-400"
                  onClick={() => deleteMutation.mutate()}
                >
                  <Trash2 className="w-3 h-3 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Model */}
        <div className="flex items-center gap-1.5 text-[16px] uppercase font-mono text-muted-foreground mb-3">
          <Zap className="w-5 h-5" />
          <span className="font-mono">{agent.model}</span>
        </div>

        {/* Mission */}
        {agent.mission && (
          <p className="text-[14px] text-muted-foreground leading-relaxed mb-3 line-clamp-4 min-h-[91px]">
            {agent.mission}
          </p>
        )}

        {/* Current task */}
        {agent.currentTask && isRunning && (
          <div className="flex items-start gap-1.5 mb-3 bg-green-500/5 border border-green-500/10 rounded px-2 py-1.5">
            <ActivitySquare className="w-3 h-3 text-green-400 mt-0.5 shrink-0 animate-pulse" />
            <p className="text-[11px] text-green-400/80 line-clamp-2">{agent.currentTask}</p>
          </div>
        )}

        <Separator className="mb-3 opacity-30" />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-muted/50 rounded px-2 py-1.5">
            <div className="text-[12px] text-muted-foreground uppercase tracking-wider mb-0.5">RAM</div>
            <div className="text-sm font-mono font-bold">
              {agent.ramUsageMb ? `${agent.ramUsageMb}MB` : "—"}
              <span className="text-muted-foreground/60 font-normal">/{agent.limits.maxRamMb}MB</span>
            </div>
          </div>
          <div className="bg-muted/50 rounded px-2 py-1.5">
            <div className="text-[12px] text-muted-foreground uppercase tracking-wider mb-0.5">TOKENS/H</div>
            <div className="text-sm font-mono font-bold">
              {agent.tokensUsedThisHour ?? 0}
              <span className="text-muted-foreground/60 font-normal">/{agent.limits.maxTokensPerHour}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5">
          {isStopped && (
            <Button
              size="sm"
              data-testid={`btn-agent-action-${agent.id}`}
              className="flex-1 h-7 text-xs gap-1.5 bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
              onClick={() => actionMutation.mutate("start")}
              disabled={actionMutation.isPending}
            >
              <Play className="w-3 h-3" /> Start
            </Button>
          )}
          {isRunning && (
            <>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
                onClick={() => actionMutation.mutate("pause")}
                disabled={actionMutation.isPending}
              >
                <Pause className="w-3 h-3" /> Pause
              </Button>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs gap-1.5 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                onClick={() => actionMutation.mutate("stop")}
                disabled={actionMutation.isPending}
              >
                <Square className="w-3 h-3" /> Stop
              </Button>
            </>
          )}
          {isPaused && (
            <>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs gap-1.5 bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
                onClick={() => actionMutation.mutate("resume")}
                disabled={actionMutation.isPending}
              >
                <Play className="w-3 h-3" /> Resume
              </Button>
              <Button
                size="sm"
                className="flex-1 h-7 text-xs gap-1.5 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
                onClick={() => actionMutation.mutate("stop")}
                disabled={actionMutation.isPending}
              >
                <Square className="w-3 h-3" /> Stop
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => actionMutation.mutate("restart")}
            disabled={actionMutation.isPending || isStopped}
            title="Restart"
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
