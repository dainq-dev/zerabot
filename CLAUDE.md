# ZeraBot — Claude Context Guide

ZeraBot là nền tảng điều khiển AI agent (multi-agent orchestration) built trên OpenClaw gateway.
Monorepo Bun workspaces: **api-bridge** (Bun, port 3001) + **web-control** (Next.js 16, port 3000) + **shared types**.

> Đọc file này để nắm core, navigate đến `docs/` khi cần chi tiết cụ thể.

## Quick Reference

| Tài liệu | Nội dung |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Sơ đồ hệ thống, data flow, services, OpenClaw integration |
| [docs/api.md](docs/api.md) | Tất cả REST endpoints + WebSocket routes |
| [docs/database.md](docs/database.md) | SQLite schema, tất cả tables + columns |
| [docs/testing.md](docs/testing.md) | Test strategy, cách chạy tests, fixtures |
| [docs/conventions.md](docs/conventions.md) | Coding patterns, naming, error handling |

---

## Monorepo Structure

```
zerobot-chan/
├── apps/api-bridge/src/
│   ├── index.ts              # Bun HTTP entry (REST + WS)
│   ├── db/                   # SQLite: schema, queries
│   ├── routes/               # REST handlers (agents, cron, events, mcp, channels, pipelines, tasks, config)
│   ├── services/             # Business logic (ingestion, process-manager, cron-scheduler, terminal, ws-hub)
│   ├── openclaw/             # OpenClaw client, config writer, mcp-probe
│   └── utils/logger.ts
├── apps/web-control/src/
│   ├── app/(dashboard)/      # 11 pages (agents, tasks, monitor, cron, flow, channels, mcp, reports, terminal, config)
│   ├── components/           # agent/, cron/, flow/, monitor/, terminal/, shared/, ui/
│   ├── hooks/                # use-event-stream, use-mobile
│   └── lib/api.ts            # Typed fetch wrappers cho tất cả API
├── packages/shared/src/types/ # Agent, Event, Flow, Channel, CronJob, McpServerConfig, Metrics
└── e2e/integration/          # Playwright BDD tests (20-25 spec files)
```

---

## Critical Tech Notes (MUST READ)

### Frontend
- Shadcn dùng `@base-ui/react` **KHÔNG phải radix-ui** — `asChild` prop **KHÔNG tồn tại**
- `DropdownMenuTrigger`: render children inline với className, không dùng `asChild`
- Next.js 15+: `params` và `searchParams` là **Promises** trong page/layout — phải `await`
- `transpilePackages: ["@zerobot/shared"]` bắt buộc trong `next.config.ts`
- `Select.onValueChange` nhận `string | null` — phải handle null

### Backend
- **Không dùng `execSync`** — tất cả OpenClaw calls đều async HTTP
- `openclaw/client.ts` — health/status/config-rpc, fully async
- `services/gateway-auth.ts` — JWT login + `sendTaskViaRpc()` cho task dispatch
- `services/cron-scheduler.ts` — dùng `sendTaskViaRpc` (async), không blocking

### Database
- SQLite tại `~/.zerabot/bridge.db`
- Events có **7-day retention**
- IDs: kebab-case agents, `cron-{timestamp}`, `pipeline-{timestamp}-{random}`

---

## OpenClaw Architecture

```
OpenClaw Gateway (port 18789)
       │ WebSocket
       ▼
openclaw-ingestion.ts ──► ws-hub.ts ──► Frontend (WS)
       │                      │
       ▼                      ▼
   SQLite ◄──────── process-manager.ts
```

**Tool Profiles** (khai báo trong `openclaw/config.ts`):
- `minimal` — deny browser+exec
- `standard` — coding + browser/web
- `coding` — coding + fs/runtime/exec, NO browser
- `messaging` — minimal + group:messaging/sessions
- `full` — full + group:automation (Playwright + GCP)
- `custom` — full, toolsAllow/toolsDeny từ agent definition

**Task Dispatch Flow**:
`POST /api/tasks` → `tasks.ts` → `sendTaskViaRpc(agentId, prompt, runId)` → OpenClaw gateway → events via WS

---

## Dev Commands

```bash
# Start full stack
bun run dev          # api-bridge + web-control

# Individual services
bun run dev:api      # api-bridge port 3001
bun run dev:web      # web-control port 3000

# Build
bun run build        # build all workspaces

# Tests
bun run test:integration   # Playwright integration (e2e/integration/)
bun run test:e2e           # Playwright UI tests
bun run test:all           # tất cả tests
bun run test:report        # mở HTML report

# Lint
bun run lint
```

**Makefile shortcuts**: `make dev`, `make build`, `make setup`, `make migrate-db`

**Services**:
- api-bridge: `bun run dev:api` → port 3001
- web-control: `bun run dev:web` → port 3000
- OpenClaw: `openclaw gateway run --force` → port 18789 (OPENCLAW_HOME=~/.openclaw)

---

## Workflows

### Thêm API endpoint mới
1. Thêm SQL query vào `apps/api-bridge/src/db/queries.ts`
2. Tạo/cập nhật route handler trong `apps/api-bridge/src/routes/`
3. Register route trong `apps/api-bridge/src/index.ts`
4. Thêm typed fetch wrapper vào `apps/web-control/src/lib/api.ts`
5. Cập nhật type nếu cần trong `packages/shared/src/types/`

### Thêm trang frontend mới
1. Tạo `apps/web-control/src/app/(dashboard)/{page}/page.tsx`
2. Thêm nav item vào `apps/web-control/src/components/shared/app-sidebar.tsx`
3. Tạo components vào `apps/web-control/src/components/{domain}/`

### Thêm agent tool profile mới
1. Cập nhật `TOOL_PROFILE_MAP` trong `apps/api-bridge/src/openclaw/config.ts`
2. Cập nhật type `AgentToolsProfile` trong `packages/shared/src/types/agent.ts`
3. Cập nhật dropdown trong `apps/web-control/src/components/agent/agent-form.tsx`

### Debug event pipeline
1. Kiểm tra OpenClaw gateway đang chạy: `GET /api/health`
2. Xem log của `services/openclaw-ingestion.ts`
3. Monitor WS events tại `/api/events/ws`
4. Kiểm tra DB: `~/.zerabot/bridge.db`

---

## Rules

### Code Style
- **Không import radix-ui** — dùng `@base-ui/react` qua shadcn
- **Không dùng `execSync`** trong services — async only
- Zod schemas cho tất cả request validation
- Logger: `import { createLogger } from '../utils/logger'`
- Shared types: import từ `@zerobot/shared`, không define lại

### Testing
- Integration tests viết theo BDD (`describe/test`, Vietnamese comments ok)
- Cleanup trong `test.afterAll()` — xóa data tạo ra trong test
- Dùng helpers: `api-client.ts`, `wait-utils.ts`, `ws-collector.ts`
- Test files đánh số: `20-`, `21-`, ... (tiếp theo là `26-`)

### Naming
- Route files: kebab-case (`agent-form.tsx`, không phải `AgentForm.tsx`)
- DB columns: snake_case; TypeScript props: camelCase
- Service functions: verb + noun (`sendTaskViaRpc`, `discoverTools`)
- Test files: `{number}-{feature}.spec.ts`

### Security
- API keys chỉ trong `.env`, không commit
- JWT gateway auth qua `gateway-auth.ts`
- Validate tất cả user input với Zod trước khi lưu DB

---

## Current State (Phase Complete)

Tất cả 7 phases đã xong. Công việc tiếp theo:
- Integration testing với real openclaw binary
- Mobile responsive polish
- Các e2e tests mới: `26-` onwards
