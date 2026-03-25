"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, RefreshCw, GitFork, Bot, Sparkles, Layers, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { pipelinesApi } from "@/lib/api"
import { PipelineCard } from "@/components/flow/pipeline-card"
import { PipelineForm } from "@/components/flow/pipeline-form"
import type { Pipeline } from "@zerobot/shared"

const PIPELINE_TEMPLATES = [
  {
    id: "tpl-daily-report",
    name: "Báo cáo hàng ngày",
    description: "Agent phân tích dữ liệu lúc 7 giờ sáng và gửi báo cáo qua Telegram",
    icon: "📊",
    colorClass: "border-cyan-500/20 hover:border-cyan-500/40",
    accentClass: "text-cyan-400",
    triggerHint: "Cron 7:00 sáng",
    nodeCount: 3,
    build: () => ({
      name: "Báo cáo hàng ngày",
      description: "Chạy mỗi sáng 7:00, phân tích và gửi báo cáo",
      trigger: { type: "cron", schedule: "0 7 * * *" },
      nodes: [
        { id: "n1", type: "trigger",  position: { x: 60,  y: 180 }, data: { triggerType: "cron", schedule: "0 7 * * *" } },
        { id: "n2", type: "agent",    position: { x: 340, y: 180 }, data: { agentId: "", agentName: "Chưa chọn", taskPrompt: "Phân tích dữ liệu bán hàng hôm qua, tóm tắt top 10 sản phẩm và tổng doanh thu." } },
        { id: "n3", type: "channel",  position: { x: 620, y: 180 }, data: { channelId: "telegram", messageTemplate: "📊 Báo cáo ngày {{date}}:\n\n{{output}}\n\n— ZeraBot" } },
      ],
      edges: [
        { id: "e1-2", source: "n1", target: "n2", type: "smoothstep", animated: true },
        { id: "e2-3", source: "n2", target: "n3", type: "smoothstep", animated: true },
      ],
    }),
  },
  {
    id: "tpl-msg-monitor",
    name: "Giám sát tin nhắn",
    description: "Nhận tin nhắn từ Telegram, agent phân tích và tự động phản hồi",
    icon: "💬",
    colorClass: "border-purple-500/20 hover:border-purple-500/40",
    accentClass: "text-purple-400",
    triggerHint: "Khi nhận tin nhắn",
    nodeCount: 3,
    build: () => ({
      name: "Giám sát tin nhắn",
      description: "Phân tích tin nhắn đến và phản hồi tự động",
      trigger: { type: "channel" },
      nodes: [
        { id: "n1", type: "trigger",  position: { x: 60,  y: 180 }, data: { triggerType: "channel", channelId: "telegram" } },
        { id: "n2", type: "agent",    position: { x: 340, y: 180 }, data: { agentId: "", agentName: "Chưa chọn", taskPrompt: "Phân tích tin nhắn và đưa ra phản hồi phù hợp.", receiveInput: true } },
        { id: "n3", type: "channel",  position: { x: 620, y: 180 }, data: { channelId: "telegram", messageTemplate: "{{output}}" } },
      ],
      edges: [
        { id: "e1-2", source: "n1", target: "n2", type: "smoothstep", animated: true },
        { id: "e2-3", source: "n2", target: "n3", type: "smoothstep", animated: true },
      ],
    }),
  },
  {
    id: "tpl-gold-alert",
    name: "Cảnh báo giá vàng",
    description: "Kiểm tra giá vàng mỗi giờ, nếu biến động mạnh thì cảnh báo ngay",
    icon: "🥇",
    colorClass: "border-amber-500/20 hover:border-amber-500/40",
    accentClass: "text-amber-400",
    triggerHint: "Cron mỗi giờ",
    nodeCount: 4,
    build: () => ({
      name: "Cảnh báo giá vàng",
      description: "Theo dõi và cảnh báo biến động giá vàng",
      trigger: { type: "cron", schedule: "0 * * * *" },
      nodes: [
        { id: "n1", type: "trigger",   position: { x: 60,  y: 200 }, data: { triggerType: "cron", schedule: "0 * * * *" } },
        { id: "n2", type: "agent",     position: { x: 320, y: 200 }, data: { agentId: "", agentName: "Chưa chọn", taskPrompt: "Kiểm tra giá vàng SJC hiện tại. Nếu biến động > 0.5% so với giờ trước, trả về chuỗi bắt đầu bằng ALERT: kèm thông tin. Ngược lại trả về OK." } },
        { id: "n3", type: "condition", position: { x: 590, y: 200 }, data: { conditionType: "contains", conditionValue: "ALERT:", trueLabel: "Biến động", falseLabel: "Ổn định" } },
        { id: "n4", type: "channel",   position: { x: 830, y: 80  }, data: { channelId: "telegram", messageTemplate: "🚨 Cảnh báo giá vàng!\n\n{{output}}" } },
      ],
      edges: [
        { id: "e1-2", source: "n1", target: "n2", type: "smoothstep", animated: true },
        { id: "e2-3", source: "n2", target: "n3", type: "smoothstep", animated: true },
        { id: "e3t-4", source: "n3", sourceHandle: "true", target: "n4", type: "smoothstep", animated: true },
      ],
    }),
  },
  {
    id: "tpl-webhook-summary",
    name: "Tổng hợp webhook",
    description: "Nhận dữ liệu từ hệ thống ngoài qua webhook, agent xử lý và ghi vào DB",
    icon: "🔗",
    colorClass: "border-blue-500/20 hover:border-blue-500/40",
    accentClass: "text-blue-400",
    triggerHint: "Webhook",
    nodeCount: 3,
    build: () => ({
      name: "Tổng hợp webhook",
      description: "Nhận webhook, agent xử lý và thông báo kết quả",
      trigger: { type: "webhook" },
      nodes: [
        { id: "n1", type: "trigger", position: { x: 60,  y: 180 }, data: { triggerType: "webhook" } },
        { id: "n2", type: "agent",   position: { x: 340, y: 180 }, data: { agentId: "", agentName: "Chưa chọn", taskPrompt: "Tổng hợp và xử lý dữ liệu nhận được: {{input}}", receiveInput: true } },
        { id: "n3", type: "channel", position: { x: 620, y: 180 }, data: { channelId: "telegram", messageTemplate: "✅ Đã xử lý:\n\n{{output}}" } },
      ],
      edges: [
        { id: "e1-2", source: "n1", target: "n2", type: "smoothstep", animated: true },
        { id: "e2-3", source: "n2", target: "n3", type: "smoothstep", animated: true },
      ],
    }),
  },
]

export default function FlowPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)

  const { data: pipelines = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pipelines"],
    queryFn: pipelinesApi.list,
    refetchInterval: 15_000,
  })

  const createMutation = useMutation({
    mutationFn: (data: unknown) => pipelinesApi.create(data),
    onSuccess: (pipeline: Pipeline) => {
      toast.success("Pipeline đã tạo từ template")
      qc.invalidateQueries({ queryKey: ["pipelines"] })
      router.push(`/flow/${pipeline.id}`)
    },
    onError: (err) => toast.error(String(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => pipelinesApi.delete(id),
    onSuccess: () => {
      toast.success("Pipeline đã xóa")
      qc.invalidateQueries({ queryKey: ["pipelines"] })
    },
    onError: (err) => toast.error(String(err)),
  })

  const runMutation = useMutation({
    mutationFn: (id: string) => pipelinesApi.run(id),
    onSuccess: () => toast.success("Pipeline đang chạy"),
    onError: (err) => toast.error(String(err)),
  })

  const counts = {
    total:   pipelines.length,
    active:  pipelines.filter(p => p.status === "active").length,
    running: pipelines.filter(p => p.status === "running").length,
    draft:   pipelines.filter(p => p.status === "draft").length,
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl uppercase font-bold tracking-wide flex items-center gap-2">
            <GitFork className="w-5 h-5 text-primary" />
            Flow Builder
          </h1>
          <p className="text-md text-muted-foreground mt-0.5">
            Tự động hóa công việc bằng cách kết nối các agents thành pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="lg"
            className="h-10 gap-2 text-md uppercase"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`w-10 h-10 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="lg"
            className="h-10 gap-2 text-md uppercase"
            onClick={() => setShowForm(true)}
          >
            <Plus className="w-10 h-10" />
            New Pipeline
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "TOTAL",   value: counts.total,   color: "text-foreground" },
          { label: "ACTIVE",  value: counts.active,  color: "text-green-400" },
          { label: "RUNNING", value: counts.running, color: "text-cyan-400" },
          { label: "DRAFT",   value: counts.draft,   color: "text-muted-foreground" },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-md px-3 py-2.5 flex flex-col items-center">
            <div className="text-[18px] tracking-widest text-muted-foreground">{stat.label}</div>
            <div className={`text-4xl font-bold font-mono mt-3 ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Templates */}
      <div className="space-y-2">
        <button
          className="flex items-center gap-2 text-[18px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowTemplates(v => !v)}
        >
          <Sparkles className="w-6 h-6 text-amber-400" />
          Pipeline Templates
          <ChevronDown className={`w-6 h-6 transition-transform ${showTemplates ? "rotate-180" : ""}`} />
        </button>
        {showTemplates && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PIPELINE_TEMPLATES.map(tpl => (
              <button
                key={tpl.id}
                className={`text-left bg-card border rounded-lg p-3 space-y-1.5 transition-colors ${tpl.colorClass}`}
                onClick={() => createMutation.mutate(tpl.build())}
                disabled={createMutation.isPending}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{tpl.icon}</span>
                  <span className={`text-lg uppercase font-semibold ${tpl.accentClass}`}>{tpl.name}</span>
                </div>
                <p className="text-,d text-muted-foreground leading-relaxed">{tpl.description}</p>
                <div className="flex items-center gap-2 text-[16px] text-muted-foreground/60">
                  <Layers className="w-4 h-4" />
                  <span className='text-[16px]'>{tpl.nodeCount} nodes</span>
                  <span>·</span>
                  <span className='text-[16px]'>{tpl.triggerHint}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      ) : pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <GitFork className="w-20 h-20 text-muted-foreground/30 mb-3" />
          <p className="text-lg uppercase text-muted-foreground">Chưa có pipeline nào</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Tạo pipeline đầu tiên để tự động hóa công việc
          </p>
          <Button
            size="lg"
            className="mt-4 gap-1.5 text-sm uppercase"
            onClick={() => setShowForm(true)}
          >
            <Plus className="w-3 h-3" /> Tạo Pipeline
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipelines.map(p => (
            <PipelineCard
              key={p.id}
              pipeline={p}
              onEdit={() => router.push(`/flow/${p.id}`)}
              onRun={() => runMutation.mutate(p.id)}
              onDelete={() => deleteMutation.mutate(p.id)}
            />
          ))}
        </div>
      )}

      <PipelineForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreated={(p: Pipeline) => {
          setShowForm(false)
          router.push(`/flow/${p.id}`)
        }}
      />
    </div>
  )
}
