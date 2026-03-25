/**
 * BDD Tests: Người dùng lên lịch tự động cho agent (Spec 28)
 *
 * User story: Với tư cách là người dùng, tôi muốn tạo cron job để agent
 * tự động chạy theo lịch, quản lý trạng thái (pause/resume), và xóa khi không cần.
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'

const CRON_AGENT_ID = 'spec28-cron-agent'
let cronJobId: string

test.describe('Người dùng lên lịch tự động cho agent', () => {
  test.beforeAll(async () => {
    // Tạo sẵn agent để cron dùng
    await api.post('/api/agents', {
      id: CRON_AGENT_ID,
      name: 'Cron Test Agent',
      emoji: '⏰',
      model: 'anthropic/claude-haiku-4-5',
      toolsProfile: 'minimal',
      allowAgents: [],
      limits: { maxRamMb: 50, maxTokensPerHour: 500, maxConcurrentTasks: 1 },
    }).catch(() => {}) // Ignore nếu đã tồn tại
  })

  test.afterAll(async () => {
    if (cronJobId) await api.delete(`/api/cron/${cronJobId}`).catch(() => {})
    await api.post(`/api/agents/${CRON_AGENT_ID}/stop`).catch(() => {})
    await api.delete(`/api/agents/${CRON_AGENT_ID}`).catch(() => {})
  })

  // ── Bước 1: Người dùng xem danh sách cron jobs hiện tại ──

  test('người dùng xem danh sách cron jobs', async () => {
    const { jobs } = await api.get<{ jobs: unknown[] }>('/api/cron')
    expect(Array.isArray(jobs)).toBe(true)
  })

  // ── Bước 2: Người dùng tạo cron job mới ──

  test('người dùng tạo cron job lấy giá vàng mỗi sáng 8h', async () => {
    const { job } = await api.post<{ job: { id: string; name: string; schedule: string; enabled: boolean; status: string } }>(
      '/api/cron',
      {
        name: 'Lấy giá vàng SJC hàng ngày',
        schedule: '0 8 * * *',
        agentId: CRON_AGENT_ID,
        task: 'Lấy và báo cáo giá vàng SJC, PNJ hôm nay',
        enabled: true,
      },
    )

    expect(job.id).toBeDefined()
    expect(job.name).toBe('Lấy giá vàng SJC hàng ngày')
    expect(job.schedule).toBe('0 8 * * *')
    expect(job.status).toBe('active')

    cronJobId = job.id
  })

  // ── Bước 3: Người dùng pause cron job ──

  test('người dùng tạm dừng cron job → trạng thái paused', async () => {
    await api.post(`/api/cron/${cronJobId}/pause`)

    // Kiểm tra status đã thay đổi
    const { jobs } = await api.get<{ jobs: Array<{ id: string; status: string }> }>('/api/cron')
    const job = jobs.find(j => j.id === cronJobId)
    expect(job?.status).toBe('paused')
  })

  // ── Bước 4: Người dùng resume cron job ──

  test('người dùng tiếp tục cron job → trạng thái active trở lại', async () => {
    await api.post(`/api/cron/${cronJobId}/resume`)

    const { jobs } = await api.get<{ jobs: Array<{ id: string; status: string }> }>('/api/cron')
    const job = jobs.find(j => j.id === cronJobId)
    expect(job?.status).toBe('active')
  })

  // ── Bước 5: Người dùng xem lịch sử chạy của cron job ──

  test('người dùng xem lịch sử runs của cron job', async () => {
    const { runs } = await api.get<{ runs: unknown[] }>(`/api/cron/${cronJobId}/runs`)
    // Chưa chạy thật nên có thể là array rỗng, nhưng phải là array
    expect(Array.isArray(runs)).toBe(true)
  })

  // ── Bước 6: Người dùng tạo cron job thiếu trường bắt buộc → lỗi validation ──

  test('người dùng tạo cron job thiếu schedule → nhận thông báo lỗi', async () => {
    await expect(
      api.post('/api/cron', {
        name: 'Thiếu schedule',
        agentId: CRON_AGENT_ID,
        task: 'Test task',
      }),
    ).rejects.toThrow('400')
  })

  // ── Bước 7: Người dùng xóa cron job ──

  test('người dùng xóa cron job → không còn trong danh sách', async () => {
    await api.delete(`/api/cron/${cronJobId}`)

    const { jobs } = await api.get<{ jobs: Array<{ id: string }> }>('/api/cron')
    const found = jobs.find(j => j.id === cronJobId)
    expect(found).toBeUndefined()

    cronJobId = '' // Đã xóa
  })
})
