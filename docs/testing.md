# ZeraBot — Testing Guide

## Test Stack
- **Playwright** với BDD pattern
- Integration tests: test thực tế API server tại `http://localhost:3001`
- UI tests: test frontend tại `http://localhost:3000`

## Chạy Tests

```bash
# Integration tests (chạy với api-bridge đang running)
bun run test:integration

# UI tests (chạy với cả hai services)
bun run test:e2e

# Tất cả
bun run test:all

# Xem HTML report
bun run test:report
```

## Playwright Config (`e2e/playwright.config.ts`)

Hai projects:
- **integration**: `http://localhost:3001`, 1 worker, sequential
- **ui**: `http://localhost:3000`, UI-focused

CI: 4 workers, 2 retries. Local: no retries.
Output: HTML report + JUnit XML (`e2e/results/`)

## Integration Test Files

| File | Mục đích |
|---|---|
| `20-openclaw-config.spec.ts` | Config generation, tool profiles |
| `21-openclaw-client.spec.ts` | Gateway health, status, config RPC |
| `22-gateway-lifecycle.spec.ts` | CRUD agents + gateway start/stop |
| `23-openclaw-ingestion.spec.ts` | Event ingestion + WS broadcast |
| `24-api-roundtrip.spec.ts` | Full CRUD cho agents, cron, mcp, channels |
| `25-multi-agent-data-analyst.spec.ts` | 4-agent scenario (manager, researcher, cleaner, entry) |

Test files tiếp theo bắt đầu từ `26-`.

## Test Helpers (`e2e/integration/helpers/`)

### `api-client.ts`
Real HTTP fetch wrapper:
```typescript
const client = new ApiClient('http://localhost:3001')
const agents = await client.get('/api/agents')
const agent = await client.post('/api/agents', { name: 'Test', ... })
```

### `setup.ts`
- `beforeAll`: verify API server is running
- Cleanup utilities

### `wait-utils.ts`
Polling helpers:
```typescript
await waitFor(() => someCondition(), { timeout: 5000, interval: 200 })
await waitForEvent(collector, 'agent.status', 10000)
```

### `ws-collector.ts`
WebSocket event collector:
```typescript
const collector = new WsCollector('ws://localhost:3001/api/events/ws')
await collector.connect()
const events = collector.getEvents('agent.status')
collector.disconnect()
```

## Fixtures (`e2e/fixtures/`)

Reusable test data:
- `agents.ts` — Agent fixtures
- `channels.ts` — Channel configs
- `cron.ts` — Cron job fixtures
- `events.ts` — Event fixtures
- `mcp.ts` — MCP server fixtures
- `metrics.ts` — Token usage data
- `pipelines.ts` — Pipeline fixtures

## BDD Pattern

```typescript
import { test, expect } from '@playwright/test'
import { ApiClient } from '../helpers/api-client'

test.describe('Agent CRUD', () => {
  let client: ApiClient
  let createdId: string

  test.beforeAll(async () => {
    client = new ApiClient()
  })

  test.afterAll(async () => {
    // Cleanup: xóa data đã tạo
    if (createdId) await client.delete(`/api/agents/${createdId}`)
  })

  test('create agent', async () => {
    const res = await client.post('/api/agents', agentFixture)
    expect(res.agent.id).toBeDefined()
    createdId = res.agent.id
  })

  test('get agent by id', async () => {
    const res = await client.get(`/api/agents/${createdId}`)
    expect(res.agent.name).toBe(agentFixture.name)
  })
})
```

## Conventions
- Vietnamese comments trong tests là OK
- Cleanup trong `test.afterAll()` — bắt buộc
- Assertions dùng `expect()` từ Playwright
- Không mock API trong integration tests — gọi real server
