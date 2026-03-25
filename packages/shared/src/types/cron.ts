export type CronJobStatus = "active" | "running" | "paused" | "failed" | "disabled"
export type CronRunStatus = "running" | "success" | "failed" | "timeout"

export interface CronJob {
  id: string
  name: string
  schedule: string        // cron expression
  agentId: string
  agentName?: string
  task: string            // task description passed to agent
  notifyChannel?: string  // channel to notify on completion
  enabled: boolean
  status: CronJobStatus
  lastRunAt?: number
  lastRunStatus?: CronRunStatus
  nextRunAt?: number
  createdAt: number
  updatedAt: number
}

export interface CronRun {
  id: string
  jobId: string
  jobName: string
  agentId?: string
  startedAt: number
  finishedAt?: number
  status: CronRunStatus
  output?: string
  tokenUsed: number
  error?: string
  durationMs?: number
}

export interface CronJobCreateInput {
  name: string
  schedule: string
  agentId: string
  task: string
  notifyChannel?: string
  enabled?: boolean
}

export interface CronNextRuns {
  jobId: string
  nextRuns: number[]  // 5 upcoming timestamps
}
