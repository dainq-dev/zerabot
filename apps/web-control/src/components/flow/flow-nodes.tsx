"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import {
  Bot, Clock, GitBranch, Radio, Cpu, Timer,
  Webhook, MessageSquare, Hand, CheckCircle2, XCircle, ArrowRight,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Shared node wrapper ───────────────────────────────────────────────────────
function NodeShell({
  title,
  subtitle,
  icon: Icon,
  headerClass,
  selected,
  hasInput = true,
  hasOutput = true,
  children,
  warning,
  hint,
}: {
  title: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  headerClass: string
  selected?: boolean
  hasInput?: boolean
  hasOutput?: boolean
  children?: React.ReactNode
  warning?: string
  hint?: string
}) {
  return (
    <div
      className={cn(
        "min-w-50 max-w-65 rounded-lg border bg-card shadow-lg overflow-hidden transition-all duration-150",
        selected
          ? "border-primary ring-2 ring-primary/25 shadow-primary/10"
          : "border-border/60 hover:border-border/90"
      )}
    >
      {/* Header */}
      <div className={cn("flex items-center gap-2 px-3 py-2.5", headerClass)}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold tracking-wider uppercase leading-none">
            {title}
          </div>
          {subtitle && (
            <div className="text-[11px] font-medium mt-0.5 opacity-80 truncate">{subtitle}</div>
          )}
        </div>
      </div>

      {/* Body */}
      {(children || warning || hint) && (
        <div className="px-3 py-2 space-y-1.5">
          {warning && (
            <div className="text-[10px] text-amber-400/80 font-mono italic">{warning}</div>
          )}
          {children}
          {hint && (
            <div className="text-[10px] text-muted-foreground/40 font-mono italic flex items-center gap-1">
              <ArrowRight className="w-3 h-3 shrink-0" />
              {hint}
            </div>
          )}
        </div>
      )}

      {/* Handles */}
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-3! h-3! border-2! border-border! bg-card! hover:bg-primary/40! transition-colors"
        />
      )}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="w-3! h-3! border-2! border-border! bg-card! hover:bg-primary/40! transition-colors"
        />
      )}
    </div>
  )
}

function BodyLine({ label, value, mono = false }: { label: string; value?: string; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-[9px] font-bold tracking-wider text-muted-foreground/50 uppercase w-12 shrink-0 pt-px">
        {label}
      </span>
      <span className={cn("text-[11px] text-muted-foreground line-clamp-2 leading-relaxed", mono && "font-mono")}>
        {value}
      </span>
    </div>
  )
}

// ── Trigger node ──────────────────────────────────────────────────────────────
const TRIGGER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  cron: Clock, webhook: Webhook, channel: MessageSquare, manual: Hand,
}
const TRIGGER_LABELS: Record<string, string> = {
  cron: "Theo lịch", webhook: "Webhook", channel: "Khi nhận tin nhắn", manual: "Thủ công",
}

export function TriggerNode({ data, selected }: NodeProps) {
  const d = data as {
    triggerType?: string; schedule?: string; channelId?: string;
    label?: string; keywordFilter?: string
  }
  const type  = d.triggerType ?? "manual"
  const Icon  = TRIGGER_ICONS[type] ?? Clock
  const label = TRIGGER_LABELS[type] ?? type

  let detail: string | undefined
  if (type === "cron" && d.schedule)     detail = d.schedule
  if (type === "channel" && d.channelId) detail = `từ ${d.channelId}`
  if (type === "webhook")               detail = "URL sẽ hiển thị sau khi lưu"

  const hint = !(d as {_hasOutgoing?: boolean})._hasOutgoing
    ? "→ kết nối đến Agent node tiếp theo"
    : undefined

  return (
    <NodeShell
      title="Kịch bản bắt đầu"
      subtitle={label}
      icon={Icon}
      headerClass="bg-cyan-500/10 text-cyan-300 border-b border-cyan-500/15"
      selected={selected}
      hasInput={false}
      warning={!d.triggerType ? "Chưa cấu hình — click để thiết lập" : undefined}
      hint={hint}
    >
      <BodyLine label="Chi tiết" value={detail} mono={type === "cron"} />
      {d.keywordFilter && <BodyLine label="Từ khóa" value={`"${d.keywordFilter}"`} />}
    </NodeShell>
  )
}

// ── Agent node ────────────────────────────────────────────────────────────────
export function AgentNode({ data, selected }: NodeProps) {
  const d = data as {
    agentId?: string; agentName?: string; model?: string;
    taskPrompt?: string; receiveInput?: boolean;
    _hasOutgoing?: boolean; _hasIncoming?: boolean
  }
  const configured = !!d.agentId

  const hint = !d._hasOutgoing && d.agentId
    ? "→ kết nối đến Notify hoặc Condition"
    : undefined

  return (
    <NodeShell
      title="Agent"
      subtitle={d.agentName ?? (configured ? d.agentId : undefined)}
      icon={Bot}
      headerClass="bg-green-500/10 text-green-300 border-b border-green-500/15"
      selected={selected}
      warning={!configured ? "Chưa chọn agent — click để thiết lập" : undefined}
      hint={hint}
    >
      {d.model && <BodyLine label="Model" value={d.model} mono />}
      {d.taskPrompt && <BodyLine label="Nhiệm vụ" value={d.taskPrompt} />}
      {d.receiveInput && (
        <div className="text-[10px] text-green-400/60 font-mono">← nhận output từ node trước</div>
      )}
    </NodeShell>
  )
}

// ── Condition node (diamond) ──────────────────────────────────────────────────
const CONDITION_LABELS: Record<string, string> = {
  contains:     "Chứa đoạn văn",
  not_contains: "Không chứa",
  length_gt:    "Dài hơn N ký tự",
  json_field:   "JSON field =",
  no_error:     "Không có lỗi",
  always:       "Luôn đúng",
}

export function ConditionNode({ data, selected }: NodeProps) {
  const d = data as {
    conditionType?: string; conditionValue?: string;
    trueLabel?: string; falseLabel?: string
  }
  const label = d.conditionType
    ? CONDITION_LABELS[d.conditionType] ?? d.conditionType
    : "Chưa cấu hình"

  return (
    <div className={cn("relative", selected && "")}>
      {/* Diamond */}
      <div className={cn(
        "w-28 h-28 rotate-45 border-2 flex items-center justify-center bg-amber-500/10",
        selected ? "border-primary" : "border-amber-500/40"
      )}>
        <div className="-rotate-45 flex flex-col items-center gap-1 px-2">
          <GitBranch className="w-4 h-4 text-amber-400" />
          <span className="text-[9px] font-bold tracking-wide text-amber-400 uppercase text-center leading-tight">
            {label}
          </span>
          {d.conditionValue && (
            <span className="text-[9px] font-mono text-amber-300/70 text-center line-clamp-1">
              "{d.conditionValue}"
            </span>
          )}
        </div>
      </div>

      {/* Labels */}
      <div className="absolute -right-8 top-1/4 flex items-center gap-1 -translate-y-1/2 pointer-events-none">
        <CheckCircle2 className="w-3 h-3 text-green-400" />
        <span className="text-[9px] text-green-400 whitespace-nowrap">{d.trueLabel ?? "Đúng"}</span>
      </div>
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-none">
        <XCircle className="w-3 h-3 text-red-400" />
        <span className="text-[9px] text-red-400 whitespace-nowrap">{d.falseLabel ?? "Sai"}</span>
      </div>

      {/* Handles */}
      <Handle type="target" position={Position.Left}
        className="w-3! h-3! border-2! border-amber-500/60! bg-card! top-1/2! -translate-y-1/2!"
      />
      <Handle type="source" id="true" position={Position.Right}
        className="w-3! h-3! border-2! border-green-500/60! bg-card! top-[25%]!"
      />
      <Handle type="source" id="false" position={Position.Bottom}
        className="w-3! h-3! border-2! border-red-500/60! bg-card!"
      />
    </div>
  )
}

// ── Channel / Notify node ─────────────────────────────────────────────────────
export function ChannelNode({ data, selected }: NodeProps) {
  const d = data as { channelId?: string; messageTemplate?: string }

  return (
    <NodeShell
      title="Gửi thông báo"
      subtitle={d.channelId ? `qua ${d.channelId}` : undefined}
      icon={Radio}
      headerClass="bg-purple-500/10 text-purple-300 border-b border-purple-500/15"
      selected={selected}
      warning={!d.channelId ? "Chưa chọn kênh — click để thiết lập" : undefined}
    >
      {d.messageTemplate && (
        <BodyLine label="Nội dung" value={d.messageTemplate} />
      )}
    </NodeShell>
  )
}

// ── MCP node ──────────────────────────────────────────────────────────────────
export function McpNode({ data, selected }: NodeProps) {
  const d = data as { serverId?: string; serverName?: string; toolName?: string }

  return (
    <NodeShell
      title="Công cụ MCP"
      subtitle={d.serverName ?? d.serverId}
      icon={Cpu}
      headerClass="bg-blue-500/10 text-blue-300 border-b border-blue-500/15"
      selected={selected}
      warning={!d.serverId ? "Chưa chọn MCP server — click để thiết lập" : undefined}
    >
      {d.toolName && <BodyLine label="Tool" value={d.toolName} mono />}
    </NodeShell>
  )
}

// ── Delay node ────────────────────────────────────────────────────────────────
export function DelayNode({ data, selected }: NodeProps) {
  const d = data as { durationMs?: number; label?: string }
  const dur = d.durationMs
    ? d.durationMs >= 60_000
      ? `${Math.round(d.durationMs / 60_000)} phút`
      : `${Math.round(d.durationMs / 1_000)} giây`
    : "?"

  return (
    <NodeShell
      title="Chờ"
      subtitle={dur}
      icon={Timer}
      headerClass="bg-muted/60 text-muted-foreground border-b border-border/40"
      selected={selected}
    >
      {d.label && <BodyLine label="Ghi chú" value={d.label} />}
    </NodeShell>
  )
}

// ── Export node types map ─────────────────────────────────────────────────────
export const nodeTypes = {
  trigger:   TriggerNode,
  agent:     AgentNode,
  condition: ConditionNode,
  channel:   ChannelNode,
  mcp:       McpNode,
  delay:     DelayNode,
}
