/**
 * BDD Tests: Người dùng tạo pipeline crawl dữ liệu và chạy thủ công (Spec 27)
 *
 * User story: Với tư cách là người dùng, tôi muốn tạo pipeline tự động crawl dữ liệu,
 * chạy thử thủ công, xem lịch sử chạy, và quản lý vòng đời pipeline.
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'
import type { Pipeline, Agent } from '@zerobot/shared'

const PIPELINE_AGENT_ID = 'spec27-pipeline-agent'
let pipelineId: string
let pipelineWithNodeId: string

test.describe('Người dùng tạo pipeline crawl dữ liệu và vận hành', () => {
  test.beforeAll(async () => {
    // Tạo sẵn agent để pipeline dùng
    await api.post('/api/agents', {
      id: PIPELINE_AGENT_ID,
      name: 'Pipeline Test Agent',
      emoji: '🤖',
      model: 'anthropic/claude-haiku-4-5',
      toolsProfile: 'minimal',
      allowAgents: [],
      limits: { maxRamMb: 50, maxTokensPerHour: 1000, maxConcurrentTasks: 1 },
    }).catch(() => {}) // Ignore nếu đã tồn tại
  })

  test.afterAll(async () => {
    // Dọn dẹp pipelines
    if (pipelineId) await api.delete(`/api/pipelines/${pipelineId}`).catch(() => {})
    if (pipelineWithNodeId) await api.delete(`/api/pipelines/${pipelineWithNodeId}`).catch(() => {})

    // Dọn agent
    await api.post(`/api/agents/${PIPELINE_AGENT_ID}/stop`).catch(() => {})
    await api.delete(`/api/agents/${PIPELINE_AGENT_ID}`).catch(() => {})
  })

  // ── Bước 1: Người dùng xem danh sách pipelines hiện tại ──

  test('người dùng xem danh sách pipelines', async () => {
    const { pipelines } = await api.get<{ pipelines: Pipeline[] }>('/api/pipelines')
    expect(Array.isArray(pipelines)).toBe(true)
  })

  // ── Bước 2: Người dùng tạo pipeline đơn giản ──

  test('người dùng tạo pipeline gold price tracking', async () => {
    const { pipeline } = await api.post<{ pipeline: Pipeline }>('/api/pipelines', {
      name: 'Gold Price Tracking Pipeline',
      description: 'Tự động lấy giá vàng hàng ngày',
      nodes: [],
      edges: [],
      trigger: { type: 'cron', schedule: '0 8 * * *' },
      enabled: true,
    })

    expect(pipeline.id).toBeDefined()
    expect(pipeline.name).toBe('Gold Price Tracking Pipeline')
    expect(pipeline.status).toBe('draft')
    expect(pipeline.enabled).toBe(true)

    pipelineId = pipeline.id
  })

  // ── Bước 3: Người dùng cập nhật pipeline ──

  test('người dùng cập nhật description của pipeline', async () => {
    const { pipeline } = await api.patch<{ pipeline: Pipeline }>(`/api/pipelines/${pipelineId}`, {
      description: 'Cập nhật: lấy giá vàng + tỷ giá mỗi sáng 8h',
    })

    expect(pipeline.description).toBe('Cập nhật: lấy giá vàng + tỷ giá mỗi sáng 8h')
  })

  // ── Bước 4: Người dùng tạo pipeline có agent node để trigger ──

  test('người dùng tạo pipeline có agent node', async () => {
    const { pipeline } = await api.post<{ pipeline: Pipeline }>('/api/pipelines', {
      name: 'Pipeline With Agent Node',
      description: 'Pipeline để test trigger',
      nodes: [
        {
          id: 'n1',
          type: 'trigger',
          position: { x: 100, y: 100 },
          data: { triggerType: 'manual', label: 'Bắt đầu' },
        },
        {
          id: 'n2',
          type: 'agent',
          position: { x: 350, y: 100 },
          data: { agentId: PIPELINE_AGENT_ID, agentName: 'Pipeline Test Agent', taskPrompt: 'Lấy giá vàng hôm nay' },
        },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', type: 'sequential' }],
      trigger: { type: 'manual' },
      enabled: true,
    })

    expect(pipeline.id).toBeDefined()
    expect(pipeline.nodes.length).toBe(2)

    pipelineWithNodeId = pipeline.id
  })

  // ── Bước 5: Người dùng trigger pipeline thủ công ──

  test('người dùng chạy pipeline thủ công → nhận runId', async () => {
    const result = await api.post<{ ok: boolean; runId: string }>(
      `/api/pipelines/${pipelineWithNodeId}/run`,
    )

    expect(result.ok).toBe(true)
    expect(result.runId).toBeDefined()
  })

  // ── Bước 6: Người dùng xem lịch sử runs ──

  test('người dùng xem lịch sử runs của pipeline', async () => {
    const { runs } = await api.get<{ runs: unknown[] }>(
      `/api/pipelines/${pipelineWithNodeId}/runs`,
    )

    expect(Array.isArray(runs)).toBe(true)
  })

  // ── Bước 7: Người dùng disable pipeline không dùng nữa ──

  test('người dùng disable pipeline, trigger tiếp → 422', async () => {
    await api.patch(`/api/pipelines/${pipelineWithNodeId}`, { enabled: false })

    await expect(
      api.post(`/api/pipelines/${pipelineWithNodeId}/run`),
    ).rejects.toThrow('422')
  })

  // ── Bước 8: Người dùng cancel pipeline đang chạy ──

  test('người dùng cancel pipeline → status = paused', async () => {
    // Re-enable trước
    await api.patch(`/api/pipelines/${pipelineWithNodeId}`, { enabled: true })

    // Cancel
    const result = await api.post<{ ok: boolean }>(`/api/pipelines/${pipelineWithNodeId}/cancel`)
    expect(result.ok).toBe(true)

    // Kiểm tra status
    const { pipelines } = await api.get<{ pipelines: Pipeline[] }>('/api/pipelines')
    const pipeline = pipelines.find(p => p.id === pipelineWithNodeId)
    expect(pipeline?.status).toBe('paused')
  })

  // ── Bước 9: Người dùng xóa pipeline ──

  test('người dùng xóa pipeline → không còn trong danh sách', async () => {
    await api.delete(`/api/pipelines/${pipelineId}`)

    const { pipelines } = await api.get<{ pipelines: Pipeline[] }>('/api/pipelines')
    const found = pipelines.find(p => p.id === pipelineId)
    expect(found).toBeUndefined()

    pipelineId = '' // Đã xóa, không cần cleanup nữa
  })
})
