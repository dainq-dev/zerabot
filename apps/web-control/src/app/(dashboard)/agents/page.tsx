"use client"

import { useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { Plus, RefreshCw, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { AgentCard } from "@/components/agent/agent-card"
import { AgentForm } from "@/components/agent/agent-form"
import { agentsApi } from "@/lib/api"
import type { Agent } from "@zerobot/shared"

export default function AgentsPage() {
  const [editAgent, setEditAgent] = useState<Agent | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const [isRefreshing, setIsRefreshing] = useState(false)

  const { data: agents = [], isLoading, refetch } = useQuery({
    queryKey: ["agents"],
    queryFn: agentsApi.list,
    refetchInterval: 10_000,
  })

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try { await refetch() } finally { setIsRefreshing(false) }
  }, [refetch])

  const running = agents.filter(a => a.status === "running").length
  const total = agents.length

  return (
    <div className="space-y-5 ">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl uppercase font-bold tracking-wide">
            Agent Manager
          </h1>
          <p className="text-md text-muted-foreground mt-0.5">
            {running}/{total} agents running
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="lg"
            className="h-8 gap-3 text-md uppercase"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            size="lg"
            className="h-8 gap-3 text-md uppercase"
            onClick={() => setShowCreate(true)}
            data-testid="btn-new-agent"
          >
            <Plus className="w-3 h-3" />
            New Agent
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "TOTAL", value: total, color: "text-foreground", testId: "stat-total" },
          { label: "RUNNING", value: running, color: "text-green-400", testId: "stat-running" },
          {
            label: "PAUSED",
            value: agents.filter((a) => a.status === "paused").length,
            color: "text-amber-400",
            testId: "stat-paused",
          },
          {
            label: "ERROR",
            value: agents.filter((a) => a.status === "error").length,
            color: "text-red-400",
            testId: "stat-error",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            data-testid={stat.testId}
            className="bg-card border border-border rounded-md px-3 py-2.5 flex flex-col items-center"
          >
            <div className="text-[16px] tracking-widest text-muted-foreground">
              {stat.label}
            </div>
            <div className={`text-4xl font-bold font-mono mt-3 ${stat.color}`}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-70 rounded-lg" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div data-testid="agents-empty-state" className="flex flex-col items-center justify-center h-64 text-center">
          <Bot className="w-20 h-20 text-muted-foreground/30 mb-3" />
          <p className="text-lg uppercase text-muted-foreground">
            No agents configured
          </p>
          <p className="text-md text-muted-foreground/60 mt-1">
            Create your first agent to get started
          </p>
          <Button
            size="lg"
            className="mt-4 gap-1.5 text-sm uppercase"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3 h-3" /> Create Agent
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onEdit={setEditAgent} />
          ))}
        </div>
      )}

      {/* Modals */}
      <AgentForm open={showCreate} onClose={() => setShowCreate(false)} />
      <AgentForm
        key={editAgent?.id}
        agent={editAgent}
        open={!!editAgent}
        onClose={() => setEditAgent(null)}
      />
    </div>
  );
}
