"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bot,
  Activity,
  Clock,
  GitFork,
  Radio,
  Cpu,
  BarChart3,
  Terminal,
  Settings,
  Zap,
  ChevronRight,
  Circle,
  Send,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { configApi } from "@/lib/api"

const navItems = [
  {
    group: "OPERATIONS",
    items: [
      { href: "/agents", icon: Bot, label: "Agents", shortcut: "A" },
      { href: "/tasks", icon: Send, label: "Tasks", shortcut: "K" },
      { href: "/monitor", icon: Activity, label: "Monitor", shortcut: "M" },
      { href: "/cron", icon: Clock, label: "Cron", shortcut: "C" },
      { href: "/flow", icon: GitFork, label: "Flow Builder", shortcut: "F" },
    ],
  },
  {
    group: "CONNECTIONS",
    items: [
      { href: "/channels", icon: Radio, label: "Channels", shortcut: "H" },
      { href: "/mcp", icon: Cpu, label: "MCP Servers", shortcut: "P" },
    ],
  },
  {
    group: "ANALYTICS",
    items: [
      { href: "/reports", icon: BarChart3, label: "Reports", shortcut: "R" },
      { href: "/terminal", icon: Terminal, label: "Terminal", shortcut: "T" },
    ],
  },
  {
    group: "SYSTEM",
    items: [
      { href: "/config", icon: Settings, label: "Config", shortcut: "G" },
    ],
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: configApi.health,
    refetchInterval: 30_000,
  })

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 flex flex-col border-r border-border bg-sidebar z-50 overflow-hidden">
      {/* Logo */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-sidebar-border shrink-0">
        <div className="relative w-7 h-7">
          <Zap className="w-7 h-7 text-primary absolute" strokeWidth={2} />
          <div className="absolute inset-0 blur-md bg-primary/40 rounded-full scale-75" />
        </div>
        <div>
          <div className="text-xl font-bold tracking-[6px] text-primary text-glow-cyan">ZERABOT</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {navItems.map(group => (
          <div key={group.group}>
            <div className="px-2 mb-1.5 text-[18px] font-bold tracking-[0.2em] text-green-700">
              {group.group}
            </div>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded text-lg uppercase transition-all duration-150 group relative",
                      active
                        ? "bg-accent text-accent-foreground border border-primary/30 glow-cyan"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground border border-transparent"
                    )}
                  >
                    {active && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary rounded-full" />
                    )}
                    <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={1.5} />
                    <span className="flex-1 tracking-wide">{item.label}</span>
                    {active && <ChevronRight className="w-3 h-3 text-primary/60" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Status footer */}
      <div className="shrink-0 border-t border-sidebar-border px-3 py-2.5">
        <div className="flex items-center gap-2 text-[11px]">
          <Circle
            className={cn(
              "w-2 h-2 shrink-0 fill-current pulse-dot",
              health?.zeroclaw?.ok ? "text-green-500" : "text-red-500"
            )}
          />
          <span className="text-muted-foreground">ZEROCLAW</span>
          <span className={cn("ml-auto font-bold", health?.zeroclaw?.ok ? "text-green-400" : "text-red-400")}>
            {health?.zeroclaw?.ok ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
        {health?.zeroclaw?.version && (
          <div className="text-[10px] text-muted-foreground/50 mt-0.5 pl-4">
            {health.zeroclaw.version}
          </div>
        )}
      </div>
    </aside>
  )
}
