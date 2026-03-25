"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { pipelinesApi } from "@/lib/api"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { Clock, Webhook, MessageSquare, Hand, Check, ArrowRight } from "lucide-react"
import type { Pipeline, PipelineTriggerType } from "@zerobot/shared"

// ── Trigger options ───────────────────────────────────────────────────────────

const TRIGGER_OPTIONS: {
  value: PipelineTriggerType
  label: string
  description: string
  icon: React.ElementType
  activeClass: string
}[] = [
  {
    value: "cron",
    label: "Theo lịch định sẵn",
    description: "Chạy tự động vào thời điểm định sẵn — mỗi ngày, mỗi giờ, mỗi tuần...",
    icon: Clock,
    activeClass: "border-cyan-500/40 bg-cyan-500/5 text-cyan-400",
  },
  {
    value: "channel",
    label: "Khi nhận tin nhắn",
    description: "Ai đó nhắn vào Telegram / Discord / Slack → pipeline tự kích hoạt",
    icon: MessageSquare,
    activeClass: "border-purple-500/40 bg-purple-500/5 text-purple-400",
  },
  {
    value: "webhook",
    label: "Khi có webhook gọi vào",
    description: "Hệ thống ngoài (API / Zapier / n8n) gọi URL để kích hoạt pipeline",
    icon: Webhook,
    activeClass: "border-blue-500/40 bg-blue-500/5 text-blue-400",
  },
  {
    value: "manual",
    label: "Chạy thủ công",
    description: "Bấm nút Run trong ZeraBot hoặc từ Terminal bất cứ lúc nào",
    icon: Hand,
    activeClass: "border-border bg-muted/30 text-muted-foreground",
  },
]

// ── Cron presets ──────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: "Mỗi ngày lúc 7:00 sáng",    value: "0 7 * * *" },
  { label: "Mỗi ngày lúc 8:00 sáng",    value: "0 8 * * *" },
  { label: "Mỗi ngày lúc 12:00 trưa",   value: "0 12 * * *" },
  { label: "Mỗi giờ",                    value: "0 * * * *" },
  { label: "Mỗi 30 phút",               value: "*/30 * * * *" },
  { label: "Mỗi thứ Hai 9:00 sáng",     value: "0 9 * * 1" },
  { label: "Ngày 1 mỗi tháng lúc 9:00", value: "0 9 1 * *" },
  { label: "Tùy chỉnh...",              value: "custom" },
]

const CHANNEL_OPTIONS = [
  { value: "telegram",   label: "Telegram" },
  { value: "discord",    label: "Discord" },
  { value: "slack",      label: "Slack" },
  { value: "mattermost", label: "Mattermost" },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface PipelineFormProps {
  open: boolean
  onClose: () => void
  onCreated: (pipeline: Pipeline) => void
}

export function PipelineForm({ open, onClose, onCreated }: PipelineFormProps) {
  const [name, setName]               = useState("")
  const [description, setDescription] = useState("")
  const [triggerType, setTriggerType] = useState<PipelineTriggerType>("manual")
  const [cronPreset, setCronPreset]   = useState("0 7 * * *")
  const [cronCustom, setCronCustom]   = useState("")
  const [channelId, setChannelId]     = useState("telegram")

  const mutation = useMutation({
    mutationFn: () => {
      const schedule = triggerType === "cron"
        ? (cronPreset === "custom" ? cronCustom.trim() : cronPreset)
        : undefined

      return pipelinesApi.create({
        name: name.trim() || "new-pipeline",
        description: description.trim() || undefined,
        trigger: {
          type: triggerType,
          schedule,
          channelId: triggerType === "channel" ? channelId : undefined,
        },
        nodes: [],
        edges: [],
        status: "draft",
        enabled: false,
      })
    },
    onSuccess: (pipeline) => {
      toast.success("Pipeline đã tạo — đang mở editor...")
      onCreated(pipeline)
      reset()
    },
    onError: (err) => toast.error(String(err)),
  })

  function reset() {
    setName("")
    setDescription("")
    setTriggerType("manual")
    setCronPreset("0 7 * * *")
    setCronCustom("")
    setChannelId("telegram")
  }

  const handleClose = () => { onClose(); reset() }

  const effectiveCron = cronPreset === "custom" ? cronCustom : cronPreset
  const activeTrigger = TRIGGER_OPTIONS.find(o => o.value === triggerType)!

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base uppercase tracking-wide">
            Tạo Pipeline Mới
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Mô tả mục đích và chọn kịch bản khởi động. Cấu hình chi tiết sẽ thực hiện trong editor.
          </p>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* ── Name + Description ── */}
          <div className="space-y-3">
            <div>
              <Label className="text-sm font-medium">Tên pipeline *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1.5 font-mono text-sm"
                placeholder="bao-cao-doanh-thu-hang-ngay"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Mô tả mục đích</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="mt-1.5 text-sm resize-none"
                placeholder="Pipeline này làm gì? Ví dụ: Mỗi sáng 7h, thu thập dữ liệu bán hàng, phân tích và gửi báo cáo qua Telegram..."
                rows={2}
              />
            </div>
          </div>

          {/* ── Trigger selection ── */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Pipeline này chạy khi nào? *
            </Label>
            <div className="space-y-1.5">
              {TRIGGER_OPTIONS.map(opt => {
                const Icon = opt.icon
                const active = triggerType === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTriggerType(opt.value)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all duration-150",
                      active
                        ? opt.activeClass
                        : "border-border/50 text-foreground hover:border-border hover:bg-muted/30"
                    )}
                  >
                    <Icon className={cn(
                      "w-4 h-4 shrink-0",
                      active ? "" : "text-muted-foreground"
                    )} />
                    <div className="flex-1">
                      <div className="text-sm font-medium leading-none mb-0.5">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.description}</div>
                    </div>
                    {active && <Check className="w-4 h-4 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Cron config ── */}
          {triggerType === "cron" && (
            <div className="space-y-2.5 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
              <Label className="text-sm font-medium text-cyan-300">Lịch chạy</Label>
              <Select value={cronPreset} onValueChange={setCronPreset}>
                <SelectTrigger className="w-full bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRON_PRESETS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cronPreset === "custom" && (
                <Input
                  value={cronCustom}
                  onChange={e => setCronCustom(e.target.value)}
                  placeholder="0 7 * * *"
                  className="font-mono text-sm bg-background/50"
                />
              )}
              {effectiveCron && effectiveCron !== "custom" && (
                <p className="text-xs text-cyan-400/80 font-mono">
                  cron: <span className="text-cyan-300">{effectiveCron}</span>
                </p>
              )}
            </div>
          )}

          {/* ── Channel config ── */}
          {triggerType === "channel" && (
            <div className="space-y-2.5 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <Label className="text-sm font-medium text-purple-300">Nhận từ kênh nào?</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger className="w-full bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Bộ lọc từ khóa và cấu hình chi tiết sẽ thực hiện trong node Trigger của editor.
              </p>
            </div>
          )}

          {/* ── Webhook info ── */}
          {triggerType === "webhook" && (
            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="text-xs text-blue-300/80">
                Sau khi tạo, ZeraBot sẽ cấp một URL webhook riêng cho pipeline này.
                URL sẽ hiển thị trong node Trigger bên trong editor.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={handleClose}>
            Hủy
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !name.trim()}
            className="gap-2 uppercase tracking-wide"
          >
            {mutation.isPending ? "Đang tạo..." : (
              <>Tạo & Mở Editor <ArrowRight className="w-3.5 h-3.5" /></>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
