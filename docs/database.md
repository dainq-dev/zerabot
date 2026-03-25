# ZeraBot — Database Schema

SQLite tại `~/.zerabot/bridge.db` (configurable via `API_BRIDGE_DB_PATH`).

Schema định nghĩa trong `apps/api-bridge/src/db/schema.ts`.
CRUD queries trong `apps/api-bridge/src/db/queries.ts`.

## Tables

### `agents`
```sql
id              TEXT PRIMARY KEY    -- kebab-case slug
name            TEXT NOT NULL
emoji           TEXT DEFAULT '🤖'
model           TEXT NOT NULL       -- "claude-opus-4-6", "gpt-4o", etc.
soul            TEXT                -- personality description
mission         TEXT                -- high-level goal
instructions    TEXT                -- system prompt
tools_profile   TEXT DEFAULT 'standard'
tools_allow     TEXT                -- JSON array (custom profile only)
tools_deny      TEXT                -- JSON array (custom profile only)
allow_agents    TEXT                -- JSON array of agent IDs
mcp_servers     TEXT                -- JSON array of mcp server IDs
max_ram_mb      INTEGER DEFAULT 512
max_tokens_per_hour  INTEGER DEFAULT 100000
max_concurrent_tasks INTEGER DEFAULT 1
enabled         INTEGER DEFAULT 1   -- boolean
port            INTEGER             -- legacy, not used
created_at      TEXT DEFAULT (datetime('now'))
updated_at      TEXT DEFAULT (datetime('now'))
```

### `cron_jobs`
```sql
id              TEXT PRIMARY KEY    -- "cron-{timestamp}"
name            TEXT NOT NULL
schedule        TEXT NOT NULL       -- 5-field: "0 9 * * *"
agent_id        TEXT REFERENCES agents(id)
task            TEXT NOT NULL       -- prompt to dispatch
notify_channel  TEXT
enabled         INTEGER DEFAULT 1
status          TEXT DEFAULT 'idle' -- idle | running | paused
last_run_at     TEXT
last_run_status TEXT                -- success | failed | running
next_run_at     TEXT
created_at      TEXT
updated_at      TEXT
```

### `cron_runs`
```sql
id              TEXT PRIMARY KEY
job_id          TEXT REFERENCES cron_jobs(id)
job_name        TEXT
agent_id        TEXT
started_at      TEXT
finished_at     TEXT
status          TEXT                -- success | failed | running
output          TEXT
token_used      INTEGER DEFAULT 0
error           TEXT
duration_ms     INTEGER
```

### `pipelines`
```sql
id              TEXT PRIMARY KEY    -- "pipeline-{timestamp}-{random}"
name            TEXT NOT NULL
description     TEXT
nodes           TEXT                -- JSON: FlowNode[]
edges           TEXT                -- JSON: FlowEdge[]
trigger_type    TEXT                -- manual | cron | event
trigger_val     TEXT
status          TEXT DEFAULT 'draft' -- draft | active | running | paused | error
enabled         INTEGER DEFAULT 1
last_run_at     TEXT
run_count       INTEGER DEFAULT 0
created_at      TEXT
updated_at      TEXT
```

### `channels`
```sql
id              TEXT PRIMARY KEY    -- telegram | discord | slack | mattermost | webhook | email
name            TEXT NOT NULL
config          TEXT                -- JSON: ChannelConfig (platform-specific)
routing         TEXT                -- JSON: RoutingRule[]
enabled         INTEGER DEFAULT 0
last_tested_at  TEXT
updated_at      TEXT
```

### `mcp_servers`
```sql
id              TEXT PRIMARY KEY
name            TEXT NOT NULL
description     TEXT
transport       TEXT NOT NULL       -- stdio | ws | http
config          TEXT                -- JSON: {command, args, env, url, ...}
assigned_agents TEXT                -- JSON array of agent IDs
auto_connect    INTEGER DEFAULT 0
reconnect_ms    INTEGER DEFAULT 5000
created_at      TEXT
updated_at      TEXT
```

### `events`
```sql
id              TEXT PRIMARY KEY    -- crypto.randomUUID()
ts              TEXT NOT NULL       -- ISO timestamp (indexed DESC)
agent_id        TEXT
pipeline_id     TEXT
type            TEXT NOT NULL       -- EventType enum
severity        TEXT DEFAULT 'info' -- info | warning | error
payload         TEXT                -- JSON
token_used      INTEGER DEFAULT 0

-- Index: CREATE INDEX idx_events_ts ON events(ts DESC)
-- Retention: 7 days (cleanup job)
```

### `token_usage`
```sql
hour            TEXT                -- "YYYY-MM-DDTHH:00:00Z"
agent_id        TEXT REFERENCES agents(id)
model           TEXT
input_tokens    INTEGER DEFAULT 0
output_tokens   INTEGER DEFAULT 0
total_tokens    INTEGER DEFAULT 0
estimated_cost_usd REAL DEFAULT 0

PRIMARY KEY (hour, agent_id, model)
```

### `task_runs`
```sql
id              TEXT PRIMARY KEY
target_type     TEXT                -- agent | pipeline
target_id       TEXT
target_name     TEXT
agent_id        TEXT
prompt          TEXT
status          TEXT DEFAULT 'pending' -- pending | running | completed | failed
started_at      TEXT
token_used      INTEGER DEFAULT 0
```

## Queries Pattern

```typescript
// Import
import { db } from '../db'
import * as q from '../db/queries'

// Example usage
const agents = q.listAgents(db)
const agent = q.getAgent(db, id)
const created = q.createAgent(db, data)
q.updateAgent(db, id, patch)
q.deleteAgent(db, id)
```

## Model Pricing (cho cost estimation)

Định nghĩa trong `packages/shared/src/types/metrics.ts` (`MODEL_PRICING`):
```typescript
// per 1M tokens {input, output}
"claude-opus-4-6":    { input: 15,    output: 75    }
"claude-sonnet-4-6":  { input: 3,     output: 15    }
"claude-haiku-4-5":   { input: 0.25,  output: 1.25  }
"gpt-4o":             { input: 5,     output: 15    }
"gpt-4o-mini":        { input: 0.15,  output: 0.6   }
```
