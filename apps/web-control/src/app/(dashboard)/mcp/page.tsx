"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { mcpApi, agentsApi } from "@/lib/api"
import type { McpServerConfig } from "@zerobot/shared"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import {
  Plus, Trash2, Cpu, Circle, Wrench, Server
} from "lucide-react"

const TRANSPORT_COLORS = {
  stdio: "text-green-400 bg-green-500/10 border-green-500/20",
  ws: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  http: "text-blue-400 bg-blue-500/10 border-blue-500/20",
}

interface CreateMcpDialogProps {
  open: boolean
  onClose: () => void
}

function CreateMcpDialog({ open, onClose }: CreateMcpDialogProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: "", description: "", transport: "stdio" as "stdio" | "ws" | "http",
    command: "bun", args: "", url: "", endpoint: "", autoConnect: true, reconnectMs: 3000,
  })
  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: () => mcpApi.create({
      ...form,
      args: form.args.split(" ").filter(Boolean),
      assignedAgents: [],
    }),
    onSuccess: () => {
      toast.success("MCP server added")
      qc.invalidateQueries({ queryKey: ["mcp-servers"] })
      onClose()
    },
    onError: (err) => toast.error(String(err)),
  })

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="bg-card border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono tracking-wide">Add MCP Server</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)}
              className="mt-1 text-xs" placeholder="clawbot-data" />
          </div>

          <div>
            <Label className="text-xs">Mission Description</Label>
            <Textarea value={form.description} onChange={e => set("description", e.target.value)}
              className="mt-1 text-xs" rows={2}
              placeholder="What does this MCP server do? (AI reads this to know when to use it)" />
          </div>

          <div>
            <Label className="text-xs">Transport</Label>
            <Select value={form.transport} onValueChange={v => set("transport", v)}>
              <SelectTrigger className="mt-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">stdio — subprocess</SelectItem>
                <SelectItem value="ws">WebSocket</SelectItem>
                <SelectItem value="http">HTTP SSE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.transport === "stdio" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Command</Label>
                <Input value={form.command} onChange={e => set("command", e.target.value)}
                  className="mt-1 font-mono text-xs" placeholder="bun" />
              </div>
              <div>
                <Label className="text-xs">Args (space-separated)</Label>
                <Input value={form.args} onChange={e => set("args", e.target.value)}
                  className="mt-1 font-mono text-xs" placeholder="run mcp/index.ts" />
              </div>
            </div>
          )}

          {form.transport === "ws" && (
            <div>
              <Label className="text-xs">WebSocket URL</Label>
              <Input value={form.url} onChange={e => set("url", e.target.value)}
                className="mt-1 font-mono text-xs" placeholder="ws://localhost:3001/mcp" />
            </div>
          )}

          {form.transport === "http" && (
            <div>
              <Label className="text-xs">SSE Endpoint</Label>
              <Input value={form.endpoint} onChange={e => set("endpoint", e.target.value)}
                className="mt-1 font-mono text-xs" placeholder="http://localhost:3001/sse" />
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} className="text-xs">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name} className="text-xs">
            {mutation.isPending ? "Adding..." : "Add Server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function McpPage() {
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: mcpApi.list,
    refetchInterval: 15_000,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => mcpApi.delete(id),
    onSuccess: () => {
      toast.success("MCP server removed")
      qc.invalidateQueries({ queryKey: ["mcp-servers"] })
    },
  })

  const discoverMutation = useMutation({
    mutationFn: (id: string) => mcpApi.discover(id),
    onSuccess: (data, id) => {
      toast.success(`Discovered ${data.count} tools`)
      qc.invalidateQueries({ queryKey: ["mcp-servers"] })
    },
    onError: (err) => toast.error(String(err)),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-wide">MCP Servers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {servers.length} registered — Model Context Protocol registry
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowCreate(true)} data-testid="btn-new-mcp">
          <Plus className="w-3 h-3" /> Add Server
        </Button>
      </div>

      <div data-testid="mcp-grid" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)
          : servers.map(server => (
            <Card key={server.id} className="p-4 bg-card border-border card-hover">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-primary" />
                    <span className="font-bold text-sm">{server.name}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{server.id}</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge className={cn("text-[9px] font-bold border", TRANSPORT_COLORS[server.transport])}>
                    {server.transport.toUpperCase()}
                  </Badge>
                  <Circle className={cn(
                    "w-2 h-2 fill-current",
                    server.status === "connected" ? "text-green-400" :
                      server.status === "connecting" ? "text-cyan-400 pulse-dot" :
                        "text-red-400"
                  )} />
                </div>
              </div>

              {server.description && (
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-2 line-clamp-2">
                  {server.description}
                </p>
              )}

              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-3">
                <Cpu className="w-3 h-3" />
                {server.command
                  ? `${server.command} ${(server.args ?? []).join(" ")}`
                  : server.url ?? server.endpoint ?? "—"
                }
              </div>

              {server.assignedAgents.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {server.assignedAgents.map(a => (
                    <Badge key={a} variant="outline" className="text-[9px] px-1.5 py-0">{a}</Badge>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1 mt-2">
                {(server.toolCount !== undefined || server.tools) && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-1">
                    <Wrench className="w-3 h-3" />
                    {server.toolCount ?? server.tools?.length ?? 0} tools
                  </div>
                )}
                <div className="flex items-center gap-1 ml-auto">
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 px-2 text-[10px] text-cyan-400 hover:text-cyan-300 gap-1"
                    onClick={() => discoverMutation.mutate(server.id)}
                    disabled={discoverMutation.isPending}
                    title="Auto-discover tools"
                  >
                    <Cpu className="w-2.5 h-2.5" />
                    {discoverMutation.isPending && discoverMutation.variables === server.id ? "..." : "Discover"}
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-300"
                    onClick={() => deleteMutation.mutate(server.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Discovered tools list */}
              {server.tools && server.tools.length > 0 && (
                <div className="mt-2 border-t border-border/30 pt-2 space-y-1">
                  {server.tools.slice(0, 4).map(tool => (
                    <div key={tool.name} className="flex items-start gap-1.5 text-[10px]">
                      <Wrench className="w-2.5 h-2.5 text-muted-foreground/50 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-mono text-cyan-400/80">{tool.name}</span>
                        {tool.description && (
                          <span className="text-muted-foreground/50 ml-1 line-clamp-1">{tool.description}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {server.tools.length > 4 && (
                    <div className="text-[10px] text-muted-foreground/40 pl-4">
                      +{server.tools.length - 4} more tools
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))
        }
      </div>

      <CreateMcpDialog open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
