"use client"

import { useState } from "react"
import {
  Bot, Clock, GitBranch, Radio, Cpu, Timer,
  Save, Play, Trash2, ChevronLeft, Plus, ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { FlowNodeType } from "@zerobot/shared"

// ── Node definitions ──────────────────────────────────────────────────────────

interface NodeDef {
  type: FlowNodeType
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  defaultData: Record<string, unknown>
}

export const NODE_DEFS: NodeDef[] = [
  {
    type: "trigger",
    label: "Kịch bản bắt đầu",
    description: "Xác định khi nào pipeline chạy",
    icon: Clock,
    color: "text-cyan-400",
    defaultData: { triggerType: "manual", label: "Start" },
  },
  {
    type: "agent",
    label: "Agent",
    description: "Giao việc cho một AI agent",
    icon: Bot,
    color: "text-green-400",
    defaultData: { agentId: "", agentName: "Chưa chọn", taskPrompt: "" },
  },
  {
    type: "condition",
    label: "Điều kiện",
    description: "Rẽ nhánh dựa trên kết quả",
    icon: GitBranch,
    color: "text-amber-400",
    defaultData: { conditionType: "contains", conditionValue: "", trueLabel: "Đúng", falseLabel: "Sai" },
  },
  {
    type: "channel",
    label: "Gửi thông báo",
    description: "Gửi tin nhắn qua kênh",
    icon: Radio,
    color: "text-purple-400",
    defaultData: { channelId: "", messageTemplate: "{{output}}" },
  },
  {
    type: "mcp",
    label: "Công cụ MCP",
    description: "Gọi công cụ từ MCP server",
    icon: Cpu,
    color: "text-blue-400",
    defaultData: { serverId: "", toolName: "" },
  },
  {
    type: "delay",
    label: "Chờ",
    description: "Dừng lại một khoảng thời gian",
    icon: Timer,
    color: "text-muted-foreground",
    defaultData: { durationMs: 5000 },
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface FlowToolbarProps {
  pipelineName: string
  onNameChange:  (name: string) => void
  onAddNode:     (type: FlowNodeType, defaultData: Record<string, unknown>) => void
  onSave:        () => void
  onRun:         () => void
  onBack:        () => void
  isSaving?:     boolean
  isDirty?:      boolean
}

export function FlowToolbar({
  pipelineName, onNameChange, onAddNode,
  onSave, onRun, onBack, isSaving, isDirty,
}: FlowToolbarProps) {
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="flex items-center gap-2 h-12 px-3 border-b border-border bg-card/90 backdrop-blur-sm shrink-0 relative z-10">

      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
        onClick={onBack}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        Pipelines
      </Button>

      <Separator orientation="vertical" className="h-5 shrink-0" />

      {/* Pipeline name */}
      <input
        value={pipelineName}
        onChange={e => onNameChange(e.target.value)}
        className={cn(
          "font-mono text-sm font-bold bg-transparent border-none outline-none",
          "text-foreground w-52 min-w-0 shrink-0",
          isDirty && "text-amber-400"
        )}
        placeholder="pipeline-name"
      />
      {isDirty && (
        <span className="text-[10px] text-amber-400/60 shrink-0">● chưa lưu</span>
      )}

      <Separator orientation="vertical" className="h-5 shrink-0" />

      {/* Add node dropdown */}
      <div className="relative shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs uppercase tracking-wide"
          onClick={() => setAddOpen(o => !o)}
        >
          <Plus className="w-3 h-3" />
          Thêm Node
          <ChevronDown className={cn("w-3 h-3 transition-transform", addOpen && "rotate-180")} />
        </Button>

        {addOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-10" onClick={() => setAddOpen(false)} />
            {/* Dropdown */}
            <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-xl z-20 overflow-hidden py-1">
              {NODE_DEFS.map(def => (
                <button
                  key={def.type}
                  onClick={() => {
                    onAddNode(def.type, def.defaultData)
                    setAddOpen(false)
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left"
                >
                  <def.icon className={cn("w-4 h-4 shrink-0", def.color)} />
                  <div>
                    <div className="text-sm font-medium">{def.label}</div>
                    <div className="text-xs text-muted-foreground">{def.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
          onClick={() => {
            if (confirm("Xóa toàn bộ nodes trên canvas?")) {
              onAddNode("__clear__" as FlowNodeType, {})
            }
          }}
        >
          <Trash2 className="w-3 h-3" />
          Clear
        </Button>

        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-xs gap-1.5",
            isDirty && "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
          )}
          onClick={onSave}
          disabled={isSaving}
        >
          <Save className={cn("w-3 h-3", isSaving && "animate-spin")} />
          {isSaving ? "Đang lưu..." : "Lưu"}
        </Button>

        <Button
          size="sm"
          className="h-7 text-xs gap-1.5 bg-green-500/15 text-green-300 border border-green-500/30 hover:bg-green-500/25"
          onClick={onRun}
        >
          <Play className="w-3 h-3" />
          Chạy
        </Button>
      </div>
    </div>
  )
}
