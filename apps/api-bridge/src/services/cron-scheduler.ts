/**
 * Cron Scheduler Service
 *
 * Polls the DB every 30 seconds for active cron jobs.
 * When a job's cron expression matches the current minute, dispatches
 * the task to the target agent via OpenClaw gateway, records the run,
 * and updates next_run_at.
 *
 * Cron expression format: "min hr dom mon dow" (standard 5-field).
 * Supported field syntax: wildcard (*), number, range (1-5),
 * step (* /2, 1-5/2), list (1,2,3).
 */

import { getAllCronJobs, upsertCronJob, insertCronRun, getAgentById } from "../db/queries"
import { getAgentEntry } from "./process-manager"
import { executeTask } from "./agent-executor"
import { createLogger } from "../utils/logger"
import type { CronJob } from "@zerobot/shared"

const log = createLogger("CronScheduler")

// Track which job was last fired at which minute-timestamp to prevent
// double-firing when the poll interval straddles a minute boundary.
// Key: jobId  Value: floor(Date.now() / 60_000)
const lastFiredMinute = new Map<string, number>()

let timer: ReturnType<typeof setInterval> | null = null

// ── Public API ────────────────────────────────────────────────────────────────

export function startCronScheduler(): void {
  if (timer !== null) return
  // Align first tick to the next 30-second boundary for predictable firing
  const msToNext30 = 30_000 - (Date.now() % 30_000)
  setTimeout(() => {
    tick()
    timer = setInterval(tick, 30_000)
  }, msToNext30)
  log.info("Cron scheduler started", { pollIntervalMs: 30_000 })
}

export function stopCronScheduler(): void {
  if (timer !== null) { clearInterval(timer); timer = null }
  lastFiredMinute.clear()
}

// ── Tick ──────────────────────────────────────────────────────────────────────

function tick(): void {
  const now = new Date()
  const currentMinute = Math.floor(Date.now() / 60_000)

  // Prune stale entries to prevent unbounded Map growth
  if (lastFiredMinute.size > 500) {
    for (const [key, minute] of lastFiredMinute) {
      if (minute < currentMinute - 10) lastFiredMinute.delete(key)
    }
  }

  const jobs = getAllCronJobs()
  for (const job of jobs) {
    if (!job.enabled || job.status !== "active") continue
    if (lastFiredMinute.get(job.id) === currentMinute) continue  // already fired this minute
    if (!matchesCron(job.schedule, now)) continue

    lastFiredMinute.set(job.id, currentMinute)
    dispatch(job, now).catch(err =>
      log.error("Cron dispatch error", { jobId: job.id, err: String(err) })
    )
  }
}

async function dispatch(job: CronJob, firedAt: Date): Promise<void> {
  const entry = getAgentEntry(job.agentId)
  if (!entry) {
    log.warn("Cron job agent not running — skipped", { jobId: job.id, agentId: job.agentId })
    return
  }

  const runId = `run-${job.id}-${firedAt.getTime()}`
  const startedAt = firedAt.getTime()

  insertCronRun({
    id: runId,
    jobId: job.id,
    jobName: job.name,
    agentId: job.agentId,
    startedAt,
    status: "running",
    tokenUsed: 0,
  })

  log.info("Cron job fired", { jobId: job.id, name: job.name, agentId: job.agentId })

  const agent = getAgentById(job.agentId)
  if (!agent) {
    log.error("Agent not found in DB", { jobId: job.id, agentId: job.agentId })
    return
  }
  const result = await executeTask(agent, job.task, runId)

  // Update job metadata
  const nextRun = computeNextRun(job.schedule, firedAt)
  upsertCronJob({
    ...job,
    lastRunAt: startedAt,
    lastRunStatus: result.ok ? "success" : "failed",
    nextRunAt: nextRun,
    updatedAt: Date.now(),
  })

  if (!result.ok) {
    log.error("Cron task dispatch failed", { jobId: job.id, error: result.error })
  }
}

// ── Cron expression parser ────────────────────────────────────────────────────

/**
 * Returns true when `expr` (5-field standard cron) matches `date`.
 * Complexity: O(1) — each field parses at most a small fixed-length string.
 */
export function matchesCron(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const [minF, hrF, domF, monF, dowF] = parts
  return (
    matchField(minF, date.getMinutes(),     0, 59) &&
    matchField(hrF,  date.getHours(),       0, 23) &&
    matchField(domF, date.getDate(),        1, 31) &&
    matchField(monF, date.getMonth() + 1,  1, 12) &&
    matchField(dowF, date.getDay(),         0,  6)
  )
}

/**
 * Match a single cron field against a numeric value.
 * Supports: *, n, a-b, *\/n, a-b/n, a,b,c (and combinations).
 */
function matchField(field: string, value: number, _min: number, _max: number): boolean {
  // List: "a,b,c" — split and check any segment matches
  if (field.includes(",")) {
    return field.split(",").some(f => matchField(f.trim(), value, _min, _max))
  }

  // Step: "*/n" or "a-b/n"
  if (field.includes("/")) {
    const slash = field.indexOf("/")
    const range = field.slice(0, slash)
    const step  = parseInt(field.slice(slash + 1), 10)
    if (isNaN(step) || step <= 0) return false

    if (range === "*") return (value - _min) % step === 0
    // Range with step
    const dash = range.indexOf("-")
    if (dash !== -1) {
      const from = parseInt(range.slice(0, dash), 10)
      const to   = parseInt(range.slice(dash + 1), 10)
      return value >= from && value <= to && (value - from) % step === 0
    }
    const from = parseInt(range, 10)
    return value >= from && (value - from) % step === 0
  }

  // Wildcard
  if (field === "*") return true

  // Range: "a-b"
  if (field.includes("-")) {
    const dash = field.indexOf("-")
    const from = parseInt(field.slice(0, dash), 10)
    const to   = parseInt(field.slice(dash + 1), 10)
    return value >= from && value <= to
  }

  // Exact value
  return parseInt(field, 10) === value
}

/**
 * Compute the next Date that the cron expression fires after `after`.
 * Uses hierarchical field skipping: month → day → hour → minute.
 * Worst case O(12+31+24+60) ≈ 127 iterations vs the previous O(10_080).
 */
export function computeNextRun(expr: string, after: Date): number | undefined {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return undefined

  const [minF, hrF, domF, monF, dowF] = parts

  const candidate = new Date(after.getTime())
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)

  const deadline = after.getTime() + 7 * 24 * 60 * 60_000  // 7 days

  while (candidate.getTime() < deadline) {
    // Month mismatch → jump to 1st of next month at midnight
    if (!matchField(monF, candidate.getMonth() + 1, 1, 12)) {
      candidate.setMonth(candidate.getMonth() + 1, 1)
      candidate.setHours(0, 0, 0, 0)
      continue
    }
    // DOM or DOW mismatch → jump to next day at midnight
    if (!matchField(domF, candidate.getDate(), 1, 31) ||
        !matchField(dowF, candidate.getDay(), 0, 6)) {
      candidate.setDate(candidate.getDate() + 1)
      candidate.setHours(0, 0, 0, 0)
      continue
    }
    // Hour mismatch → jump to next hour at :00
    if (!matchField(hrF, candidate.getHours(), 0, 23)) {
      candidate.setHours(candidate.getHours() + 1, 0, 0, 0)
      continue
    }
    // Minute mismatch → advance 1 minute
    if (!matchField(minF, candidate.getMinutes(), 0, 59)) {
      candidate.setMinutes(candidate.getMinutes() + 1)
      continue
    }
    return candidate.getTime()
  }

  return undefined
}
