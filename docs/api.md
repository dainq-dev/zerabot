# ZeraBot — API Reference

Base URL: `http://localhost:3001`

## Agents `/api/agents`

```
GET    /api/agents                     → { agents: Agent[] }
GET    /api/agents/:id                 → { agent: Agent }
GET    /api/agents/tokens              → dev only: { agents: AgentDevInfo[] }
POST   /api/agents                     → create → { agent: Agent }
POST   /api/agents/:id/start           → start agent
POST   /api/agents/:id/stop            → stop agent
POST   /api/agents/:id/restart         → restart agent
POST   /api/agents/:id/pause           → pause agent
POST   /api/agents/:id/resume          → resume agent
PATCH  /api/agents/:id                 → update → { agent: Agent }
PATCH  /api/agents/:id/limits          → update resource limits
DELETE /api/agents/:id
```

**Agent body** (POST/PATCH):
```typescript
{
  name: string
  emoji?: string
  model: string           // "claude-opus-4-6", "gpt-4o", etc.
  soul?: string           // personality
  mission?: string        // high-level goal
  instructions?: string   // system prompt
  toolsProfile: "minimal" | "standard" | "coding" | "messaging" | "full" | "custom"
  toolsAllow?: string[]   // only for "custom" profile
  toolsDeny?: string[]    // only for "custom" profile
  allowAgents?: string[]  // agent IDs allowed to talk to this agent
  mcpServers?: string[]   // mcp server IDs
}
```

## Cron `/api/cron`

```
GET    /api/cron                       → { jobs: CronJob[] }
GET    /api/cron/:id/runs              → { runs: CronRun[] }
POST   /api/cron                       → create → { job: CronJob }
POST   /api/cron/:id/run               → manual trigger
POST   /api/cron/:id/pause
POST   /api/cron/:id/resume
DELETE /api/cron/:id
```

**CronJob body**:
```typescript
{
  name: string
  schedule: string      // 5-field cron: "0 9 * * *"
  agentId: string
  task: string          // prompt to send
  notifyChannel?: string
}
```

## Events `/api/events`, `/api/metrics`

```
GET    /api/events                     → { events: ZerabotEvent[] }
  Query params: limit, agentId, type, since (ISO timestamp)

GET    /api/metrics/tokens             → { data: TokenUsagePoint[] }
  Query params: agentId, from, to

WebSocket /api/events/ws              → stream ZerabotEvent (JSON)
```

**ZerabotEvent types**: `tool.call`, `tool.result`, `agent.status`, `agent.error`, `session.message`, `cron.fired`, `cron.completed`, `mcp.call`, `mcp.result`, `channel.message`, `channel.sent`, `pipeline.started`, `pipeline.completed`, `pipeline.failed`, `system.info`, `system.warning`, `system.error`

## MCP `/api/mcp`

```
GET    /api/mcp                        → { servers: McpServerConfig[] }
POST   /api/mcp                        → create → { server: McpServerConfig }
PATCH  /api/mcp/:id                    → update → { server: McpServerConfig }
DELETE /api/mcp/:id
POST   /api/mcp/:id/discover           → auto-discover tools → { tools: McpTool[] }
```

**McpServerConfig body**:
```typescript
{
  name: string
  description?: string
  transport: "stdio" | "ws" | "http"
  command?: string        // for stdio
  args?: string[]         // for stdio
  env?: Record<string, string>
  url?: string            // for ws/http
  assignedAgents?: string[]
  autoConnect?: boolean
  reconnectMs?: number
}
```

## Channels `/api/channels`

```
GET    /api/channels                   → { channels: Channel[] }
PATCH  /api/channels/:id               → update config → { channel: Channel }
POST   /api/channels/:id/test          → test connection → { ok: boolean; message: string }
```

Channel IDs: `telegram`, `discord`, `slack`, `mattermost`, `webhook`, `email`

## Pipelines `/api/pipelines`

```
GET    /api/pipelines                  → { pipelines: Pipeline[] }
POST   /api/pipelines                  → create → { pipeline: Pipeline }
PATCH  /api/pipelines/:id              → update → { pipeline: Pipeline }
DELETE /api/pipelines/:id
POST   /api/pipelines/:id/run          → manual trigger
```

**Pipeline body**:
```typescript
{
  name: string
  description?: string
  nodes: FlowNode[]       // @xyflow/react node format
  edges: FlowEdge[]
  triggerType?: "manual" | "cron" | "event"
  triggerVal?: string
}
```

**Node types**: `agent`, `trigger`, `condition`, `channel`, `mcp`, `delay`

## Tasks `/api/tasks`

```
GET    /api/tasks                      → { runs: TaskRun[] }
POST   /api/tasks                      → dispatch → { ok: boolean; runId: string }
DELETE /api/tasks/:id
```

**Task body**:
```typescript
{
  targetType: "agent" | "pipeline"
  targetId: string
  prompt: string
}
```

## Config `/api/config`, `/api/health`

```
GET    /api/config                     → { config: Record<string, unknown> }
PATCH  /api/config                     → update config
GET    /api/health                     → { bridge: "ok"; openclaw: { ok: boolean; version?: string } }
```

## Debug (dev only)

```
POST   /api/debug/exec                 → execute task directly (bypasses gateway)
```

## Terminal WebSocket

```
WebSocket /api/terminal/:agentId/ws   → bidirectional shell relay
  Send: { type: "input"; data: string }
  Receive: { type: "output"; data: string }
```

## WebSocket Message Format

All WS messages follow `WsMessage` type:
```typescript
{
  type: "event" | "ping" | "pong"
  payload?: ZerabotEvent
}
```
