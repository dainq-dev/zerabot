"use client"

import { usePathname } from "next/navigation"
import { Bell, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState, useEffect } from "react"

const routeLabels: Record<string, string> = {
  "/agents": "Agent Manager",
  "/monitor": "Monitor",
  "/cron": "Cron Scheduler",
  "/flow": "Flow Builder",
  "/channels": "Multi-Channel Gateway",
  "/mcp": "MCP Servers",
  "/reports": "Reports",
  "/terminal": "Agent Terminal",
  "/config": "Config Center",
}

function ClockDisplay() {
  const [time, setTime] = useState<string>("")

  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString("en-US", { hour12: false }))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  return <span>{time}</span>
}

export function Topbar() {
  const pathname = usePathname()
  const label = Object.entries(routeLabels).find(([k]) => pathname.startsWith(k))?.[1] ?? "Dashboard"

  return (
    <header className="sticky top-0 z-40 h-14 flex items-center justify-between gap-4 border-b border-gray-700  bg-background/80 backdrop-blur-sm px-5">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground text-[20px] font-bold uppercase tracking-[6px]">
          ZERABOT
        </span>
        <span className="text-muted-foreground/40">/</span>
        <span className="font-semibold uppercase tracking-[4px] text-[18px] text-foreground">
          {label}
        </span>
      </div>
      <div className="flex items-center justify-end gap-8">
        <div className="text-md text-muted-foreground font-mono tabular-nums">
          <ClockDisplay />
        </div>
      </div>
    </header>
  );
}
