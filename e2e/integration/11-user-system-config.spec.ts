/**
 * BDD Tests: Người dùng cấu hình hệ thống và kênh thông báo (Spec 31)
 *
 * User story: Với tư cách là người dùng, tôi muốn xem và thay đổi cấu hình hệ thống,
 * quản lý các kênh thông báo (Telegram, Email), xem events và theo dõi token usage.
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'

test.describe('Người dùng cấu hình hệ thống và kênh thông báo', () => {
  // ── Bước 1: Người dùng kiểm tra health của hệ thống ──

  test('người dùng kiểm tra trạng thái hệ thống', async () => {
    const health = await api.get<{
      status: string
      bridge: string
      openclaw: { ok: boolean }
      runningAgents: number
    }>('/api/health')

    expect(health.status).toBe('ok')
    expect(health.bridge).toBe('ok')
    expect(typeof health.openclaw.ok).toBe('boolean')
    expect(typeof health.runningAgents).toBe('number')
  })

  // ── Bước 2: Người dùng xem config hiện tại ──

  test('người dùng xem cấu hình hệ thống', async () => {
    const { config } = await api.get<{ config: Record<string, unknown> }>('/api/config')
    // Config phải là object
    expect(config !== null && typeof config === 'object').toBe(true)
  })

  // ── Bước 3: Người dùng cập nhật config ──

  test('người dùng cập nhật config hệ thống', async () => {
    const result = await api.patch<{ ok: boolean }>('/api/config', {
      // Cập nhật một trường không ảnh hưởng tới hoạt động (metadata)
      _testTag: 'spec31-e2e-test',
    })

    expect(result.ok).toBe(true)
  })

  // ── Bước 4: Người dùng xem danh sách channels thông báo ──

  test('người dùng xem danh sách kênh thông báo', async () => {
    const { channels } = await api.get<{ channels: Array<{ id: string; name: string; enabled: boolean }> }>(
      '/api/channels',
    )

    expect(Array.isArray(channels)).toBe(true)
    // Mỗi channel phải có id, name, enabled
    for (const ch of channels) {
      expect(ch.id).toBeDefined()
      expect(ch.name).toBeDefined()
      expect(typeof ch.enabled).toBe('boolean')
    }
  })

  // ── Bước 5: Người dùng cập nhật cài đặt Telegram channel ──

  test('người dùng cập nhật cài đặt Telegram channel', async () => {
    const { channel } = await api.patch<{ channel: { id: string; enabled: boolean; config: Record<string, unknown> } }>(
      '/api/channels/telegram',
      {
        enabled: false,
        config: {
          botToken: 'test-token-spec31',
          chatId: '-100123456789',
        },
        routing: ['agent.error', 'cron.failed'],
      },
    )

    expect(channel.id).toBe('telegram')
    expect(channel.enabled).toBe(false)
    expect(channel.config.botToken).toBe('test-token-spec31')
  })

  // ── Bước 6: Người dùng bật lại channel Telegram ──

  test('người dùng bật lại Telegram channel → enabled = true', async () => {
    const { channel } = await api.patch<{ channel: { id: string; enabled: boolean } }>(
      '/api/channels/telegram',
      {
        enabled: true,
      },
    )

    expect(channel.enabled).toBe(true)
  })

  // ── Bước 7: Người dùng test channel ──

  test('người dùng test kênh Telegram → nhận xác nhận', async () => {
    const result = await api.post<{ ok: boolean; message: string }>(
      '/api/channels/telegram/test',
    )

    expect(result.ok).toBe(true)
    expect(result.message).toContain('telegram')
  })

  // ── Bước 8: Người dùng xem log events của hệ thống ──

  test('người dùng xem events gần đây', async () => {
    const { events } = await api.get<{ events: unknown[] }>('/api/events?limit=20')

    expect(Array.isArray(events)).toBe(true)
    // Có thể rỗng nếu không có agent nào chạy — nhưng phải là array
  })

  // ── Bước 9: Người dùng filter events theo agent ──

  test('người dùng filter events theo agent cụ thể', async () => {
    const { events } = await api.get<{ events: Array<{ agentId: string | undefined }> }>(
      '/api/events?agentId=spec28-cron-agent&limit=10',
    )

    expect(Array.isArray(events)).toBe(true)
    // Nếu có event thì phải match agentId
    for (const evt of events) {
      expect(evt.agentId).toBe('spec28-cron-agent')
    }
  })

  // ── Bước 10: Người dùng xem thống kê token usage ──

  test('người dùng xem token usage 24h qua', async () => {
    const { data } = await api.get<{ data: unknown[] }>('/api/metrics/tokens')

    expect(Array.isArray(data)).toBe(true)
  })
})
