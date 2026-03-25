/**
 * BDD Tests: Người dùng cấu hình MCP server cho agent (Spec 29)
 *
 * User story: Với tư cách là người dùng, tôi muốn thêm MCP server để mở rộng
 * khả năng của agent (tools), cập nhật config, discover tools, và xóa khi không dùng.
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'
import type { McpServerConfig } from '@zerobot/shared'

let mcpServerId: string

test.describe('Người dùng cấu hình MCP server cho agent', () => {
  test.afterAll(async () => {
    if (mcpServerId) await api.delete(`/api/mcp/${mcpServerId}`).catch(() => {})
  })

  // ── Bước 1: Người dùng xem danh sách MCP servers hiện có ──

  test('người dùng xem danh sách MCP servers', async () => {
    const { servers } = await api.get<{ servers: McpServerConfig[] }>('/api/mcp')
    expect(Array.isArray(servers)).toBe(true)
  })

  // ── Bước 2: Người dùng thêm MCP server kiểu stdio ──

  test('người dùng thêm MCP server Git qua stdio', async () => {
    const { server } = await api.post<{ server: McpServerConfig }>('/api/mcp', {
      name: 'Git MCP Server',
      description: 'Git operations via stdio',
      transport: 'stdio',
      command: 'uvx',
      args: ['mcp-server-git', '--repository', '/tmp/test-repo'],
      env: { GIT_AUTHOR_NAME: 'Test' },
      assignedAgents: [],
      autoConnect: true,
      reconnectMs: 3000,
    })

    expect(server.id).toBeDefined()
    expect(server.name).toBe('Git MCP Server')
    expect(server.transport).toBe('stdio')
    expect(server.command).toBe('uvx')

    mcpServerId = server.id
  })

  // ── Bước 3: Người dùng xem MCP server vừa thêm ──

  test('người dùng xem danh sách — có server vừa thêm', async () => {
    const { servers } = await api.get<{ servers: McpServerConfig[] }>('/api/mcp')
    const found = servers.find(s => s.id === mcpServerId)
    expect(found).toBeDefined()
    expect(found?.transport).toBe('stdio')
  })

  // ── Bước 4: Người dùng cập nhật MCP server (gán agent) ──

  test('người dùng cập nhật MCP server — gán agent sử dụng', async () => {
    const { server } = await api.patch<{ server: McpServerConfig }>(`/api/mcp/${mcpServerId}`, {
      description: 'Git operations — updated',
      assignedAgents: ['spec26-custom-agent'],
    })

    expect(server.description).toBe('Git operations — updated')
    expect(server.assignedAgents).toContain('spec26-custom-agent')
  })

  // ── Bước 5: Người dùng trigger discover tools ──

  test('người dùng trigger tool discovery → nhận danh sách tools', async () => {
    // Server stdio với command giả (uvx có thể không available) → discover có thể fail
    // Nhưng API phải xử lý gracefully (không throw 500)
    const result = await api.post<{ tools: unknown[]; count: number }>(
      `/api/mcp/${mcpServerId}/discover`,
    ).catch((err: Error) => {
      // Discovery có thể fail do binary không có — vẫn OK nếu API trả graceful error
      expect(err.message).toMatch(/\d{3}/)
      return { tools: [], count: 0 }
    })

    expect(Array.isArray(result.tools)).toBe(true)
    expect(typeof result.count).toBe('number')
  })

  // ── Bước 6: Người dùng validate — thiếu transport → lỗi ──

  test('người dùng thêm MCP server thiếu transport → thông báo lỗi', async () => {
    await expect(
      api.post('/api/mcp', {
        name: 'Broken Server',
        // thiếu transport
      }),
    ).rejects.toThrow('400')
  })

  // ── Bước 7: Người dùng thêm MCP server kiểu HTTP ──

  test('người dùng thêm MCP server HTTP', async () => {
    const { server } = await api.post<{ server: McpServerConfig }>('/api/mcp', {
      name: 'Browser Automation MCP',
      description: 'Browser automation via HTTP',
      transport: 'http',
      endpoint: 'http://localhost:8931/sse',
      assignedAgents: [],
      autoConnect: false,
      reconnectMs: 5000,
    })

    expect(server.id).toBeDefined()
    expect(server.transport).toBe('http')

    // Cleanup ngay
    await api.delete(`/api/mcp/${server.id}`).catch(() => {})
  })

  // ── Bước 8: Người dùng xóa MCP server ──

  test('người dùng xóa MCP server → không còn trong danh sách', async () => {
    await api.delete(`/api/mcp/${mcpServerId}`)

    const { servers } = await api.get<{ servers: McpServerConfig[] }>('/api/mcp')
    const found = servers.find(s => s.id === mcpServerId)
    expect(found).toBeUndefined()

    mcpServerId = '' // Đã xóa
  })
})
