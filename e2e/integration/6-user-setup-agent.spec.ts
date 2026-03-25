/**
 * BDD Tests: Người dùng tạo và quản lý agent từ template (Spec 26)
 *
 * User story: Với tư cách là người dùng, tôi muốn tìm kiếm template có sẵn,
 * tạo agent từ template đó, điều chỉnh config nếu cần, rồi dọn dẹp khi không dùng nữa.
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'
import type { Agent } from '@zerobot/shared'

// Agents tạo ra trong test này — cleanup trong afterAll
const CREATED_AGENT_IDS: string[] = []

test.describe('Người dùng tạo và quản lý agent từ template', () => {
  test.afterAll(async () => {
    // Dọn dẹp tất cả agents đã tạo trong test session này
    for (const id of CREATED_AGENT_IDS) {
      await api.post(`/api/agents/${id}/stop`).catch(() => {})
      await api.delete(`/api/agents/${id}`).catch(() => {})
    }
  })

  // ── Bước 1: Người dùng xem danh sách templates ──

  test('người dùng xem danh sách agent templates có sẵn', async () => {
    const { templates } = await api.get<{ templates: Array<{ id: string; name: string; tags: string[] }> }>(
      '/api/agent-templates',
    )

    // Phải có ít nhất 1 template
    expect(templates.length).toBeGreaterThan(0)

    // Mỗi template phải có id, name, tags
    for (const tpl of templates) {
      expect(tpl.id).toBeDefined()
      expect(tpl.name).toBeDefined()
      expect(Array.isArray(tpl.tags)).toBe(true)
    }
  })

  // ── Bước 2: Người dùng tìm template theo tag ──

  test('người dùng lọc template theo tag "finance"', async () => {
    const { templates } = await api.get<{ templates: Array<{ id: string; tags: string[] }> }>(
      '/api/agent-templates?tag=finance',
    )

    // Tất cả kết quả phải có tag "finance"
    expect(templates.length).toBeGreaterThan(0)
    for (const tpl of templates) {
      expect(tpl.tags).toContain('finance')
    }
  })

  // ── Bước 3: Người dùng xem chi tiết template ──

  test('người dùng xem chi tiết template gold-price-tracker', async () => {
    const { template } = await api.get<{
      template: { id: string; name: string; model: string; soul: string; instructions: string }
    }>('/api/agent-templates/gold-price-tracker')

    expect(template.id).toBe('gold-price-tracker')
    expect(template.name).toBeDefined()
    expect(template.model).toBeDefined()
    // Template phải có instructions hướng dẫn agent làm việc
    expect(template.instructions.length).toBeGreaterThan(10)
  })

  // ── Bước 4: Người dùng tạo agent từ template ──

  test('người dùng tạo agent từ template gold-price-tracker', async () => {
    const { agent } = await api.post<{ agent: Agent }>('/api/agent-templates/gold-price-tracker/use', {})

    // Agent phải được tạo với đúng config từ template
    expect(agent.id).toContain('gold-price-tracker')
    expect(agent.name).toBe('Gold Price Tracker')
    expect(agent.enabled).toBe(true)

    CREATED_AGENT_IDS.push(agent.id)
  })

  // ── Bước 5: Người dùng tạo agent không tồn tại trong template ──

  test('người dùng tìm template không tồn tại → thông báo lỗi', async () => {
    await expect(
      api.get('/api/agent-templates/template-khong-ton-tai'),
    ).rejects.toThrow('404')
  })

  // ── Bước 6: Người dùng tạo agent thủ công với custom config ──

  test('người dùng tạo agent thủ công với toolsProfile custom', async () => {
    const { agent } = await api.post<{ agent: Agent }>('/api/agents', {
      id: 'spec26-custom-agent',
      name: 'Custom Agent Test',
      emoji: '🛠️',
      model: 'anthropic/claude-haiku-4-5',
      toolsProfile: 'custom',
      toolsAllow: ['web_search', 'web_fetch'],
      toolsDeny: ['exec', 'browser'],
      allowAgents: [],
      limits: { maxRamMb: 50, maxTokensPerHour: 1000, maxConcurrentTasks: 1 },
    })

    expect(agent.id).toBe('spec26-custom-agent')
    expect(agent.toolsProfile).toBe('custom')
    expect(agent.toolsAllow).toContain('web_search')
    expect(agent.toolsDeny).toContain('exec')

    CREATED_AGENT_IDS.push(agent.id)
  })

  // ── Bước 7: Người dùng cập nhật agent ──

  test('người dùng cập nhật tên và profile của agent', async () => {
    await api.patch('/api/agents/spec26-custom-agent', {
      name: 'Custom Agent (Updated)',
      toolsProfile: 'coding',
    })

    const { agent } = await api.get<{ agent: Agent }>('/api/agents/spec26-custom-agent')
    expect(agent.name).toBe('Custom Agent (Updated)')
    expect(agent.toolsProfile).toBe('coding')
  })

  // ── Bước 8: Người dùng xem danh sách agents ──

  test('người dùng xem danh sách agents — có agents vừa tạo', async () => {
    const { agents } = await api.get<{ agents: Agent[] }>('/api/agents')

    const created = agents.filter(a => CREATED_AGENT_IDS.includes(a.id))
    expect(created.length).toBe(CREATED_AGENT_IDS.length)
  })

  // ── Bước 9: Người dùng xóa agent không cần nữa ──

  test('người dùng xóa agent spec26-custom-agent', async () => {
    await api.delete('/api/agents/spec26-custom-agent')

    // Sau khi xóa, GET phải trả 404
    await expect(
      api.get('/api/agents/spec26-custom-agent'),
    ).rejects.toThrow('404')

    // Loại khỏi cleanup list vì đã xóa thủ công
    const idx = CREATED_AGENT_IDS.indexOf('spec26-custom-agent')
    if (idx !== -1) CREATED_AGENT_IDS.splice(idx, 1)
  })
})
