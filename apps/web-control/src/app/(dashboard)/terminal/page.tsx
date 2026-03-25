"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { agentsApi } from "@/lib/api"
import type { Agent } from "@zerobot/shared"
import { AgentTerminal } from "@/components/terminal/agent-terminal"
import { AgentStatusBadge } from "@/components/agent/agent-status-badge"
import { cn } from "@/lib/utils"
import { Terminal, Circle } from "lucide-react"
import { AgentIcon } from '@/components/shared/agent-icon'

export default function TerminalPage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: agentsApi.list,
    refetchInterval: 15_000,
  })

  return (
    <div className="flex h-[calc(100vh-3.5rem-2.5rem)] -m-5">
      {/* Agent selector sidebar */}
      <div className="w-80 shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-border shrink-0">
          <Terminal className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-bold tracking-wide">AGENTS</span>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-l-2",
                selectedAgent?.id === agent.id
                  ? "bg-accent border-primary"
                  : "hover:bg-muted/40 border-transparent",
              )}
            >
              <AgentIcon id={agent.emoji} className="w-8 h-8" />
              <div className="flex-1 min-w-0">
                <div className="text-[16px] uppercase font-bold truncate">
                  {agent.name}
                </div>
                <AgentStatusBadge status={agent.status ?? "stopped"} />
              </div>
            </button>
          ))}

          {agents.length === 0 && (
            <div className="text-[11px] text-muted-foreground/50 text-center py-8 px-3">
              No agents configured
            </div>
          )}
        </div>
      </div>

      {/* Terminal area */}
      <div className="flex-1 bg-[#0d1117] flex flex-col overflow-hidden">
        {selectedAgent ? (
          <>
            {/* Terminal header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-[#0d1117] shrink-0">
              <Circle
                className={cn(
                  "w-2 h-2 fill-current",
                  selectedAgent.status === "running"
                    ? "text-green-400 pulse-dot"
                    : "text-muted-foreground",
                )}
              />
              <span className="font-mono text-[12px] text-green-400/80 flex items-center gap-2">
                <AgentIcon id={selectedAgent.emoji} className="w-5 h-5" />
                <strong className='text-[18px]'> 
                {selectedAgent.name}
                </strong>
              </span>
              <span className="text-[13px] text-blue-400 font-mono ml-2">
                [{selectedAgent.id}]
              </span>
            </div>

            {/* xterm.js terminal */}
            <div className="flex-1 overflow-hidden p-1">
              <AgentTerminal agent={selectedAgent} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Terminal className="w-12 h-12 text-green-400/20 mx-auto mb-3" />
              <p className="font-mono text-sm text-green-400/40">
                Select an agent to connect
              </p>
              <p className="font-mono text-[11px] text-muted-foreground/30 mt-1">
                Real-time session relay via ZeroClaw
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
