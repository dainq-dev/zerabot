export const SCHEMA_SQL = `
-- Agents metadata (mirror of ZeroClaw config)
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  model TEXT NOT NULL,
  soul TEXT,
  mission TEXT,
  instructions TEXT,
  tools_profile TEXT DEFAULT 'minimal',
  tools_allow TEXT DEFAULT '[]',
  tools_deny TEXT DEFAULT '[]',
  allow_agents TEXT DEFAULT '[]',
  mcp_servers TEXT DEFAULT '[]',
  max_ram_mb INTEGER DEFAULT 50,
  max_tokens_per_hour INTEGER DEFAULT 3000,
  max_concurrent_tasks INTEGER DEFAULT 2,
  enabled INTEGER DEFAULT 1,
  port INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- MCP Servers registry
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  transport TEXT NOT NULL,
  config TEXT NOT NULL,
  assigned_agents TEXT DEFAULT '[]',
  auto_connect INTEGER DEFAULT 1,
  reconnect_ms INTEGER DEFAULT 3000,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Pipelines (Flow builder)
CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  nodes TEXT NOT NULL DEFAULT '[]',
  edges TEXT NOT NULL DEFAULT '[]',
  trigger_type TEXT DEFAULT 'manual',
  trigger_val TEXT,
  status TEXT DEFAULT 'draft',
  enabled INTEGER DEFAULT 1,
  last_run_at INTEGER,
  run_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Channels config
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  routing TEXT DEFAULT '[]',
  enabled INTEGER DEFAULT 1,
  last_tested_at INTEGER,
  updated_at INTEGER NOT NULL
);

-- Activity events (7 days retention)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  agent_id TEXT,
  pipeline_id TEXT,
  type TEXT NOT NULL,
  severity TEXT DEFAULT 'info',
  payload TEXT NOT NULL DEFAULT '{}',
  token_used INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_agent_ts ON events(agent_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, ts DESC);

-- Cron jobs
CREATE TABLE IF NOT EXISTS cron_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  schedule TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task TEXT NOT NULL,
  notify_channel TEXT,
  enabled INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  last_run_at INTEGER,
  last_run_status TEXT,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Cron run history
CREATE TABLE IF NOT EXISTS cron_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  job_name TEXT NOT NULL,
  agent_id TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  output TEXT,
  token_used INTEGER DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_job ON cron_runs(job_id, started_at DESC);

-- Token usage aggregated (hourly)
CREATE TABLE IF NOT EXISTS token_usage (
  hour INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  PRIMARY KEY (hour, agent_id, model)
);

-- Terminal sessions
CREATE TABLE IF NOT EXISTS terminal_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  messages TEXT DEFAULT '[]'
);

-- Instant task runs (one-shot commands dispatched to an agent or pipeline)
CREATE TABLE IF NOT EXISTS task_runs (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_name TEXT,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'dispatched',
  started_at INTEGER NOT NULL,
  token_used INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_task_runs_started ON task_runs(started_at DESC);

-- Pipeline run history
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  trigger_type TEXT DEFAULT 'manual',
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  vars TEXT DEFAULT '{}',
  node_results TEXT DEFAULT '{}',
  error TEXT,
  FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline ON pipeline_runs(pipeline_id, started_at DESC);

-- Crawled data items (ingested by agents after crawl tasks)
CREATE TABLE IF NOT EXISTS crawled_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  category TEXT,
  url TEXT,
  title TEXT,
  content TEXT,
  structured_data TEXT,
  agent_id TEXT,
  pipeline_run_id TEXT,
  crawled_at INTEGER NOT NULL,
  published_at INTEGER,
  tags TEXT DEFAULT '[]',
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_crawled_source_time   ON crawled_items(source, crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawled_category_time ON crawled_items(category, crawled_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crawled_url    ON crawled_items(url) WHERE url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crawled_pipeline_run  ON crawled_items(pipeline_run_id) WHERE pipeline_run_id IS NOT NULL;
`
