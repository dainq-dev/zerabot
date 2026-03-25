"use client"

import { useQuery } from "@tanstack/react-query"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cronApi } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { CronRun } from "@zerobot/shared"

interface Props {
  jobId: string | null
  jobName?: string
  onClose: () => void
}

function RunStatusBadge({ status }: { status: CronRun["status"] }) {
  const cls = {
    running: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    success: "bg-green-500/10 text-green-400 border-green-500/20",
    failed:  "bg-red-500/10 text-red-400 border-red-500/20",
    timeout: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  }[status]

  return (
    <Badge variant="outline" className={cn("text-[10px] tracking-wider font-mono uppercase", cls)}>
      {status}
    </Badge>
  )
}

function formatDuration(ms?: number) {
  if (!ms) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

export function CronRunsDialog({ jobId, jobName, onClose }: Props) {
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["cron-runs", jobId],
    queryFn: () => cronApi.runs(jobId!),
    enabled: !!jobId,
    refetchInterval: 5_000,
  })

  return (
    <Dialog open={!!jobId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-full max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wide text-sm">
            Run History{jobName ? ` — ${jobName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-2 pr-1 mt-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-md" />
            ))
          ) : runs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No runs yet</p>
          ) : (
            runs.map(run => (
              <div key={run.id} className="border border-border rounded-md p-3 space-y-1.5 hover:bg-muted/10 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RunStatusBadge status={run.status} />
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(run.startedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                    <span title="Duration">{formatDuration(run.durationMs)}</span>
                    <span title="Tokens used" className="text-primary/60">
                      {run.tokenUsed.toLocaleString()} tok
                    </span>
                  </div>
                </div>

                {run.output && (
                  <pre className="text-[11px] font-mono text-muted-foreground/80 bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap line-clamp-3">
                    {run.output}
                  </pre>
                )}
                {run.error && (
                  <p className="text-[11px] font-mono text-red-400 bg-red-500/5 rounded p-2">
                    {run.error}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
