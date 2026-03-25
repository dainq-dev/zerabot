import { cn } from "@/lib/utils"
import type { AgentStatus } from "@zerobot/shared"
import { Circle, Loader2, Pause, Square, AlertTriangle } from "lucide-react"

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  running: {
    label: "RUNNING",
    color: "text-green-400",
    icon: ({ className }) => <Circle className={cn("fill-current", className)} />,
  },
  paused: {
    label: "PAUSED",
    color: "text-amber-400",
    icon: Pause,
  },
  stopped: {
    label: "STOPPED",
    color: "text-muted-foreground",
    icon: Square,
  },
  error: {
    label: "ERROR",
    color: "text-red-400",
    icon: AlertTriangle,
  },
  starting: {
    label: "STARTING",
    color: "text-cyan-400",
    icon: ({ className }) => <Loader2 className={cn("animate-spin", className)} />,
  },
}

export function AgentStatusBadge({ status }: { status: AgentStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.stopped
  const Icon = config.icon

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold tracking-wider", config.color)}>
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </span>
  )
}
