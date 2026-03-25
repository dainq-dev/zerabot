"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { cronApi, agentsApi, channelsApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { CronJobCreateInput } from "@zerobot/shared"

const PRESETS = [
  // Theo phút
  { label: "Mỗi 5 phút",   value: "*/5 * * * *" },
  { label: "Mỗi 15 phút",  value: "*/15 * * * *" },
  { label: "Mỗi 30 phút",  value: "*/30 * * * *" },
  // Theo giờ
  { label: "Mỗi giờ",      value: "0 * * * *" },
  { label: "Mỗi 2 giờ",    value: "0 */2 * * *" },
  { label: "Mỗi 6 giờ",    value: "0 */6 * * *" },
  { label: "Mỗi 12 giờ",   value: "0 */12 * * *" },
  // Hàng ngày
  { label: "Hàng ngày 0h", value: "0 0 * * *" },
  { label: "Hàng ngày 6h", value: "0 6 * * *" },
  { label: "Hàng ngày 8h", value: "0 8 * * *" },
  { label: "Hàng ngày 12h",value: "0 12 * * *" },
  { label: "Hàng ngày 18h",value: "0 18 * * *" },
  // Theo tuần
  { label: "T2–T6 lúc 9h", value: "0 9 * * 1-5" },
  { label: "Thứ 2 hàng tuần", value: "0 9 * * 1" },
  { label: "Cuối tuần",    value: "0 10 * * 6,0" },
  // Hàng tháng
  { label: "Ngày 1 hàng tháng", value: "0 9 1 * *" },
  { label: "Ngày 15 hàng tháng", value: "0 9 15 * *" },
  // Tùy chỉnh
  { label: "Tùy chỉnh",    value: "custom" },
]

// Scale đồng bộ với agent-form: label=text-xs, hint=text-xs, input=text-base
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

interface Props {
  open: boolean
  onClose: () => void
}

export function CronForm({ open, onClose }: Props) {
  const qc = useQueryClient()

  const [form, setForm] = useState<CronJobCreateInput & { enabled: boolean }>({
    name: "",
    schedule: "0 * * * *",
    agentId: "",
    task: "",
    notifyChannel: undefined,
    enabled: true,
  })
  const [scheduleMode, setScheduleMode] = useState("0 * * * *")

  const { data: agents = [] } = useQuery({ queryKey: ["agents"], queryFn: agentsApi.list })
  const { data: channels = [] } = useQuery({ queryKey: ["channels"], queryFn: channelsApi.list })

  const mutation = useMutation({
    mutationFn: (data: CronJobCreateInput) => cronApi.create(data),
    onSuccess: () => {
      toast.success("Đã tạo cron job thành công")
      qc.invalidateQueries({ queryKey: ["cron"] })
      onClose()
      resetForm()
    },
    onError: (err) => toast.error(`Lỗi: ${err.message}`),
  })

  function resetForm() {
    setForm({ name: "", schedule: "0 * * * *", agentId: "", task: "", enabled: true })
    setScheduleMode("0 * * * *")
  }

  function handlePreset(val: string) {
    setScheduleMode(val)
    if (val !== "custom") setForm(f => ({ ...f, schedule: val }))
  }

  const canSubmit = !!form.name && !!form.schedule && !!form.agentId && !!form.task && !mutation.isPending

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          resetForm();
        }
      }}
    >
      <DialogContent className="min-w-[80dvw] w-full">
        <DialogHeader>
          <DialogTitle className="text-2xl uppercase tracking-widest font-bold text-foreground">
            Tạo Cron Job
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Lên lịch tác vụ tự động cho agent
          </p>
        </DialogHeader>
        <section className="grid grid-cols-[1fr_30dvw] gap-6">
          <div className="space-y-8 pt-1 border-r pr-4">
            {/* Lịch chạy */}
            <Field
              label="Lịch chạy"
              hint="Định dạng: phút  giờ  ngày  tháng  thứ"
            >
              {/* Presets */}
              <div className="flex flex-wrap gap-3 mb-4">
                {PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => handlePreset(p.value)}
                    className={cn(
                      "text-sm px-3 py-1.5 rounded border font-mono transition-all",
                      scheduleMode === p.value
                        ? "border-primary/50 bg-primary/10 text-red-600 font-bold uppercase"
                        : "border-border/70 text-white hover:border-primary/30 hover:text-foreground hover:bg-muted/40",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {/* Manual input */}
              <div className="relative">
                <Input
                  className="h-11 font-mono text-base pr-40"
                  placeholder="* * * * *"
                  value={form.schedule}
                  onChange={(e) => {
                    setScheduleMode("custom");
                    setForm((f) => ({ ...f, schedule: e.target.value }));
                  }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-primary/40 pointer-events-none">
                  phút giờ ngày tháng thứ
                </span>
              </div>
            </Field>

            {/* Agent */}
            <Field label="Agent">
              <Select
                value={form.agentId}
                onValueChange={(v) => setForm((f) => ({ ...f, agentId: v }))}
              >
                <SelectTrigger className="min-h-11 text-base w-full ">
                  <SelectValue placeholder="Chọn agent…" />
                </SelectTrigger>
                <SelectContent>
                  {agents.length === 0 ? (
                    <SelectItem value="__empty__" disabled>
                      Chưa có agent nào
                    </SelectItem>
                  ) : (
                    agents.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-sm">
                        {a.emoji} {a.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </Field>

            {/* Mô tả tác vụ */}
            <Field
              label="Mô tả tác vụ"
              hint="Prompt này sẽ được gửi đến agent khi job chạy"
            >
              <Textarea
                placeholder="Tạo báo cáo doanh thu hàng ngày và gửi tóm tắt cho nhóm…"
                rows={5}
                className="text-base resize-y min-h-30"
                value={form.task}
                onChange={(e) =>
                  setForm((f) => ({ ...f, task: e.target.value }))
                }
              />
            </Field>
          </div>
          {/* Kênh thông báo + Bật ngay */}
          <div className="flex flex-col w-full gap-4">
            {/* Tên job */}
            <Field label="Tên job">
              <Input
                placeholder="daily-report"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="h-11 text-base"
              />
            </Field>
            <Field label="Kênh thông báo">
              <Select
                value={form.notifyChannel ?? "__none__"}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    notifyChannel: v === "__none__" ? undefined : v,
                  }))
                }
              >
                <SelectTrigger className="text-base w-full min-h-11 uppercase">
                  <SelectValue placeholder="Không" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-sm">
                    Không thông báo
                  </SelectItem>
                  {channels
                    .filter((c) => c.enabled)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-sm">
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-widest font-semibold text-foreground/55">
                Bật ngay sau khi tạo
              </Label>
              <div className="flex items-center gap-3 h-11">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, enabled: v }))
                  }
                />
                <span className="text-sm text-muted-foreground">
                  {form.enabled ? "Đang bật" : "Tắt"}
                </span>
              </div>
            </div>
          </div>
        </section>

        <DialogFooter className="mt-5">
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              resetForm();
            }}
            className="text-sm uppercase tracking-wider h-10 px-5"
          >
            Hủy
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => mutation.mutate(form)}
            className="text-sm uppercase tracking-wider h-10 px-5"
          >
            {mutation.isPending ? "Đang tạo…" : "Tạo Job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
