"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, RefreshCw, Clock, Play, Pause, RotateCcw, Trash2, History, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { CronForm } from "@/components/cron/cron-form"
import { CronRunsDialog } from "@/components/cron/cron-runs-dialog"
import { cronApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { CronJob } from "@zerobot/shared"

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: number | undefined) {
  if (!ts) return "—"
  return new Date(ts).toLocaleString("vi-VN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit",  minute: "2-digit",
  })
}

function StatusBadge({ status }: { status: CronJob["status"] }) {
  const cfg: Record<CronJob["status"], { label: string; cls: string }> = {
    active:   { label: "ACTIVE",    cls: "bg-green-500/10 text-green-400 border-green-500/20" },
    running:  { label: "RUNNING",   cls: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
    paused:   { label: "PAUSED",    cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    failed:   { label: "FAILED",    cls: "bg-red-500/10 text-red-400 border-red-500/20" },
    disabled: { label: "DISABLED",  cls: "bg-muted/50 text-muted-foreground border-border" },
  }
  const { label, cls } = cfg[status] ?? cfg.disabled

  return (
    <Badge variant="outline" className={cn("text-[10px] tracking-wider font-mono gap-1.5", cls)}>
      {status === "running" && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
      {status === "active"  && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
      {label}
    </Badge>
  )
}

function LastRunStatus({ status }: { status: CronJob["lastRunStatus"] }) {
  if (!status) return null
  const cls = {
    success: "text-green-400",
    failed:  "text-red-400",
    timeout: "text-amber-400",
    running: "text-cyan-400",
  }[status] ?? "text-muted-foreground"
  return <span className={cn("ml-1.5 font-mono", cls)}>• {status}</span>
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function CronPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedJob, setSelectedJob] = useState<{ id: string; name: string } | null>(null)
  const qc = useQueryClient()

  const { data: jobs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["cron"],
    queryFn: cronApi.list,
    refetchInterval: 10_000,
  })

  const actionMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "run" | "pause" | "resume" }) =>
      cronApi.action(id, action),
    onSuccess: (_, { action }) => {
      toast.success(`Job ${action === "run" ? "triggered" : action + "d"}`)
      qc.invalidateQueries({ queryKey: ["cron"] })
    },
    onError: (err) => toast.error(`Action failed: ${err.message}`),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => cronApi.delete(id),
    onSuccess: () => {
      toast.success("Cron job deleted")
      qc.invalidateQueries({ queryKey: ["cron"] })
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  })

  const counts = {
    total:   jobs.length,
    running: jobs.filter(j => j.status === "running").length,
    paused:  jobs.filter(j => j.status === "paused").length,
    failed:  jobs.filter(j => j.status === "failed").length,
    active:  jobs.filter(j => j.status === "active" || j.status === "running").length,
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl uppercase font-bold tracking-wide">Cron Scheduler</h1>
          <p className="text-md text-muted-foreground mt-0.5">
            {counts.active}/{counts.total} jobs active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="lg"
            className="h-8 gap-2 text-md uppercase"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="lg"
            className="h-8 gap-2 text-md uppercase"
            onClick={() => setShowCreate(true)}
            data-testid="btn-new-cron"
          >
            <Plus className="w-3 h-3" />
            New Job
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "TOTAL",   value: counts.total,   color: "text-foreground" },
          { label: "RUNNING", value: counts.running,  color: "text-cyan-400" },
          { label: "PAUSED",  value: counts.paused,   color: "text-amber-400" },
          { label: "FAILED",  value: counts.failed,   color: "text-red-400" },
        ].map(stat => (
          <div
            key={stat.label}
            className="bg-card border border-border rounded-md px-3 py-2.5 flex flex-col items-center"
          >
            <div className="text-[16px] tracking-widest text-muted-foreground">{stat.label}</div>
            <div className={cn("text-4xl font-bold font-mono mt-3", stat.color)}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-md" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Clock className="w-20 h-20 text-muted-foreground/30 mb-3" />
          <p className="text-lg uppercase text-muted-foreground">No cron jobs scheduled</p>
          <p className="text-md text-muted-foreground/60 mt-1">
            Create your first job to automate tasks
          </p>
          <Button
            size="lg"
            className="mt-4 gap-1.5 text-sm uppercase"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3 h-3" /> Create Job
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                {["Name", "Schedule", "Agent", "Last Run", "Next Run", "Status", ""].map(h => (
                  <TableHead
                    key={h}
                    className={cn(
                      "text-[11px] tracking-wider text-muted-foreground uppercase",
                      h === "" && "text-right"
                    )}
                  >
                    {h || "Actions"}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody data-testid="cron-table-body">
              {jobs.map(job => (
                <TableRow key={job.id} data-testid={`cron-row-${job.id}`} className="border-border hover:bg-muted/20">
                  <TableCell className="font-medium">{job.name}</TableCell>

                  <TableCell>
                    <code className="text-xs font-mono text-primary/80 bg-primary/5 px-1.5 py-0.5 rounded">
                      {job.schedule}
                    </code>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {job.agentName ?? job.agentId}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {fmtTime(job.lastRunAt)}
                    <LastRunStatus status={job.lastRunStatus} />
                  </TableCell>

                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {fmtTime(job.nextRunAt)}
                  </TableCell>

                  <TableCell>
                    <StatusBadge status={job.status} />
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {/* History */}
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="View run history"
                        onClick={() => setSelectedJob({ id: job.id, name: job.name })}
                      >
                        <History className="w-3.5 h-3.5" />
                      </Button>

                      {/* Run now */}
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-cyan-400 hover:text-cyan-300"
                        title="Run now"
                        disabled={actionMut.isPending}
                        data-testid={`btn-cron-run-${job.id}`}
                        onClick={() => actionMut.mutate({ id: job.id, action: "run" })}
                      >
                        <Play className="w-3.5 h-3.5" />
                      </Button>

                      {/* Pause / Resume */}
                      {job.status === "paused" ? (
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-green-400 hover:text-green-300"
                          title="Resume"
                          disabled={actionMut.isPending}
                          onClick={() => actionMut.mutate({ id: job.id, action: "resume" })}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-amber-400 hover:text-amber-300"
                          title="Pause"
                          disabled={actionMut.isPending || job.status === "running"}
                          onClick={() => actionMut.mutate({ id: job.id, action: "pause" })}
                        >
                          <Pause className="w-3.5 h-3.5" />
                        </Button>
                      )}

                      {/* Delete */}
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-red-400 hover:text-red-300"
                        title="Delete"
                        disabled={deleteMut.isPending}
                        data-testid={`btn-cron-delete-${job.id}`}
                        onClick={() => deleteMut.mutate(job.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialogs */}
      <CronForm open={showCreate} onClose={() => setShowCreate(false)} />
      <CronRunsDialog
        jobId={selectedJob?.id ?? null}
        jobName={selectedJob?.name}
        onClose={() => setSelectedJob(null)}
      />
    </div>
  )
}
