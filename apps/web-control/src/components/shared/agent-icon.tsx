import { getAgentIcon } from "@/lib/agent-icons"
import { cn } from "@/lib/utils"

interface AgentIconProps {
  id?: string | null
  className?: string
}

/**
 * Render Lucide icon từ id string lưu trong agent.emoji.
 * Dùng ở mọi nơi cần hiển thị icon agent.
 */
export function AgentIcon({ id, className }: AgentIconProps) {
  const Icon = getAgentIcon(id)
  return <Icon className={cn("shrink-0", className)} />
}
