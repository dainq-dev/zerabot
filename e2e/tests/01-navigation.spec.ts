/**
 * BDD UI Tests: Người dùng điều hướng trong dashboard (Spec 01)
 *
 * User story: Với tư cách là người dùng, tôi muốn dễ dàng điều hướng
 * giữa các tính năng qua sidebar, thấy rõ page đang active.
 */

import { test, expect } from '@playwright/test'

const NAV_ITEMS = [
  { label: 'Agents',       href: '/agents' },
  { label: 'Tasks',        href: '/tasks' },
  { label: 'Monitor',      href: '/monitor' },
  { label: 'Cron',         href: '/cron' },
  { label: 'Flow Builder', href: '/flow' },
  { label: 'Channels',     href: '/channels' },
  { label: 'MCP Servers',  href: '/mcp' },
  { label: 'Reports',      href: '/reports' },
  { label: 'Config',       href: '/config' },
]

test.describe('Người dùng điều hướng trong dashboard', () => {
  // ── Bước 1: Người dùng mở app lần đầu ──

  test('người dùng mở app — thấy sidebar với logo ZERABOT', async ({ page }) => {
    await page.goto('/')

    // Logo phải hiển thị
    await expect(page.getByText('ZERABOT')).toBeVisible()

    // Sidebar phải chứa các nhóm nav
    await expect(page.getByText('OPERATIONS')).toBeVisible()
    await expect(page.getByText('CONNECTIONS')).toBeVisible()
    await expect(page.getByText('ANALYTICS')).toBeVisible()
    await expect(page.getByText('SYSTEM')).toBeVisible()
  })

  // ── Bước 2: Người dùng thấy tất cả menu items ──

  test('người dùng thấy đầy đủ các menu items trong sidebar', async ({ page }) => {
    await page.goto('/agents')

    for (const item of NAV_ITEMS) {
      await expect(page.getByRole('link', { name: item.label })).toBeVisible()
    }
  })

  // ── Bước 3: Người dùng click vào Agents → URL đúng ──

  test('người dùng click Agents → chuyển đến /agents', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'Agents' }).click()
    await expect(page).toHaveURL(/\/agents/)
    await expect(page.getByRole('heading', { name: /agent manager/i })).toBeVisible()
  })

  // ── Bước 4: Người dùng click Tasks ──

  test('người dùng click Tasks → chuyển đến /tasks', async ({ page }) => {
    await page.goto('/agents')

    await page.getByRole('link', { name: 'Tasks' }).click()
    await expect(page).toHaveURL(/\/tasks/)
    await expect(page.getByRole('heading', { name: /tasks/i })).toBeVisible()
  })

  // ── Bước 5: Người dùng click Cron ──

  test('người dùng click Cron → chuyển đến /cron', async ({ page }) => {
    await page.goto('/agents')

    await page.getByRole('link', { name: 'Cron' }).click()
    await expect(page).toHaveURL(/\/cron/)
    await expect(page.getByRole('heading', { name: /cron scheduler/i })).toBeVisible()
  })

  // ── Bước 6: Người dùng click MCP Servers ──

  test('người dùng click MCP Servers → chuyển đến /mcp', async ({ page }) => {
    await page.goto('/agents')

    await page.getByRole('link', { name: 'MCP Servers' }).click()
    await expect(page).toHaveURL(/\/mcp/)
    await expect(page.getByRole('heading', { name: /mcp servers/i })).toBeVisible()
  })

  // ── Bước 7: Sidebar hiển thị active state đúng ──

  test('sidebar hiển thị active state khi ở trang /agents', async ({ page }) => {
    await page.goto('/agents')

    // Link agents phải được highlight — tìm link có class active
    const agentsLink = page.getByRole('link', { name: 'Agents' })
    // Active link có border-primary/30 class
    await expect(agentsLink).toHaveClass(/bg-accent|border-primary/)
  })

  // ── Bước 8: Footer hiển thị ZEROCLAW status ──

  test('sidebar footer hiện ZEROCLAW status (ONLINE/OFFLINE)', async ({ page }) => {
    await page.goto('/agents')

    // Status text luôn hiển thị dù online hay offline
    await expect(page.getByText('ZEROCLAW')).toBeVisible()
    // Status value — chờ tối đa 5s để health check load
    await expect(page.getByText(/ONLINE|OFFLINE/)).toBeVisible({ timeout: 5000 })
  })
})
