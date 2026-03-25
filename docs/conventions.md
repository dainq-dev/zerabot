# ZeraBot — Coding Conventions

## Naming

| Đối tượng | Convention | Ví dụ |
|---|---|---|
| Files (components) | kebab-case | `agent-form.tsx`, `cron-runs-dialog.tsx` |
| Files (services) | kebab-case | `process-manager.ts`, `gateway-auth.ts` |
| DB columns | snake_case | `agent_id`, `created_at`, `tools_profile` |
| TypeScript props | camelCase | `agentId`, `createdAt`, `toolsProfile` |
| Agent IDs | kebab-case | `data-analyst`, `code-reviewer` |
| Cron IDs | timestamp | `cron-1706000000000` |
| Pipeline IDs | timestamp+random | `pipeline-1706000000000-abc123` |
| Service functions | verb+noun | `sendTaskViaRpc`, `discoverTools`, `broadcastEvent` |
| Test files | number+feature | `24-api-roundtrip.spec.ts` |

## Error Handling

```typescript
// Route handlers: JSON error responses
return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })

// Validation: Zod schemas
const schema = z.object({ name: z.string().min(1), ... })
const parsed = schema.safeParse(body)
if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error }), { status: 400 })

// Services: throw errors, routes catch them
try {
  const result = await sendTaskViaRpc(agentId, prompt, runId)
  return new Response(JSON.stringify({ ok: true, runId }))
} catch (err) {
  logger.error('Task dispatch failed', { err })
  return new Response(JSON.stringify({ error: 'Dispatch failed' }), { status: 500 })
}
```

## Logging

```typescript
import { createLogger } from '../utils/logger'
const logger = createLogger('service-name')

logger.info('message', { key: value })    // [timestamp] [INFO] [service-name] message
logger.warn('message', { context })
logger.error('failed', { err })
```

Log suppression trong `index.ts`: polling endpoints `/api/health`, `/api/events` không log mỗi request.

## Frontend Patterns

### API calls
```typescript
// lib/api.ts pattern
export const agentsApi = {
  list: () => fetch(`${API_URL}/api/agents`).then(r => r.json()),
  get: (id: string) => fetch(`${API_URL}/api/agents/${id}`).then(r => r.json()),
  create: (data: Partial<Agent>) => fetch(`${API_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(r => r.json()),
}
```

### Component với shadcn (@base-ui/react)
```tsx
// ĐÚNG: không dùng asChild
<DropdownMenuTrigger className="cursor-pointer">
  <Button variant="ghost">Options</Button>
</DropdownMenuTrigger>

// SAI: asChild không tồn tại trong @base-ui/react
<DropdownMenuTrigger asChild>  // ❌
```

### Next.js params (15+)
```tsx
// ĐÚNG: params là Promise
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  ...
}

// SAI: params không phải object trực tiếp
export default function Page({ params }: { params: { id: string } }) {  // ❌
  const { id } = params  // ❌
```

### WebSocket hook
```typescript
// hooks/use-event-stream.ts
const { events, connected } = useEventStream({
  onEvent: (event: ZerabotEvent) => { ... },
  filter: (e) => e.agentId === targetId,  // optional
})
```

## Backend Patterns

### Route handler structure
```typescript
// routes/resource.ts
import { db } from '../db'
import * as q from '../db/queries'
import { createLogger } from '../utils/logger'
import { z } from 'zod'

const logger = createLogger('routes/resource')

export function handleResource(req: Request): Response | Promise<Response> {
  const url = new URL(req.url)

  if (req.method === 'GET' && url.pathname === '/api/resource') {
    const items = q.listItems(db)
    return new Response(JSON.stringify({ items }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // ...
}
```

### Register route trong index.ts
```typescript
// apps/api-bridge/src/index.ts
import { handleResource } from './routes/resource'

// Trong router:
if (path.startsWith('/api/resource')) {
  return handleResource(req)
}
```

### Shared types
```typescript
// Import từ @zerobot/shared, KHÔNG define lại
import type { Agent, AgentStatus, ZerabotEvent } from '@zerobot/shared'
```

## Database Query Pattern

```typescript
// db/queries.ts
export function listAgents(db: Database): Agent[] {
  return db.query('SELECT * FROM agents ORDER BY created_at DESC').all() as Agent[]
}

export function createAgent(db: Database, data: Partial<Agent>): Agent {
  const id = data.id ?? data.name!.toLowerCase().replace(/\s+/g, '-')
  db.run(
    `INSERT INTO agents (id, name, ...) VALUES (?, ?, ...)`,
    [id, data.name, ...]
  )
  return getAgent(db, id)!
}
```

## OpenClaw Integration Rules

1. **Không dùng `execSync`** — tất cả OpenClaw calls async
2. **Single WS connection** — `openclaw-ingestion.ts` quản lý 1 WS duy nhất, không mở thêm
3. **Config patch** — khi update agent, patch `openclaw.json` + trigger hot-reload
4. **Task dispatch** — luôn dùng `sendTaskViaRpc()` từ `gateway-auth.ts`

## Dependency Notes

- `@zerobot/shared` — shared types, import bình thường trong cả 2 apps
- `zod` — validation (api-bridge only)
- `@xyflow/react` — flow builder (web-control only)
- `echarts-for-react` — charts in reports page
- `xterm` — terminal component
- `react-query` / `@tanstack/react-query` — data fetching (web-control)
