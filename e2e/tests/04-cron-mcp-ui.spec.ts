/**
 * BDD UI Tests: Người dùng cấu hình Cron và MCP qua giao diện (Spec 04)
 *
 * User story: Với tư cách là người dùng, tôi muốn tạo cron job lên lịch
 * tự động và thêm MCP server để mở rộng tools cho agent.
 */

import { test, expect } from '@playwright/test'

test.describe('Người dùng cấu hình Cron và MCP qua giao diện', () => {
  // ─────────────────────────────────────────────────────────────
  // CRON SCHEDULER
  // ─────────────────────────────────────────────────────────────

  // ── Bước 1: Người dùng vào trang Cron ──

  test('người dùng vào /cron — thấy stats và danh sách jobs', async ({ page }) => {
    await page.goto('/cron')

    await expect(page.getByRole('heading', { name: /cron scheduler/i })).toBeVisible()

    // Stats bar
    await expect(page.getByText('TOTAL')).toBeVisible()
    await expect(page.getByText('RUNNING')).toBeVisible()
    await expect(page.getByText('PAUSED')).toBeVisible()
    await expect(page.getByText('FAILED')).toBeVisible()
  })

  // ── Bước 2: Người dùng click "New Job" → form hiện ra ──

  test('người dùng click "New Job" — form tạo cron job xuất hiện', async ({ page }) => {
    await page.goto('/cron')

    await page.getByTestId('btn-new-cron').click()

    await expect(page.getByRole('dialog')).toBeVisible()
    // Dialog phải có tiêu đề về tạo job
    await expect(page.getByRole('dialog').getByText(/cron|job|schedule/i)).toBeVisible()
  })

  // ── Bước 3: CronForm — người dùng điền tên job ──

  test('người dùng điền thông tin cron job trong form', async ({ page }) => {
    await page.goto('/cron')
    await page.getByTestId('btn-new-cron').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Điền tên job
    const nameInput = dialog.getByPlaceholder(/name|tên/i).first()
    await nameInput.fill('UI BDD Test Cron Job')
    await expect(nameInput).toHaveValue('UI BDD Test Cron Job')
  })

  // ── Bước 4: Người dùng đóng form bằng Cancel ──

  test('người dùng click Cancel trong cron form — modal đóng', async ({ page }) => {
    await page.goto('/cron')
    await page.getByTestId('btn-new-cron').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByRole('button', { name: /cancel|hủy/i }).click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 })
  })

  // ── Bước 5: Người dùng thấy empty state khi chưa có jobs ──

  test('người dùng thấy empty state hoặc bảng jobs tùy theo data', async ({ page }) => {
    await page.goto('/cron')
    await page.waitForTimeout(1500)

    const hasTable = await page.getByTestId('cron-table-body').isVisible().catch(() => false)
    const hasEmpty = await page.getByText(/no cron jobs scheduled/i).isVisible().catch(() => false)

    expect(hasTable || hasEmpty).toBe(true)
  })

  // ─────────────────────────────────────────────────────────────
  // MCP SERVERS
  // ─────────────────────────────────────────────────────────────

  // ── Bước 6: Người dùng vào trang MCP ──

  test('người dùng vào /mcp — thấy danh sách MCP servers', async ({ page }) => {
    await page.goto('/mcp')

    await expect(page.getByRole('heading', { name: /mcp servers/i })).toBeVisible()
    // Phải có count text
    await expect(page.getByText(/registered.*model context protocol/i)).toBeVisible()
  })

  // ── Bước 7: Người dùng click "Add Server" → form hiện ra ──

  test('người dùng click "Add Server" — form thêm MCP server xuất hiện', async ({ page }) => {
    await page.goto('/mcp')

    await page.getByTestId('btn-new-mcp').click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Add MCP Server')).toBeVisible()
  })

  // ── Bước 8: Form MCP có đầy đủ fields ──

  test('form MCP có đủ fields: Name, Transport, Command', async ({ page }) => {
    await page.goto('/mcp')
    await page.getByTestId('btn-new-mcp').click()

    const dialog = page.getByRole('dialog')

    // Fields cơ bản phải hiển thị
    await expect(dialog.getByText('Name')).toBeVisible()
    await expect(dialog.getByText('Transport')).toBeVisible()
    // Transport selector
    await expect(dialog.getByRole('combobox')).toBeVisible()
  })

  // ── Bước 9: Người dùng điền Name và submit → MCP server tạo thành công ──

  test('người dùng thêm MCP server stdio → server xuất hiện trong danh sách', async ({ page }) => {
    await page.goto('/mcp')
    await page.getByTestId('btn-new-mcp').click()

    const dialog = page.getByRole('dialog')

    // Điền Name
    await dialog.getByPlaceholder('clawbot-data').fill('BDD Test MCP Server')

    // Submit
    await dialog.getByRole('button', { name: /add server/i }).click()

    // Dialog đóng
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    // Server mới xuất hiện trong grid
    await expect(page.getByTestId('mcp-grid').getByText('BDD Test MCP Server')).toBeVisible({ timeout: 3000 })
  })

  // ── Bước 10: Người dùng đóng form MCP bằng Cancel ──

  test('người dùng click Cancel trong MCP form — modal đóng', async ({ page }) => {
    await page.goto('/mcp')
    await page.getByTestId('btn-new-mcp').click()

    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByRole('button', { name: /cancel/i }).click()

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 })
  })
})
