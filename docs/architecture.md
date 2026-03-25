# ZeraBot — Architecture

## System Overview

```
Browser (port 3000)
      │ HTTP (REST)
      │ WebSocket /api/events/ws
      ▼
┌─────────────────────────────────────────────────────┐
│              api-bridge (Bun, port 3001)            │
│                                                     │
│  Routes ──► Services ──► OpenClaw client            │
│    │            │              │                    │
│    ▼            ▼              ▼                    │
│  SQLite    ws-hub.ts     openclaw/                  │
│  ~/.zerabot/bridge.db    client.ts                  │
│                          config.ts                  │
│                          mcp-probe.ts               │
└─────────────────────────┬───────────────────────────┘
                          │ HTTP RPC + WebSocket
                          ▼
              OpenClaw Gateway (port 18789)
              ~/.openclaw/openclaw.json
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
           Agent A     Agent B     Agent C
        (AI process) (AI process) (AI process)
```

## Services

### `openclaw-ingestion.ts`
- Mở 1 WebSocket duy nhất đến OpenClaw gateway
- Nhận tất cả events từ tất cả agents
- Normalize → `ZerabotEvent` format
- Lưu vào SQLite + broadcast qua `ws-hub`
- O(1) event type lookup via Map

### `process-manager.ts`
- Quản lý vòng đời gateway (start/stop)
- Hot-reload agent config: patch `openclaw.json` → gateway tự reload
- Track `activeAgents` Set

### `gateway-auth.ts`
- JWT token generation/validation cho gateway
- `sendTaskViaRpc(agentId, prompt, runId)` — async HTTP POST /rpc `tasks/send`
- Không blocking, không execSync

### `agent-executor.ts`
- Workaround cho OpenClaw v0.1.0 giới hạn
- Gọi AI providers trực tiếp (Anthropic, OpenAI, OpenRouter, Google)
- Dùng khi gateway chưa hỗ trợ full task routing

### `cron-scheduler.ts`
- Poll mỗi 30s, evaluate 5-field cron expressions
- Dispatch matching jobs qua `sendTaskViaRpc` (async)
- Update `last_run_at`, `next_run_at` trong DB

### `agent-sync.ts`
- Khi agent CRUD → cập nhật workspace files
- Sync từ SQLite → `openclaw.json` format

### `terminal.ts`
- WebSocket relay: `/api/terminal/{agentId}/ws`
- Pipe stdin/stdout của agent shell process
- Dùng với xterm.js frontend

### `ws-hub.ts`
- In-memory Set của tất cả frontend WS connections
- `broadcast(event)` gửi đến tất cả clients

## OpenClaw Module (`openclaw/`)

### `client.ts`
```typescript
// Health check
GET  http://localhost:18789/health

// Status query
GET  http://localhost:18789/status

// Config RPC
POST http://localhost:18789/rpc {method, params}
```

### `config.ts`
- Read/write `~/.openclaw/openclaw.json`
- `TOOL_PROFILE_MAP`: minimal → full profiles
- Hot-reload triggered khi config thay đổi

### `mcp-probe.ts`
- JSON-RPC stdio để discover MCP tools
- Spawn MCP server process → send `tools/list` → collect response → kill

## Data Flow: Task Execution

```
POST /api/tasks
  └── routes/tasks.ts
      └── sendTaskViaRpc(agentId, prompt, runId)
          └── gateway-auth.ts
              └── POST http://18789/rpc tasks/send
                  └── OpenClaw dispatches to agent
                      └── Events → WS → openclaw-ingestion.ts
                          └── normalize → SQLite + ws-hub broadcast
                              └── Frontend /api/events/ws
```

## Data Flow: Agent Config

```
POST/PATCH /api/agents
  └── routes/agents.ts → db/queries.ts (SQLite)
      └── agent-sync.ts
          └── openclaw/config.ts
              └── Write openclaw.json
                  └── process-manager hot-reload
```

## WebSocket Connections

| Endpoint | Direction | Purpose |
|---|---|---|
| `/api/events/ws` | Server → Client | Stream ZerabotEvents |
| `/api/terminal/{id}/ws` | Bidirectional | Agent shell relay |
| `ws://18789/events` | OpenClaw → Bridge | Raw agent events |

## Database Location
- `~/.zerabot/bridge.db` (configurable via `API_BRIDGE_DB_PATH`)
- Events: 7-day auto-retention
- Token usage: hourly aggregation

## Environment
```bash
OPENCLAW_HOME=~/.openclaw
OPENCLAW_PORT=18789
ANTHROPIC_API_KEY=sk-ant-...
API_BRIDGE_PORT=3001
API_BRIDGE_DB_PATH=~/.zerabot/bridge.db
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```
