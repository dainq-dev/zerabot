"use client"

import { useState, useCallback, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ReactFlow,
  Background, Controls, MiniMap,
  addEdge, applyNodeChanges, applyEdgeChanges,
  SmoothStepEdge,
  type Node, type Edge, type Connection,
  type NodeChange, type EdgeChange,
  BackgroundVariant,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { nodeTypes }      from "@/components/flow/flow-nodes"

// Map our domain edge types to React Flow's SmoothStepEdge
const edgeTypes = {
  sequential:  SmoothStepEdge,
  parallel:    SmoothStepEdge,
  conditional: SmoothStepEdge,
}
import { FlowToolbar }    from "@/components/flow/flow-toolbar"
import { FlowInspector }  from "@/components/flow/flow-inspector"
import { pipelinesApi }   from "@/lib/api"
import { Skeleton }       from "@/components/ui/skeleton"
import type { FlowNodeType, Pipeline } from "@zerobot/shared"

// ── ID generator ──────────────────────────────────────────────────────────────
let _counter = 0
function genId() { return `n-${++_counter}-${Date.now()}` }

// ── Node default positions — cascade to avoid overlap ─────────────────────────
function nextPosition(nodeCount: number) {
  const col = nodeCount % 4
  const row = Math.floor(nodeCount / 4)
  return { x: 80 + col * 280, y: 80 + row * 180 }
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FlowEditorPage() {
  const params    = useParams()
  const router    = useRouter()
  const qc        = useQueryClient()
  const id        = params.id as string

  const [nodes,           setNodes]           = useState<Node[]>([])
  const [edges,           setEdges]           = useState<Edge[]>([])
  const [pipelineName,    setPipelineName]    = useState("")
  const [selectedNodeId,  setSelectedNodeId]  = useState<string | null>(null)
  const [isDirty,         setIsDirty]         = useState(false)

  // ── Load pipeline ──────────────────────────────────────────────────────────
  const { data: pipeline, isLoading } = useQuery<Pipeline>({
    queryKey: ["pipeline", id],
    queryFn: () => pipelinesApi.list().then(ps => {
      const p = ps.find(x => x.id === id)
      if (!p) throw new Error("Pipeline not found")
      return p
    }),
  })

  // Hydrate canvas when pipeline loads
  useEffect(() => {
    if (pipeline) {
      setPipelineName(pipeline.name)
      setNodes(pipeline.nodes as unknown as Node[])
      setEdges(pipeline.edges as unknown as Edge[])
      setIsDirty(false)
    }
  }, [pipeline?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── React Flow handlers ────────────────────────────────────────────────────
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(n => applyNodeChanges(changes, n))
    setIsDirty(true)
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(e => applyEdgeChanges(changes, e))
    setIsDirty(true)
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    setEdges(e => addEdge({
      ...connection,
      type: "smoothstep",
      animated: true,
      style: { stroke: "oklch(0.72 0.17 192 / 55%)", strokeWidth: 1.5 },
    }, e))
    setIsDirty(true)
  }, [])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  // ── Add node ───────────────────────────────────────────────────────────────
  const handleAddNode = useCallback((type: FlowNodeType, defaultData: Record<string, unknown>) => {
    if (type === "__clear__" as FlowNodeType) {
      setNodes([])
      setEdges([])
      setIsDirty(true)
      return
    }
    const node: Node = {
      id:       genId(),
      type,
      position: nextPosition(nodes.length),
      data:     defaultData,
    }
    setNodes(n => [...n, node])
    setSelectedNodeId(node.id)
    setIsDirty(true)
  }, [nodes.length])

  // ── Inspector: update node data live ──────────────────────────────────────
  const handleNodeDataChange = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes(ns => ns.map(n => n.id === nodeId ? { ...n, data } : n))
    setIsDirty(true)
  }, [])

  // ── Save ───────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () => pipelinesApi.update(id, {
      name:   pipelineName,
      nodes:  nodes as unknown as Pipeline["nodes"],
      edges:  edges as unknown as Pipeline["edges"],
    }),
    onSuccess: (p) => {
      toast.success("Pipeline đã lưu")
      setIsDirty(false)
      qc.setQueryData(["pipeline", id], p)
      qc.invalidateQueries({ queryKey: ["pipelines"] })
    },
    onError: (err) => toast.error(String(err)),
  })

  // ── Run ────────────────────────────────────────────────────────────────────
  const handleRun = () => {
    if (isDirty) {
      toast.error("Vui lòng lưu pipeline trước khi chạy")
      return
    }
    pipelinesApi.run(id)
      .then(() => toast.success("Pipeline đang chạy"))
      .catch(err => toast.error(String(err)))
  }

  // ── Selected node for inspector ────────────────────────────────────────────
  const selectedNode = selectedNodeId
    ? (nodes.find(n => n.id === selectedNodeId) ?? null)
    : null

  const decoratedNodes = nodes.map(n => ({
    ...n,
    data: {
      ...n.data,
      _hasIncoming: edges.some(e => e.target === n.id),
      _hasOutgoing: edges.some(e => e.source === n.id),
    },
  }))

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 -m-5 h-[calc(100vh-3.5rem)]">
        <Skeleton className="h-12 rounded-none" />
        <Skeleton className="flex-1 rounded-none" />
      </div>
    )
  }

  if (!pipeline) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-muted-foreground">Không tìm thấy pipeline</p>
          <button onClick={() => router.push("/flow")} className="text-primary text-sm mt-2 hover:underline">
            ← Quay lại danh sách
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col -m-5 h-[calc(100vh-3.5rem)]">
      {/* Toolbar */}
      <FlowToolbar
        pipelineName={pipelineName}
        onNameChange={name => { setPipelineName(name); setIsDirty(true) }}
        onAddNode={handleAddNode}
        onSave={() => saveMutation.mutate()}
        onRun={handleRun}
        onBack={() => router.push("/flow")}
        isSaving={saveMutation.isPending}
        isDirty={isDirty}
      />

      {/* Canvas + Inspector */}
      <div className="flex flex-1 overflow-hidden">
        {/* React Flow */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={decoratedNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              style: { stroke: "oklch(0.72 0.17 192 / 55%)", strokeWidth: 1.5 },
            }}
            style={{ background: "transparent" }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="oklch(0.3 0.02 200 / 40%)"
            />
            <Controls
              className="!bg-card !border-border !rounded-lg overflow-hidden"
              showInteractive={false}
            />
            <MiniMap
              className="!bg-card/80 !border-border !rounded-lg"
              nodeColor="oklch(0.72 0.17 192 / 25%)"
              maskColor="oklch(0.09 0.01 220 / 70%)"
            />
          </ReactFlow>

          {/* Empty state */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-4 text-center select-none">
                <div className="flex items-center gap-3 text-muted-foreground/25 text-sm font-mono">
                  <span className="border border-dashed border-muted-foreground/15 rounded-md px-2.5 py-1.5">
                    Trigger
                  </span>
                  <span>──▶</span>
                  <span className="border border-dashed border-muted-foreground/15 rounded-md px-2.5 py-1.5">
                    Agent
                  </span>
                  <span>──▶</span>
                  <span className="border border-dashed border-muted-foreground/15 rounded-md px-2.5 py-1.5">
                    Notify
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground/30 font-mono">
                    Nhấn <span className="text-foreground/25 font-bold">+ Thêm Node</span> để bắt đầu
                  </p>
                  <p className="text-xs text-muted-foreground/20 font-mono">
                    Bắt đầu bằng node <span className="text-cyan-400/30">Kịch bản bắt đầu</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Click node hint */}
          {nodes.length > 0 && !selectedNode && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="text-[11px] text-muted-foreground/40 font-mono bg-card/60 px-3 py-1.5 rounded-full border border-border/30">
                Click vào node để cấu hình chi tiết
              </div>
            </div>
          )}
        </div>

        {/* Inspector panel */}
        {selectedNode && (
          <FlowInspector
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
            onChange={handleNodeDataChange}
          />
        )}
      </div>

      {/* Pipeline status bar */}
      <div className="shrink-0 flex items-center gap-4 px-4 h-8 border-t border-border bg-card/50 text-[11px] text-muted-foreground font-mono">
        <span className="text-foreground/50 uppercase tracking-wider">{pipeline.name}</span>
        <span>·</span>
        <span>{nodes.length} nodes · {edges.length} connections</span>
        <span>·</span>
        <span className={pipeline.trigger.type === "cron" ? "text-cyan-400/70" : ""}>
          {pipeline.trigger.type === "cron" && pipeline.trigger.schedule
            ? `⏰ ${pipeline.trigger.schedule}`
            : pipeline.trigger.type === "manual" ? "🖱️ Thủ công"
            : pipeline.trigger.type === "channel" ? `📩 ${pipeline.trigger.channelId ?? "channel"}`
            : "🔗 Webhook"}
        </span>
        {pipeline.lastRunAt && (
          <>
            <span>·</span>
            <span>Lần cuối: {new Date(pipeline.lastRunAt).toLocaleString("vi-VN", {
              month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
            })}</span>
          </>
        )}
        <div className="flex-1" />
        <span className={isDirty ? "text-amber-400/80" : "text-muted-foreground/30"}>
          {isDirty ? "● Chưa lưu" : "✓ Đã lưu"}
        </span>
      </div>
    </div>
  )
}
