"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Edit2, Play, Trash2, Clock, Webhook, MessageSquare,
  Hand, GitFork, Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Pipeline } from "@zerobot/shared"

// ── Config maps ───────────────────────────────────────────────────────────────

const TRIGGER_INFO: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  cron:    { label: "Theo lịch",        icon: Clock,         color: "text-cyan-400" },
  webhook: { label: "Webhook",          icon: Webhook,       color: "text-blue-400" },
  channel: { label: "Tin nhắn đến",    icon: MessageSquare, color: "text-purple-400" },
  manual:  { label: "Thủ công",        icon: Hand,          color: "text-muted-foreground" },
}

const STATUS_CFG: Record<string, { label: string; cls: string; bar: string }> = {
  active:  { label: "ACTIVE",  cls: "bg-green-500/10 text-green-400 border-green-500/20",  bar: "bg-green-500/60" },
  running: { label: "RUNNING", cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",     bar: "bg-cyan-500/60" },
  paused:  { label: "PAUSED",  cls: "bg-amber-500/10 text-amber-400 border-amber-500/20",  bar: "bg-amber-500/40" },
  error:   { label: "ERROR",   cls: "bg-red-500/10 text-red-400 border-red-500/20",         bar: "bg-red-500/60" },
  draft:   { label: "DRAFT",   cls: "bg-muted/60 text-muted-foreground border-border",      bar: "bg-border/60" },
}

function fmtDate(ts?: number) {
  if (!ts) return "Chưa chạy"
  return new Date(ts).toLocaleString("vi-VN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit",  minute: "2-digit",
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PipelineCardProps {
  pipeline: Pipeline
  onEdit:   () => void
  onRun:    () => void
  onDelete: () => void
}

export function PipelineCard({ pipeline, onEdit, onRun, onDelete }: PipelineCardProps) {
  const trigger = TRIGGER_INFO[pipeline.trigger.type] ?? TRIGGER_INFO.manual
  const status  = STATUS_CFG[pipeline.status] ?? STATUS_CFG.draft
  const TriggerIcon = trigger.icon

  return (
    <Card className="bg-card border border-border card-hover flex flex-col overflow-hidden">
      {/* Status accent bar */}
      <div className={cn("h-0.5 shrink-0", status.bar)} />

      <div className="p-4 flex flex-col flex-1 gap-3">
        {/* Name + status badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-base leading-tight truncate">{pipeline.name}</div>
            {pipeline.description ? (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                {pipeline.description}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/40 mt-1 italic">Chưa có mô tả</p>
            )}
          </div>
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[10px] font-mono tracking-wider", status.cls)}
          >
            {status.label}
          </Badge>
        </div>

        {/* Trigger info */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <TriggerIcon className={cn("w-3.5 h-3.5 shrink-0", trigger.color)} />
          <span className={cn("text-xs font-medium", trigger.color)}>{trigger.label}</span>
          {pipeline.trigger.schedule && (
            <code className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
              {pipeline.trigger.schedule}
            </code>
          )}
          {pipeline.trigger.channelId && (
            <span className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">
              {pipeline.trigger.channelId}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" />
            {pipeline.nodes.length} nodes
          </span>
          {(pipeline.runCount ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <GitFork className="w-3 h-3" />
              {pipeline.runCount} lần chạy
            </span>
          )}
        </div>

        {/* Last run */}
        <div className="text-[11px] text-muted-foreground/50 font-mono">
          Lần cuối chạy: {fmtDate(pipeline.lastRunAt)}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/40 mt-auto">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs gap-1.5 uppercase tracking-wide"
            onClick={onEdit}
          >
            <Edit2 className="w-3 h-3" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 text-green-400 border-green-500/30 hover:bg-green-500/10 hover:text-green-300"
            title="Chạy ngay"
            onClick={onRun}
          >
            <Play className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
            title="Xóa pipeline"
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  )
}
