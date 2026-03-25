"use client"

import { useQuery } from "@tanstack/react-query"
import { agentsApi, eventsApi } from "@/lib/api"
import { useEventStream } from "@/hooks/use-event-stream"
import { EventFeed } from "@/components/monitor/event-feed"
import { AgentStatusBadge } from "@/components/agent/agent-status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Cpu, Zap, Activity } from "lucide-react"
import ReactECharts from "echarts-for-react"
import type { EChartsOption } from "echarts"

export default function MonitorPage() {
  const { events, connected, clear } = useEventStream(500)

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: agentsApi.list,
    refetchInterval: 10_000,
  })

  const { data: tokenData = [] } = useQuery({
    queryKey: ["metrics-tokens"],
    queryFn: () => eventsApi.tokenMetrics({ since: Date.now() - 24 * 60 * 60 * 1000 }),
    refetchInterval: 60_000,
  })

  // Build ECharts data for token usage (last 12 hours)
  const chartOption: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      backgroundColor: "oklch(0.12 0.01 220)",
      borderColor: "oklch(0.22 0.02 200 / 60%)",
      textStyle: { color: "oklch(0.9 0.03 140)", fontFamily: "var(--font-geist-mono)", fontSize: 11 },
    },
    grid: { top: 8, right: 8, bottom: 24, left: 40 },
    xAxis: {
      type: "time",
      axisLabel: { color: "oklch(0.55 0.03 200)", fontSize: 10 },
      axisLine: { lineStyle: { color: "oklch(0.22 0.02 200 / 40%)" } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "oklch(0.55 0.03 200)", fontSize: 10 },
      splitLine: { lineStyle: { color: "oklch(0.22 0.02 200 / 20%)", type: "dashed" } },
    },
    series: [{
      type: "bar",
      data: (tokenData as { hour: number; inputTokens: number; outputTokens: number }[]).map(d => [d.hour, d.inputTokens + d.outputTokens]),
      itemStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: "oklch(0.75 0.18 175 / 80%)" },
            { offset: 1, color: "oklch(0.75 0.18 175 / 20%)" },
          ],
        },
      },
      barMaxWidth: 20,
    }],
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-3.5rem-2.5rem)]">
      {/* Agent status bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center gap-2.5 bg-card border border-border rounded-md px-3 py-2"
          >
            <span className="text-lg">{agent.emoji ?? "🤖"}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{agent.name}</div>
              {agent.currentTask && (
                <div className="text-[10px] text-muted-foreground truncate">
                  {agent.currentTask}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <AgentStatusBadge status={agent.status ?? "stopped"} />
              {agent.ramUsageMb && (
                <span className="text-[9px] text-muted-foreground">
                  <Cpu className="w-2 h-2 inline mr-0.5" />
                  {agent.ramUsageMb}MB
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Main content: event feed + charts */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Event feed */}
        <div className="flex-1 min-w-0">
          <EventFeed events={events} connected={connected} onClear={clear} />
        </div>

        {/* Right panel: charts */}
        <div className="w-150 flex flex-col gap-6 shrink-0">
          {/* Token usage chart */}
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-3 mb-2">
              <Zap className="w-5 h-5 text-primary" />
              <span className="text-lg font-bold tracking-wide">
                TOKEN USAGE (24H)
              </span>
            </div>
            <ReactECharts
              option={chartOption}
              style={{ height: 300 }}
              opts={{ renderer: "canvas" }}
            />
          </div>

          {/* Live stats */}
          <div className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-3">
              <Activity className="w-3.5 h-3.5 text-primary" />
              <span className="text-lg uppercase font-bold tracking-wide">
                LIVE STATS
              </span>
            </div>
            <div className="space-y-4">
              {[
                { label: "Total Events (session)", value: events.length },
                {
                  label: "Errors",
                  value: events.filter((e) => e.severity === "error").length,
                  danger: true,
                },
                {
                  label: "Tool Calls",
                  value: events.filter((e) => e.type === "tool.call").length,
                },
                {
                  label: "MCP Calls",
                  value: events.filter((e) => e.type === "mcp.call").length,
                },
                {
                  label: "Tokens Used",
                  value: events.reduce((s, e) => s + e.tokenUsed, 0),
                },
              ].map((s) => (
                <div key={s.label} className="flex justify-between">
                  <span className="text-muted-foreground text-lg uppercase">
                    {s.label}
                  </span>
                  <span
                    className={`font-mono text-xl font-bold ${s.danger && s.value > 0 ? "text-red-400" : "text-foreground"}`}
                  >
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
