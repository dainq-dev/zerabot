import type { Pipeline } from '@zerobot/shared'

export const MOCK_PIPELINES: Pipeline[] = [
  {
    id: 'pipe-1',
    name: 'Nightly Summary',
    description: 'Run every night at midnight',
    nodes: [],
    edges: [],
    trigger: { type: 'cron', schedule: '0 0 * * *' },
    status: 'active',
    enabled: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    runCount: 14,
    lastRunAt: Date.now() - 86400000,
  },
  {
    id: 'pipe-2',
    name: 'On-demand Report',
    description: 'Triggered manually',
    nodes: [],
    edges: [],
    trigger: { type: 'manual' },
    status: 'active',
    enabled: true,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    runCount: 3,
  },
  {
    id: 'pipe-3',
    name: 'WIP Pipeline',
    description: 'Work in progress',
    nodes: [],
    edges: [],
    trigger: { type: 'manual' },
    status: 'draft',
    enabled: false,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    runCount: 0,
  },
]

export const MOCK_PIPELINE_WITH_NODES: Pipeline = {
  id: 'pipe-with-nodes',
  name: 'Test Pipeline',
  description: 'Pipeline with pre-built nodes for editor tests',
  nodes: [
    {
      id: 'n1',
      type: 'trigger',
      position: { x: 100, y: 100 },
      data: { triggerType: 'manual', label: 'Start' },
    },
    {
      id: 'n2',
      type: 'agent',
      position: { x: 350, y: 100 },
      data: { agentId: 'agent-alpha', agentName: 'Alpha', taskPrompt: 'Do the task' },
    },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', type: 'sequential' },
  ],
  trigger: { type: 'manual' },
  status: 'active',
  enabled: true,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
}
