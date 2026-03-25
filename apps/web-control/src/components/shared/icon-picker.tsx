"use client"

import { AGENT_ICONS, DEFAULT_AGENT_ICON, getAgentIcon } from "@/lib/agent-icons"
import { cn } from "@/lib/utils"

interface IconPickerProps {
  value?: string | null
  onChange: (id: string) => void
  className?: string
}

/**
 * Grid picker để chọn icon Lucide cho agent.
 * Render inline — đặt trực tiếp trong form.
 */
export function IconPicker({ value, onChange, className }: IconPickerProps) {
  const selected = value ?? DEFAULT_AGENT_ICON
  const SelectedIcon = getAgentIcon(selected)

  return (
    <div className={cn("space-y-2", className)}>
      {/* Preview */}
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border bg-muted/20">
        <SelectedIcon className="w-5 h-5 text-primary" />
        <span className="text-xs text-muted-foreground">
          {AGENT_ICONS.find(i => i.id === selected)?.label ?? selected}
        </span>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-9 gap-1 p-2 rounded-md border border-border bg-muted/10">
        {AGENT_ICONS.map(({ id, label, icon: Icon }) => {
          const isSelected = id === selected
          return (
            <button
              key={id}
              type="button"
              title={label}
              onClick={() => onChange(id)}
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-md transition-all",
                isSelected
                  ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
