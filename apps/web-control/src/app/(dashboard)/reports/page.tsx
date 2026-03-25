"use client"

import { useQuery } from "@tanstack/react-query"
import { agentsApi, eventsApi } from "@/lib/api"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import ReactECharts from "echarts-for-react"
import { Download, TrendingUp, Zap, BarChart3 } from "lucide-react"
import { estimateCost } from "@zerobot/shared"

export default function ReportsPage() {
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: agentsApi.list,
  })

  const { data: tokenData = [], isLoading } = useQuery({
    queryKey: ["metrics-tokens-7d"],
    queryFn: () => eventsApi.tokenMetrics({
      since: Date.now() - 7 * 24 * 60 * 60 * 1000
    }),
  })

  const typedData = tokenData as { hour: number; agentId: string; model: string; inputTokens: number; outputTokens: number }[]

  // Aggregate by agent
  const agentTotals = typedData.reduce<Record<string, { input: number; output: number; model: string }>>((acc, d) => {
    if (!acc[d.agentId]) acc[d.agentId] = { input: 0, output: 0, model: d.model }
    acc[d.agentId].input += d.inputTokens
    acc[d.agentId].output += d.outputTokens
    return acc
  }, {})

  const totalInput = typedData.reduce((s, d) => s + d.inputTokens, 0)
  const totalOutput = typedData.reduce((s, d) => s + d.outputTokens, 0)
  const totalCost = Object.entries(agentTotals).reduce((s, [, v]) => s + estimateCost(v.model, v.input, v.output), 0)

  // Line chart: tokens per day over 7 days
  const dayBuckets: Record<string, number> = {}
  for (const d of typedData) {
    const day = new Date(d.hour).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    dayBuckets[day] = (dayBuckets[day] ?? 0) + d.inputTokens + d.outputTokens
  }
  const chartDays = Object.keys(dayBuckets)
  const chartValues = Object.values(dayBuckets)

  const lineChartOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "oklch(0.12 0.01 220)",
      borderColor: "oklch(0.22 0.02 200 / 60%)",
      textStyle: { color: "oklch(0.9 0.03 140)", fontFamily: "var(--font-geist-mono)", fontSize: 11 },
    },
    grid: { top: 8, right: 8, bottom: 32, left: 50 },
    xAxis: {
      type: "category",
      data: chartDays,
      axisLabel: { color: "oklch(0.55 0.03 200)", fontSize: 10 },
      axisLine: { lineStyle: { color: "oklch(0.22 0.02 200 / 40%)" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "oklch(0.55 0.03 200)", fontSize: 10 },
      splitLine: { lineStyle: { color: "oklch(0.22 0.02 200 / 20%)", type: "dashed" } },
    },
    series: [{
      type: "line",
      data: chartValues,
      smooth: true,
      lineStyle: { color: "oklch(0.75 0.18 175)", width: 2 },
      areaStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: "oklch(0.75 0.18 175 / 40%)" },
            { offset: 1, color: "oklch(0.75 0.18 175 / 5%)" },
          ],
        },
      },
      symbol: "none",
    }],
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-wide">Reports</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Last 7 days performance</p>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Download className="w-3 h-3" /> Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "INPUT TOKENS", value: totalInput.toLocaleString(), icon: Zap, color: "text-cyan-400" },
          { label: "OUTPUT TOKENS", value: totalOutput.toLocaleString(), icon: TrendingUp, color: "text-green-400" },
          { label: "TOTAL TOKENS", value: (totalInput + totalOutput).toLocaleString(), icon: BarChart3, color: "text-primary" },
          { label: "EST. COST (7D)", value: `$${totalCost.toFixed(4)}`, icon: BarChart3, color: "text-amber-400" },
        ].map(s => (
          <Card key={s.label} className="p-3 bg-card border-border">
            <div className="text-[9px] tracking-widest text-muted-foreground mb-1">{s.label}</div>
            <div className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Line chart */}
      <Card className="p-4 bg-card border-border">
        <div className="text-xs font-bold tracking-wide mb-3">TOKENS / DAY (7 DAYS)</div>
        {isLoading
          ? <Skeleton className="h-40" />
          : <ReactECharts option={lineChartOption} style={{ height: 160 }} opts={{ renderer: "canvas" }} />
        }
      </Card>

      {/* Per-agent table */}
      <Card className="overflow-hidden bg-card border-border">
        <div className="text-xs font-bold tracking-wide p-4 border-b border-border">AGENT BREAKDOWN</div>
        <div className="divide-y divide-border/50">
          {Object.entries(agentTotals).map(([agentId, data]) => {
            const agent = agents.find(a => a.id === agentId)
            const cost = estimateCost(data.model, data.input, data.output)
            return (
              <div key={agentId} className="flex items-center gap-4 px-4 py-2.5 text-xs hover:bg-muted/10">
                <span className="text-base">{agent?.emoji ?? "🤖"}</span>
                <div className="flex-1">
                  <div className="font-bold">{agent?.name ?? agentId}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{data.model}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-cyan-400">{data.input.toLocaleString()} in</div>
                  <div className="font-mono text-green-400">{data.output.toLocaleString()} out</div>
                </div>
                <div className="text-right w-20">
                  <div className="font-bold text-amber-400">${cost.toFixed(4)}</div>
                  <div className="text-[10px] text-muted-foreground">est. cost</div>
                </div>
              </div>
            )
          })}
          {Object.keys(agentTotals).length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">No data yet</div>
          )}
        </div>
      </Card>
    </div>
  )
}
