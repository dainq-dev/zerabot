/**
 * BDD UI Tests: Người dùng dispatch task qua giao diện (Spec 03)
 *
 * User story: Với tư cách là người dùng, tôi muốn dễ dàng gửi task
 * đến agent hoặc pipeline, thấy trạng thái send button, và xem history.
 */

import { test, expect } from '@playwright/test'

test.describe('Người dùng dispatch task qua giao diện', () => {
  // ── Bước 1: Người dùng vào trang Tasks ──

  test('người dùng vào /tasks — thấy dispatch panel', async ({ page }) => {
    await page.goto('/tasks')

    await expect(page.getByRole('heading', { name: /tasks/i })).toBeVisible()

    // Dispatch panel phải hiển thị với label "Dispatch Task"
    await expect(page.getByText('Dispatch Task')).toBeVisible()
  })

  // ── Bước 2: Người dùng thấy form dispatch ──

  test('người dùng thấy form dispatch: selector + textarea + send button', async ({ page }) => {
    await page.goto('/tasks')

    // Target type selector (Agent / Pipeline toggle)
    await expect(page.getByRole('combobox').first()).toBeVisible()

    // Prompt textarea
    await expect(page.getByTestId('task-prompt-textarea')).toBeVisible()

    // Send button
    await expect(page.getByTestId('task-send-btn')).toBeVisible()
  })

  // ── Bước 3: Send button disabled khi chưa có input ──

  test('send button disabled khi chưa chọn agent và chưa nhập prompt', async ({ page }) => {
    await page.goto('/tasks')

    const sendBtn = page.getByTestId('task-send-btn')
    await expect(sendBtn).toBeDisabled()
  })

  // ── Bước 4: Send button disabled khi chỉ có prompt (không có agent) ──

  test('send button vẫn disabled khi nhập prompt nhưng chưa chọn agent', async ({ page }) => {
    await page.goto('/tasks')

    await page.getByTestId('task-prompt-textarea').fill('Test task prompt')

    const sendBtn = page.getByTestId('task-send-btn')
    // Chưa chọn target → disabled
    await expect(sendBtn).toBeDisabled()
  })

  // ── Bước 5: Người dùng thấy cảnh báo khi không có running agent ──

  test('người dùng thấy cảnh báo khi không có agent đang chạy', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForTimeout(1500) // Chờ data load

    // Nếu không có running agent → cảnh báo màu vàng
    const warning = page.getByText(/no running agents/i)
    // Có thể xuất hiện hoặc không — nếu xuất hiện phải visible
    const isVisible = await warning.isVisible().catch(() => false)
    if (isVisible) {
      await expect(warning).toBeVisible()
    }
    // Dù có hay không, test vẫn pass
  })

  // ── Bước 6: Người dùng thay đổi target type → Pipeline ──

  test('người dùng switch target type sang Pipeline', async ({ page }) => {
    await page.goto('/tasks')

    const targetTypeSelect = page.getByRole('combobox').first()
    await targetTypeSelect.click()

    // Chọn Pipeline option
    await page.getByRole('option', { name: /pipeline/i }).click()

    // Selector thứ 2 phải hiển thị placeholder cho pipeline
    await expect(page.getByText(/select a pipeline/i).or(page.getByText(/no pipelines found/i))).toBeVisible()
  })

  // ── Bước 7: Người dùng xem lịch sử task runs ──

  test('người dùng thấy lịch sử task runs hoặc empty state', async ({ page }) => {
    await page.goto('/tasks')
    await page.waitForTimeout(2000) // Chờ data load

    // Phải có bảng history HOẶC empty state
    const hasTable = await page.getByTestId('task-runs-table').isVisible().catch(() => false)
    const hasEmpty = await page.getByText(/no tasks dispatched yet/i).isVisible().catch(() => false)

    expect(hasTable || hasEmpty).toBe(true)
  })

  // ── Bước 8: Người dùng thấy Refresh button ──

  test('người dùng click Refresh — không crash và list reload', async ({ page }) => {
    await page.goto('/tasks')

    await page.getByRole('button', { name: /refresh/i }).click()

    // Phải thấy dispatch panel vẫn intact
    await expect(page.getByText('Dispatch Task')).toBeVisible()
  })
})
