import { Database } from "bun:sqlite"
import { SCHEMA_SQL } from "./schema"
import path from "path"
import os from "os"

const dbPath = process.env.API_BRIDGE_DB_PATH ?? path.join(os.homedir(), ".zerabot", "bridge.db")

// Ensure directory exists
const dir = path.dirname(dbPath)
await Bun.write(path.join(dir, ".gitkeep"), "").catch(() => {})

export const db = new Database(dbPath, { create: true })
db.exec("PRAGMA journal_mode = WAL;")
db.exec("PRAGMA foreign_keys = ON;")
db.exec(SCHEMA_SQL)

// Migrations — add columns/tables that didn't exist in earlier schema versions
const migrations = [
  "ALTER TABLE agents ADD COLUMN port INTEGER",
  "CREATE INDEX IF NOT EXISTS idx_agents_port ON agents(port)",
  "ALTER TABLE task_runs ADD COLUMN agent_id TEXT",
  "ALTER TABLE task_runs ADD COLUMN finished_at INTEGER",
  "ALTER TABLE task_runs ADD COLUMN error TEXT",
]
for (const sql of migrations) {
  try { db.exec(sql) } catch { /* column/index already exists, ignore */ }
}

export function purgeOldEvents() {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  db.exec(`DELETE FROM events WHERE ts < ${sevenDaysAgo}`)
}

// Auto-purge events older than 7 days every hour
setInterval(purgeOldEvents, 60 * 60 * 1000)
