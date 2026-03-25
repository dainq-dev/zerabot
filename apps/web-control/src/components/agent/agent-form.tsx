"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CheckCircle2, XCircle, AlertTriangle, Check } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IconPicker } from "@/components/shared/icon-picker"
import { agentsApi, mcpApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Agent } from "@zerobot/shared"

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(str: string) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "agent"
}

// ── Constants ────────────────────────────────────────────────────────────────

const MODELS = [
  "anthropic/claude-opus-4-6",
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-haiku-4-5",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
]

type ToolProfile = "minimal" | "standard" | "full" | "custom"

const TOOL_PROFILES: {
  id: ToolProfile
  label: string
  desc: string
  pros: string[]
  cons: string[]
  limit: string
  riskColor: string
  riskLabel: string
}[] = [
  {
    id: "minimal",
    label: "Tối thiểu",
    desc: "Chỉ công cụ nội bộ cơ bản",
    pros: ["Khởi động cực nhanh", "Bề mặt tấn công nhỏ nhất", "Tiêu tốn ít tài nguyên"],
    cons: ["Không truy cập web", "Không đọc/ghi file", "Không thực thi lệnh"],
    limit: "Phù hợp agent chat-only hoặc xử lý văn bản đơn giản",
    riskColor: "text-green-400",
    riskLabel: "An toàn",
  },
  {
    id: "standard",
    label: "Tiêu chuẩn",
    desc: "Web search, web fetch, đọc file",
    pros: ["Đủ dùng cho hầu hết tác vụ", "Cân bằng năng lực & bảo mật", "Tìm kiếm & truy cập web"],
    cons: ["Có thể truy cập internet", "Đọc file cục bộ"],
    limit: "Phù hợp agent nghiên cứu, phân tích, báo cáo",
    riskColor: "text-cyan-400",
    riskLabel: "Thấp",
  },
  {
    id: "full",
    label: "Đầy đủ",
    desc: "Tất cả công cụ, bao gồm thực thi lệnh",
    pros: ["Năng lực tối đa", "Thực thi shell command", "Ghi/sửa/xóa file"],
    cons: ["Tiêu tốn nhiều tài nguyên", "Bề mặt tấn công lớn", "Nguy cơ cao nếu bị lạm dụng"],
    limit: "Chỉ dùng cho agent tin cậy cao, có sandbox bảo vệ",
    riskColor: "text-amber-400",
    riskLabel: "Trung bình",
  },
  {
    id: "custom",
    label: "Tùy chỉnh",
    desc: "Chọn thủ công từng công cụ",
    pros: ["Kiểm soát hoàn toàn", "Tối ưu cho use-case cụ thể"],
    cons: ["Cần cấu hình thủ công", "Dễ bỏ sót công cụ cần thiết"],
    limit: "Dùng khi biết rõ nhu cầu và muốn giảm thiểu quyền truy cập",
    riskColor: "text-primary",
    riskLabel: "Tùy chỉnh",
  },
]

const CUSTOM_TOOLS: { id: string; label: string; hint: string; risk: "safe" | "warn" | "danger" }[] = [
  { id: "web_search", label: "Tìm kiếm web",       hint: "Tìm kiếm qua Google/Brave",        risk: "warn" },
  { id: "web_fetch",  label: "Lấy nội dung web",    hint: "Đọc nội dung URL bất kỳ",          risk: "warn" },
  { id: "fs_read",    label: "Đọc file cục bộ",     hint: "Đọc file trong workspace",         risk: "safe" },
  { id: "fs_write",   label: "Ghi file cục bộ",     hint: "Tạo, sửa, xóa file",              risk: "warn" },
  { id: "exec",       label: "Thực thi lệnh shell", hint: "Chạy lệnh hệ thống trực tiếp",    risk: "danger" },
  { id: "sessions",   label: "Quản lý phiên",       hint: "Tạo và quản lý sub-agent session", risk: "safe" },
  { id: "automation", label: "Tự động hóa",         hint: "Điều khiển trình duyệt, script",  risk: "warn" },
  { id: "memory",     label: "Bộ nhớ dài hạn",      hint: "Lưu/đọc memory engine nội bộ",    risk: "safe" },
]

type LimitsPreset = "low" | "normal" | "high" | "custom"

const LIMIT_PRESETS: Record<Exclude<LimitsPreset, "custom">, { ram: number; tokens: number; concurrent: number }> = {
  low:    { ram: 20,  tokens: 1_000,  concurrent: 1 },
  normal: { ram: 50,  tokens: 3_000,  concurrent: 2 },
  high:   { ram: 200, tokens: 15_000, concurrent: 5 },
}

const PRESET_META: { id: LimitsPreset; label: string; desc: string; color: string }[] = [
  { id: "low",    label: "Thấp",        desc: "20 MB · 1 000 tok/h · 1 tác vụ",   color: "text-green-400" },
  { id: "normal", label: "Bình thường", desc: "50 MB · 3 000 tok/h · 2 tác vụ",   color: "text-cyan-400" },
  { id: "high",   label: "Cao",         desc: "200 MB · 15 000 tok/h · 5 tác vụ", color: "text-amber-400" },
  { id: "custom", label: "Tùy chỉnh",   desc: "Nhập giá trị thủ công",             color: "text-primary" },
]

// ── Field wrapper ─────────────────────────────────────────────────────────────
// Scale: label=text-xs uppercase, hint=text-xs, input=text-base (via Input default)

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-widest font-semibold text-foreground/55">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────

interface AgentFormProps {
  agent?: Agent | null
  open: boolean
  onClose: () => void
}

export function AgentForm({ agent, open, onClose }: AgentFormProps) {
  const qc = useQueryClient()
  const isEdit = !!agent

  const [form, setForm] = useState({
    name:               agent?.name ?? "",
    emoji:              agent?.emoji ?? "Bot",
    model:              agent?.model ?? "anthropic/claude-haiku-4-5",
    soul:               agent?.soul ?? "",
    mission:            agent?.mission ?? "",
    instructions:       agent?.instructions ?? "",
    toolsProfile:       (agent?.toolsProfile ?? "minimal") as ToolProfile,
    toolsAllow:         (agent?.toolsAllow ?? []) as string[],
    mcpServers:         (agent?.mcpServers ?? []) as string[],
    maxRamMb:           agent?.limits?.maxRamMb ?? 50,
    maxTokensPerHour:   agent?.limits?.maxTokensPerHour ?? 3000,
    maxConcurrentTasks: agent?.limits?.maxConcurrentTasks ?? 2,
    limitsPreset:       "normal" as LimitsPreset,
    enabled:            agent?.enabled ?? true,
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  function resetForm() {
    setForm({
      name: "", emoji: "Bot", model: "anthropic/claude-haiku-4-5",
      soul: "", mission: "", instructions: "",
      toolsProfile: "minimal", toolsAllow: [], mcpServers: [],
      maxRamMb: 50, maxTokensPerHour: 3000, maxConcurrentTasks: 2,
      limitsPreset: "normal", enabled: true,
    })
  }

  const { data: mcpServers = [] } = useQuery({
    queryKey: ["mcp"],
    queryFn: mcpApi.list,
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: () => {
      const limits = {
        maxRamMb: form.maxRamMb,
        maxTokensPerHour: form.maxTokensPerHour,
        maxConcurrentTasks: form.maxConcurrentTasks,
      }
      if (isEdit) {
        return agentsApi.update(agent!.id, { ...form, limits })
      }
      return agentsApi.create({ ...form, id: slugify(form.name), limits })
    },
    onSuccess: () => {
      toast.success(isEdit ? "Đã cập nhật agent" : "Đã tạo agent thành công")
      qc.invalidateQueries({ queryKey: ["agents"] })
      onClose()
      if (!isEdit) resetForm()
    },
    onError: (err) => toast.error(`Lỗi: ${String(err)}`),
  })

  function toggleMcp(id: string) {
    set("mcpServers", form.mcpServers.includes(id)
      ? form.mcpServers.filter(s => s !== id)
      : [...form.mcpServers, id])
  }

  function toggleTool(id: string) {
    set("toolsAllow", form.toolsAllow.includes(id)
      ? form.toolsAllow.filter(t => t !== id)
      : [...form.toolsAllow, id])
  }

  function applyPreset(preset: LimitsPreset) {
    if (preset !== "custom") {
      const p = LIMIT_PRESETS[preset]
      setForm(f => ({ ...f, limitsPreset: preset, maxRamMb: p.ram, maxTokensPerHour: p.tokens, maxConcurrentTasks: p.concurrent }))
    } else {
      set("limitsPreset", preset)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); if (!isEdit) resetForm() } }}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase tracking-widest font-bold text-foreground">
            {isEdit ? `Chỉnh sửa — ${agent.name}` : "Tạo Agent Mới"}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {isEdit ? "Cập nhật cấu hình agent" : "Cấu hình một ZeroClaw agent mới"}
          </p>
        </DialogHeader>

        <Tabs defaultValue="basic" className="mt-2">
          {/* Tab bar */}
          <TabsList className="w-full bg-muted/40 border border-border/60 p-0.5 gap-0.5">
            {[
              { value: "basic",       label: "Cơ bản" },
              { value: "personality", label: "Cá tính" },
              { value: "tools",       label: "Công cụ" },
              { value: "limits",      label: "Giới hạn" },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-1 text-base uppercase tracking-wider py-2 data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Cơ bản ── */}
          <TabsContent value="basic" className="space-y-5 mt-5">
            <Field label="Tên hiển thị">
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Orchestrator"
                className="h-11 text-base"
              />
            </Field>

            <Field label="Biểu tượng">
              <IconPicker value={form.emoji} onChange={(id) => set("emoji", id)} />
            </Field>

            <Field label="Mô hình AI">
              <Select value={form.model} onValueChange={(v) => set("model", v)} modal>
                <SelectTrigger className="h-11 text-base font-mono uppercase tracking-wide">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m} value={m} className="text-sm font-mono uppercase tracking-wide">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Nhiệm vụ" hint="Mô tả ngắn gọn mục đích của agent này">
              <Textarea
                value={form.mission}
                onChange={(e) => set("mission", e.target.value)}
                className="text-base resize-y min-h-36"
                placeholder="Điều phối các sub-agent và quản lý quy trình làm việc…"
              />
            </Field>
          </TabsContent>

          {/* ── Cá tính ── */}
          <TabsContent value="personality" className="space-y-6 mt-5">
            <Field label="Linh hồn" hint="Tính cách, phong cách giao tiếp, giọng điệu của agent">
              <Textarea
                value={form.soul}
                onChange={(e) => set("soul", e.target.value)}
                className="text-sm font-mono resize-y min-h-36"
                placeholder="Chuyên nghiệp, súc tích, phân tích. Ưa output có cấu trúc…"
              />
            </Field>
            <Field label="Hướng dẫn" hint="Chỉ thị vận hành cụ thể cho agent này">
              <Textarea
                value={form.instructions}
                onChange={(e) => set("instructions", e.target.value)}
                className="text-sm font-mono resize-y min-h-44"
                placeholder="Luôn kiểm tra dữ liệu trước khi báo cáo. Dùng bullet points…"
              />
            </Field>
          </TabsContent>

          {/* ── Công cụ ── */}
          <TabsContent value="tools" className="space-y-5 mt-5">

            {/* Profile cards — title only */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest font-semibold text-foreground/55">
                Bộ công cụ
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {TOOL_PROFILES.map((p) => {
                  const active = form.toolsProfile === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => set("toolsProfile", p.id)}
                      className={cn(
                        "flex flex-col items-center gap-2 py-5 px-3 rounded-lg border transition-all",
                        active
                          ? "border-primary/50 bg-primary/8 ring-1 ring-primary/25"
                          : "border-border hover:border-border/80 hover:bg-muted/20"
                      )}
                    >
                      <span className={cn("text-base font-bold uppercase tracking-wide", active ? "text-primary" : "text-foreground")}>
                        {p.label}
                      </span>
                      <span className={cn("text-xs font-mono", p.riskColor)}>
                        ● {p.riskLabel}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Detail panel */}
            {(() => {
              const p = TOOL_PROFILES.find(x => x.id === form.toolsProfile)!
              return (
                <div className="rounded-lg border border-border/60 bg-muted/10 p-5 space-y-4">
                  <p className="text-sm text-muted-foreground">{p.desc}</p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                    {p.pros.map(pro => (
                      <div key={pro} className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                        <span className="text-sm text-foreground/80">{pro}</span>
                      </div>
                    ))}
                    {p.cons.map(con => (
                      <div key={con} className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-400/70 shrink-0" />
                        <span className="text-sm text-muted-foreground">{con}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-start gap-2 pt-3 border-t border-border/40">
                    <AlertTriangle className="w-4 h-4 text-muted-foreground/50 mt-0.5 shrink-0" />
                    <span className="text-xs text-muted-foreground/70">{p.limit}</span>
                  </div>
                </div>
              )
            })()}

            {/* Custom checklist — chỉ hiện khi profile = custom */}
            {form.toolsProfile === "custom" && (
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-widest font-semibold text-foreground/55">
                  Danh sách công cụ được phép
                </Label>
                <div className="rounded-lg border border-border overflow-hidden divide-y divide-border/50">
                  {CUSTOM_TOOLS.map((tool) => {
                    const checked = form.toolsAllow.includes(tool.id)
                    const riskBadge = {
                      safe:   <span className="text-xs text-green-400 font-mono tracking-wide">AN TOÀN</span>,
                      warn:   <span className="text-xs text-amber-400 font-mono tracking-wide">CẨN THẬN</span>,
                      danger: <span className="text-xs text-red-400 font-mono tracking-wide">NGUY HIỂM</span>,
                    }[tool.risk]
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => toggleTool(tool.id)}
                        className={cn(
                          "w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors",
                          checked ? "bg-primary/5" : "hover:bg-muted/20"
                        )}
                      >
                        <div className={cn(
                          "w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors",
                          checked ? "bg-primary border-primary" : "border-border"
                        )}>
                          {checked && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-medium text-foreground">{tool.label}</span>
                            {riskBadge}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{tool.hint}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
                {form.toolsAllow.length === 0 && (
                  <p className="text-xs text-amber-400/80">
                    ⚠ Chưa chọn công cụ nào — agent sẽ không thực hiện được tác vụ nào
                  </p>
                )}
              </div>
            )}

            {/* MCP Servers */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest font-semibold text-foreground/55">
                MCP Servers
              </Label>
              {mcpServers.length === 0 ? (
                <div className="rounded-lg border border-border/50 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
                  Chưa có MCP server nào. Thêm server trong trang{" "}
                  <span className="text-primary">MCP Gateway</span>.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {mcpServers.map((srv) => {
                    const active = form.mcpServers.includes(srv.id)
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        onClick={() => toggleMcp(srv.id)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-mono transition-all",
                          active
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground hover:bg-muted/20"
                        )}
                      >
                        {active && <Check className="w-3.5 h-3.5" />}
                        {srv.id}
                        {srv.name !== srv.id && (
                          <span className="opacity-50">— {srv.name}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
              {form.mcpServers.length > 0 && (
                <p className="text-xs text-muted-foreground/70">
                  Đã chọn: {form.mcpServers.join(", ")}
                </p>
              )}
            </div>
          </TabsContent>

          {/* ── Giới hạn ── */}
          <TabsContent value="limits" className="space-y-5 mt-5">

            {/* Preset cards */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest font-semibold text-foreground/55">
                Mức giới hạn
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {PRESET_META.map((p) => {
                  const active = form.limitsPreset === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p.id)}
                      className={cn(
                        "text-left px-4 py-4 rounded-lg border transition-all",
                        active
                          ? "border-primary/50 bg-primary/8 ring-1 ring-primary/25"
                          : "border-border hover:border-border/80 hover:bg-muted/20"
                      )}
                    >
                      <div className={cn("text-base font-bold uppercase tracking-wide", active ? "text-primary" : p.color)}>
                        {p.label}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        {p.desc}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Summary — preset selected */}
            {form.limitsPreset !== "custom" && (
              <div className="rounded-lg bg-muted/20 border border-border/50 px-6 py-4">
                <p className="text-xs text-muted-foreground/60 uppercase tracking-widest font-semibold mb-3">
                  Giá trị áp dụng
                </p>
                <div className="grid grid-cols-3 gap-6">
                  {[
                    { label: "RAM tối đa",       value: `${form.maxRamMb} MB` },
                    { label: "Token / giờ",      value: form.maxTokensPerHour.toLocaleString() },
                    { label: "Tác vụ đồng thời", value: form.maxConcurrentTasks },
                  ].map(stat => (
                    <div key={stat.label}>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                        {stat.label}
                      </div>
                      <div className="text-2xl font-bold font-mono text-foreground">
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom inputs */}
            {form.limitsPreset === "custom" && (
              <div className="grid grid-cols-3 gap-4">
                <Field label="RAM tối đa (MB)">
                  <Input
                    type="number"
                    value={form.maxRamMb}
                    onChange={(e) => set("maxRamMb", Number(e.target.value))}
                    className="h-11 text-base font-mono"
                    min={10} max={512}
                  />
                </Field>
                <Field label="Token tối đa / giờ">
                  <Input
                    type="number"
                    value={form.maxTokensPerHour}
                    onChange={(e) => set("maxTokensPerHour", Number(e.target.value))}
                    className="h-11 text-base font-mono"
                    min={100}
                  />
                </Field>
                <Field label="Tác vụ đồng thời">
                  <Input
                    type="number"
                    value={form.maxConcurrentTasks}
                    onChange={(e) => set("maxConcurrentTasks", Number(e.target.value))}
                    className="h-11 text-base font-mono"
                    min={1} max={20}
                  />
                </Field>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-5">
          <Button variant="outline" onClick={onClose} className="text-sm uppercase tracking-wider h-10 px-5">
            Hủy
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="text-sm uppercase tracking-wider h-10 px-5 gap-2"
          >
            {mutation.isPending ? "Đang lưu…" : isEdit ? "Cập nhật" : "Tạo Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
