"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { agentsApi, channelsApi, mcpApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  X, Bot, Clock, GitBranch, Radio, Cpu, Timer,
  Webhook, MessageSquare, Hand, Info,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { FlowNodeType } from "@zerobot/shared"
import type { Node } from "@xyflow/react"

// ── Shared form helpers ───────────────────────────────────────────────────────

function IField({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-widest font-semibold text-foreground/60">
        {label}
      </Label>
      {children}
      {hint && (
        <p className="text-xs text-muted-foreground/70 leading-relaxed">{hint}</p>
      )}
    </div>
  )
}

const CRON_PRESETS = [
  { label: "Mỗi ngày 7:00 sáng", value: "0 7 * * *" },
  { label: "Mỗi ngày 8:00 sáng", value: "0 8 * * *" },
  { label: "Mỗi ngày 12:00 trưa", value: "0 12 * * *" },
  { label: "Mỗi giờ", value: "0 * * * *" },
  { label: "Mỗi 30 phút", value: "*/30 * * * *" },
  { label: "Mỗi thứ Hai 9:00", value: "0 9 * * 1" },
  { label: "Ngày 1 hàng tháng", value: "0 9 1 * *" },
  { label: "Tùy chỉnh...", value: "custom" },
]

const TIMEOUT_OPTIONS = [
  { value: 60, label: "1 phút" },
  { value: 120, label: "2 phút" },
  { value: 300, label: "5 phút" },
  { value: 600, label: "10 phút" },
]

const DELAY_OPTIONS = [
  { value: 10_000, label: "10 giây" },
  { value: 30_000, label: "30 giây" },
  { value: 60_000, label: "1 phút" },
  { value: 300_000, label: "5 phút" },
  { value: -1, label: "Tùy chỉnh..." },
]

const CONDITION_TYPES = [
  { value: "contains", label: "Output chứa đoạn văn" },
  { value: "not_contains", label: "Output không chứa đoạn văn" },
  { value: "length_gt", label: "Output dài hơn N ký tự" },
  { value: "json_field", label: "JSON field bằng giá trị" },
  { value: "no_error", label: "Không có lỗi (không chứa ERROR)" },
  { value: "always", label: "Luôn đúng (pass-through)" },
]

const CHANNEL_LIST = [
  { value: "telegram", label: "Telegram" },
  { value: "discord", label: "Discord" },
  { value: "slack", label: "Slack" },
  { value: "mattermost", label: "Mattermost" },
  { value: "webhook", label: "Webhook" },
]

// ── Inspectors per node type ──────────────────────────────────────────────────

// Trigger
function TriggerInspector({
  data, onChange,
}: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v })
  const triggerType = String(data.triggerType ?? "manual")
  const cronValue = String(data.schedule ?? "0 7 * * *")
  const isCustom = !CRON_PRESETS.slice(0, -1).some(p => p.value === cronValue)

  return (
    <div className="space-y-4">
      <IField label="Loại kịch bản" hint="Pipeline sẽ bắt đầu khi nào?">
        <div className="space-y-1.5">
          {[
            { value: "cron", label: "Theo lịch định sẵn", icon: Clock, color: "text-cyan-400" },
            { value: "channel", label: "Khi nhận tin nhắn", icon: MessageSquare, color: "text-purple-400" },
            { value: "webhook", label: "Webhook từ ngoài", icon: Webhook, color: "text-blue-400" },
            { value: "manual", label: "Thủ công", icon: Hand, color: "text-muted-foreground" },
          ].map(opt => {
            const Icon = opt.icon
            const active = triggerType === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => set("triggerType", opt.value)}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-2 rounded-md border text-left transition-all",
                  active ? "border-primary/40 bg-primary/5" : "border-border/40 hover:border-border hover:bg-muted/30"
                )}
              >
                <Icon className={cn("w-3.5 h-3.5 shrink-0", active ? opt.color : "text-muted-foreground")} />
                <span className={cn("text-sm", active ? opt.color : "text-foreground")}>{opt.label}</span>
              </button>
            )
          })}
        </div>
      </IField>

      {/* Cron config */}
      {triggerType === "cron" && (
        <>
          <Separator />
          <IField label="Lịch chạy" hint="Chọn preset hoặc nhập cron expression tùy chỉnh">
            <Select
              value={isCustom ? "custom" : cronValue}
              onValueChange={v => v !== "custom" ? set("schedule", v) : set("schedule", "")}
            >
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CRON_PRESETS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isCustom && (
              <Input
                value={cronValue}
                onChange={e => set("schedule", e.target.value)}
                className="mt-1.5 font-mono text-sm"
                placeholder="0 7 * * *"
              />
            )}
            {cronValue && (
              <p className="text-xs text-cyan-400/80 font-mono mt-1">cron: {cronValue}</p>
            )}
          </IField>
        </>
      )}

      {/* Channel config */}
      {triggerType === "channel" && (
        <>
          <Separator />
          <IField label="Kênh nhận tin nhắn">
            <Select value={String(data.channelId ?? "telegram")} onValueChange={v => set("channelId", v)}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNEL_LIST.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </IField>
          <IField label="Bộ lọc từ khóa" hint="Để trống = nhận mọi tin nhắn. Nhập từ khóa để lọc.">
            <Input
              value={String(data.keywordFilter ?? "")}
              onChange={e => set("keywordFilter", e.target.value)}
              className="text-sm"
              placeholder="ví dụ: báo cáo, /report"
            />
          </IField>
        </>
      )}

      {/* Webhook info */}
      {triggerType === "webhook" && (
        <>
          <Separator />
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-500/5 border border-blue-500/20">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300/80 leading-relaxed">
              ZeraBot sẽ cấp URL webhook sau khi lưu pipeline. Gọi POST vào URL đó từ hệ thống ngoài để kích hoạt.
            </p>
          </div>
          {!!data.webhookPath && (
            <IField label="Webhook URL">
              <code className="block text-xs font-mono bg-muted px-2 py-1.5 rounded text-cyan-300 break-all">
                /api/pipelines/{String(data.webhookPath)}/trigger
              </code>
            </IField>
          )}
        </>
      )}
    </div>
  )
}

// Agent
function AgentInspector({
  data, onChange,
}: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v })

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: agentsApi.list,
  })

  const selectedAgent = agents.find(a => a.id === data.agentId)

  return (
    <div className="space-y-4">
      <IField label="Chọn Agent" hint="Agent nào sẽ thực hiện nhiệm vụ này?">
        <Select
          value={String(data.agentId ?? "")}
          onValueChange={v => {
            const agent = agents.find(a => a.id === v)
            onChange({ ...data, agentId: v, agentName: agent?.name ?? v, model: agent?.model })
          }}
        >
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="— Chọn agent —" />
          </SelectTrigger>
          <SelectContent>
            {agents.length === 0 && (
              <SelectItem value="__none__" disabled>Chưa có agent nào</SelectItem>
            )}
            {agents.map(a => (
              <SelectItem key={a.id} value={a.id}>
                <span className="mr-1.5">{a.emoji ?? "🤖"}</span>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedAgent && (
          <div className="mt-2 p-2.5 rounded-md bg-green-500/5 border border-green-500/15 text-xs space-y-0.5">
            <div className="font-mono text-muted-foreground">{selectedAgent.model}</div>
            {selectedAgent.mission && (
              <div className="text-muted-foreground/70 line-clamp-2">{selectedAgent.mission}</div>
            )}
          </div>
        )}
      </IField>

      <IField
        label="Nhiệm vụ trong pipeline này"
        hint="Mô tả cụ thể những gì agent phải làm ở bước này. Agent sẽ nhận task này khi pipeline chạy."
      >
        <Textarea
          value={String(data.taskPrompt ?? "")}
          onChange={e => set("taskPrompt", e.target.value)}
          className="text-sm resize-none min-h-24"
          placeholder="Ví dụ: Phân tích dữ liệu bán hàng hôm qua, tổng hợp top 10 sản phẩm bán chạy và tính tổng doanh thu..."
        />
      </IField>

      <IField label="Nhận kết quả từ bước trước?" hint="Truyền output của node trước vào context của agent này.">
        <div className="flex items-center gap-2">
          <Switch
            checked={!!data.receiveInput}
            onCheckedChange={v => set("receiveInput", v)}
          />
          <span className="text-sm text-muted-foreground">
            {data.receiveInput ? "Có — agent nhận context từ node trước" : "Không — agent chạy độc lập"}
          </span>
        </div>
      </IField>

      <IField label="Timeout" hint="Thời gian tối đa cho agent hoàn thành nhiệm vụ.">
        <Select
          value={String(data.timeoutSec ?? 120)}
          onValueChange={v => set("timeoutSec", Number(v))}
        >
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {TIMEOUT_OPTIONS.map(o => (
              <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </IField>
    </div>
  )
}

// Condition
function ConditionInspector({
  data, onChange,
}: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v })
  const condType = String(data.conditionType ?? "contains")
  const needsValue = ["contains", "not_contains", "length_gt", "json_field"].includes(condType)

  return (
    <div className="space-y-4">
      <IField label="Điều kiện" hint="Kiểm tra output của node trước để quyết định đi hướng nào.">
        <Select value={condType} onValueChange={v => set("conditionType", v)}>
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CONDITION_TYPES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </IField>

      {needsValue && (
        <IField
          label={condType === "length_gt" ? "Số ký tự tối thiểu" : condType === "json_field" ? "Field = Giá trị" : "Đoạn văn cần tìm"}
          hint={condType === "json_field" ? "Nhập dạng: output.status=ok" : undefined}
        >
          <Input
            value={String(data.conditionValue ?? "")}
            onChange={e => set("conditionValue", e.target.value)}
            className="text-sm font-mono"
            placeholder={
              condType === "length_gt" ? "100" :
                condType === "json_field" ? "output.status=ok" : "success"
            }
          />
        </IField>
      )}

      <Separator />

      <IField label="Nếu đúng → nhãn nhánh">
        <Input
          value={String(data.trueLabel ?? "Đúng")}
          onChange={e => set("trueLabel", e.target.value)}
          className="text-sm"
          placeholder="Đúng"
        />
      </IField>
      <IField label="Nếu sai → nhãn nhánh">
        <Input
          value={String(data.falseLabel ?? "Sai")}
          onChange={e => set("falseLabel", e.target.value)}
          className="text-sm"
          placeholder="Sai"
        />
      </IField>
    </div>
  )
}

// Channel / Notify
function ChannelInspector({
  data, onChange,
}: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v })

  return (
    <div className="space-y-4">
      <IField label="Gửi đến kênh" hint="Chọn kênh đã được bật trong phần Channels.">
        <Select value={String(data.channelId ?? "")} onValueChange={v => set("channelId", v)}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="— Chọn kênh —" />
          </SelectTrigger>
          <SelectContent>
            {CHANNEL_LIST.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </IField>

      <IField
        label="Nội dung tin nhắn"
        hint="Sử dụng {{output}} để chèn kết quả từ node trước. Các biến: {{date}}, {{pipeline_name}}, {{agent}}"
      >
        <Textarea
          value={String(data.messageTemplate ?? "{{output}}")}
          onChange={e => set("messageTemplate", e.target.value)}
          className="text-sm resize-none min-h-28 font-mono"
          placeholder="📊 Báo cáo ngày {{date}}:&#10;&#10;{{output}}&#10;&#10;— ZeraBot"
        />
      </IField>

      <div className="flex flex-wrap gap-1">
        {["{{output}}", "{{date}}", "{{pipeline_name}}", "{{agent}}", "{{run_id}}"].map(v => (
          <button
            key={v}
            type="button"
            onClick={() => set("messageTemplate", String(data.messageTemplate ?? "") + v)}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-cyan-400 border border-border/40"
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

// MCP
function McpInspector({
  data, onChange,
}: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v })

  const { data: servers = [] } = useQuery({
    queryKey: ["mcp"],
    queryFn: mcpApi.list,
  })

  const selectedServer = servers.find(s => s.id === data.serverId)

  // Load tools when server selected
  const { data: toolsData } = useQuery({
    queryKey: ["mcp-tools", data.serverId],
    queryFn: () => mcpApi.discover(String(data.serverId)),
    enabled: !!data.serverId,
  })
  const tools = toolsData?.tools ?? []

  return (
    <div className="space-y-4">
      <IField label="MCP Server" hint="Chọn server cung cấp công cụ bạn muốn gọi.">
        <Select
          value={String(data.serverId ?? "")}
          onValueChange={v => {
            const s = servers.find(sv => sv.id === v)
            onChange({ ...data, serverId: v, serverName: s?.name ?? v, toolName: "" })
          }}
        >
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="— Chọn MCP server —" />
          </SelectTrigger>
          <SelectContent>
            {servers.length === 0 && (
              <SelectItem value="__none__" disabled>Chưa có MCP server nào</SelectItem>
            )}
            {servers.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedServer?.description && (
          <p className="text-xs text-muted-foreground/70 mt-1">{selectedServer.description}</p>
        )}
      </IField>

      {!!data.serverId && (
        <IField label="Tool" hint="Chọn công cụ từ server này để gọi.">
          <Select value={String(data.toolName ?? "")} onValueChange={v => set("toolName", v)}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder={tools.length === 0 ? "Đang tải tools..." : "— Chọn tool —"} />
            </SelectTrigger>
            <SelectContent>
              {tools.map(t => (
                <SelectItem key={String(t.name)} value={String(t.name)}>
                  <div>
                    <div className="font-mono text-xs">{String(t.name)}</div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground">{String(t.description)}</div>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </IField>
      )}

      {!!data.toolName && (
        <IField label="Input (JSON)" hint="Truyền tham số vào tool. Dùng {{output}} để lấy kết quả từ node trước.">
          <Textarea
            value={String(data.inputTemplate ?? "{}")}
            onChange={e => set("inputTemplate", e.target.value)}
            className="text-sm font-mono resize-none min-h-20"
            placeholder='{"date": "{{date}}", "limit": 100}'
          />
        </IField>
      )}

      <IField label="Truyền kết quả sang bước tiếp theo?">
        <div className="flex items-center gap-2">
          <Switch
            checked={data.passOutput !== false}
            onCheckedChange={v => set("passOutput", v)}
          />
          <span className="text-sm text-muted-foreground">
            {data.passOutput !== false ? "Có" : "Không"}
          </span>
        </div>
      </IField>
    </div>
  )
}

// Delay
function DelayInspector({
  data, onChange,
}: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v })
  const ms = Number(data.durationMs ?? 5000)
  const isCustom = !DELAY_OPTIONS.slice(0, -1).some(o => o.value === ms)

  return (
    <div className="space-y-4">
      <IField label="Thời gian chờ" hint="Pipeline sẽ tạm dừng trước khi tiếp tục sang bước tiếp theo.">
        <Select
          value={isCustom ? "-1" : String(ms)}
          onValueChange={v => { if (v !== "-1") set("durationMs", Number(v)) }}
        >
          <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DELAY_OPTIONS.map(o => (
              <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isCustom && (
          <div className="flex items-center gap-2 mt-1.5">
            <Input
              type="number"
              value={ms / 1000}
              min={1}
              onChange={e => set("durationMs", Number(e.target.value) * 1000)}
              className="w-24 text-sm font-mono"
            />
            <span className="text-sm text-muted-foreground">giây</span>
          </div>
        )}
      </IField>

      <IField label="Ghi chú" hint="Mô tả lý do chờ (tùy chọn, chỉ để đọc cho dễ hiểu)">
        <Input
          value={String(data.label ?? "")}
          onChange={e => set("label", e.target.value)}
          className="text-sm"
          placeholder="Ví dụ: Chờ agent phân tích xong..."
        />
      </IField>
    </div>
  )
}

// ── Inspector header config ───────────────────────────────────────────────────

const INSPECTOR_META: Record<FlowNodeType, {
  title: string
  icon: React.ComponentType<{ className?: string }>
  color: string
}> = {
  trigger: { title: "Kịch bản bắt đầu", icon: Clock, color: "text-cyan-400 border-cyan-500/20" },
  agent: { title: "Cấu hình Agent", icon: Bot, color: "text-green-400 border-green-500/20" },
  condition: { title: "Điều kiện rẽ nhánh", icon: GitBranch, color: "text-amber-400 border-amber-500/20" },
  channel: { title: "Gửi thông báo", icon: Radio, color: "text-purple-400 border-purple-500/20" },
  mcp: { title: "Công cụ MCP", icon: Cpu, color: "text-blue-400 border-blue-500/20" },
  delay: { title: "Chờ", icon: Timer, color: "text-muted-foreground border-border" },
}

// ── Main Inspector panel ──────────────────────────────────────────────────────

interface FlowInspectorProps {
  node: Node | null
  onClose: () => void
  onChange: (nodeId: string, data: Record<string, unknown>) => void
}

export function FlowInspector({ node, onClose, onChange }: FlowInspectorProps) {
  const [localData, setLocalData] = useState<Record<string, unknown>>({})

  // Sync local data when selected node changes
  useEffect(() => {
    if (node) setLocalData(node.data as Record<string, unknown>)
  }, [node?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null

  const type = node.type as FlowNodeType
  const meta = INSPECTOR_META[type]
  if (!meta) return null

  const MetaIcon = meta.icon

  const handleChange = (newData: Record<string, unknown>) => {
    setLocalData(newData)
    onChange(node.id, newData)
  }

  const renderForm = () => {
    switch (type) {
      case "trigger": return <TriggerInspector data={localData} onChange={handleChange} />
      case "agent": return <AgentInspector data={localData} onChange={handleChange} />
      case "condition": return <ConditionInspector data={localData} onChange={handleChange} />
      case "channel": return <ChannelInspector data={localData} onChange={handleChange} />
      case "mcp": return <McpInspector data={localData} onChange={handleChange} />
      case "delay": return <DelayInspector data={localData} onChange={handleChange} />
      default: return null
    }
  }

  return (
    <div className="w-80 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className={cn(
        "flex items-center gap-2.5 px-4 py-3 border-b shrink-0",
        meta.color
      )}>
        <MetaIcon className="w-4 h-4 shrink-0" />
        <div className="flex-1">
          <div className="text-xs font-bold uppercase tracking-wider">{meta.title}</div>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{node.id}</div>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/20 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {renderForm()}
      </div>

      {/* Footer hint */}
      <div className="shrink-0 px-4 py-2.5 border-t border-border/50 bg-muted/20">
        <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
          Thay đổi được áp dụng ngay lên canvas. Nhấn <span className="font-bold text-foreground/30">Lưu</span> trên toolbar để ghi vào database.
        </p>
      </div>
    </div>
  )
}
