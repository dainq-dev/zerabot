import type { ZerabotEvent } from '@zerobot/shared'

export const MOCK_TOOL_CALL_EVENT: ZerabotEvent = {
  id: 'evt-1',
  ts: Date.now() - 5000,
  agentId: 'agent-alpha',
  type: 'tool.call',
  severity: 'info',
  payload: { tool: 'web_search', input: 'latest AI news', latencyMs: 450 },
  tokenUsed: 0,
}

export const MOCK_TOOL_RESULT_EVENT: ZerabotEvent = {
  id: 'evt-2',
  ts: Date.now() - 4500,
  agentId: 'agent-alpha',
  type: 'tool.result',
  severity: 'info',
  payload: { tool: 'web_search', output: '10 results found', latencyMs: 450 },
  tokenUsed: 0,
}

export const MOCK_AGENT_STATUS_EVENT: ZerabotEvent = {
  id: 'evt-3',
  ts: Date.now() - 10000,
  agentId: 'agent-alpha',
  type: 'agent.status',
  severity: 'info',
  payload: { agentId: 'agent-alpha', from: 'stopped', to: 'running' },
  tokenUsed: 0,
}

export const MOCK_AGENT_ERROR_EVENT: ZerabotEvent = {
  id: 'evt-4',
  ts: Date.now() - 3000,
  agentId: 'agent-beta',
  type: 'agent.error',
  severity: 'error',
  payload: { agentId: 'agent-beta', message: 'Rate limit exceeded', code: 429 },
  tokenUsed: 0,
}

export const MOCK_SYSTEM_ERROR_EVENT: ZerabotEvent = {
  id: 'evt-5',
  ts: Date.now() - 1000,
  type: 'system.error',
  severity: 'error',
  payload: { message: 'Connection timeout to ZeroClaw' },
  tokenUsed: 0,
}

export const MOCK_SESSION_MESSAGE_EVENT: ZerabotEvent = {
  id: 'evt-6',
  ts: Date.now() - 2000,
  agentId: 'agent-alpha',
  type: 'session.message',
  severity: 'info',
  payload: { role: 'assistant', content: 'I found 10 results.', tokenCount: 12 },
  tokenUsed: 12,
}

export const MOCK_CRON_FIRED_EVENT: ZerabotEvent = {
  id: 'evt-7',
  ts: Date.now() - 60000,
  agentId: 'agent-alpha',
  type: 'cron.fired',
  severity: 'info',
  payload: { jobId: 'cron-1', jobName: 'Nightly Report', runId: 'run-1', schedule: '0 0 * * *' },
  tokenUsed: 0,
}

export const MOCK_MCP_CALL_EVENT: ZerabotEvent = {
  id: 'evt-8',
  ts: Date.now() - 8000,
  agentId: 'agent-alpha',
  type: 'mcp.call',
  severity: 'info',
  payload: { serverId: 'mcp-git', tool: 'git_status', input: {}, latencyMs: 120 },
  tokenUsed: 0,
}

// Convenience groupings for tests
export const ALL_MOCK_EVENTS: ZerabotEvent[] = [
  MOCK_TOOL_CALL_EVENT,
  MOCK_AGENT_STATUS_EVENT,
  MOCK_SYSTEM_ERROR_EVENT,
]

export const MIXED_EVENTS: ZerabotEvent[] = [
  MOCK_TOOL_CALL_EVENT,
  MOCK_AGENT_STATUS_EVENT,
  MOCK_SYSTEM_ERROR_EVENT,
  MOCK_MCP_CALL_EVENT,
  MOCK_SESSION_MESSAGE_EVENT,
]
