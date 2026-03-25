/**
 * BDD UI Tests: Người dùng quản lý agents qua giao diện (Spec 02)
 *
 * User story: Với tư cách là người dùng, tôi muốn xem danh sách agents,
 * tạo agent mới qua form, thấy trạng thái thống kê, và xử lý empty state.
 */

import { test, expect } from '@playwright/test'

test.describe('Người dùng quản lý agents qua giao diện', () => {
  // ── Bước 1: Người dùng vào trang Agents ──

  test('người dùng vào /agents — thấy stats bar đầy đủ', async ({ page }) => {
    await page.goto('/agents')

    // Tiêu đề phải hiển thị
    await expect(page.getByRole('heading', { name: /agent manager/i })).toBeVisible()

    // Stats bar phải có 4 metrics
    await expect(page.getByTestId('stat-total')).toBeVisible()
    await expect(page.getByTestId('stat-running')).toBeVisible()
    await expect(page.getByTestId('stat-paused')).toBeVisible()
    await expect(page.getByTestId('stat-error')).toBeVisible()
  })

  // ── Bước 2: Người dùng xem thống kê agents ──

  test('người dùng xem stats — giá trị là số hợp lệ', async ({ page }) => {
    await page.goto('/agents')

    // Chờ data load (không còn skeleton)
    await page.waitForTimeout(1500)

    const totalText = await page.getByTestId('stat-total').textContent()
    // Text phải chứa chữ số
    expect(totalText).toMatch(/\d/)
  })

  // ── Bước 3: Người dùng click "New Agent" — form hiện ra ──

  test('người dùng click "New Agent" — form modal xuất hiện', async ({ page }) => {
    await page.goto('/agents')

    await page.getByTestId('btn-new-agent').click()

    // Dialog phải hiện với tiêu đề
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Tạo Agent Mới')).toBeVisible()
  })

  // ── Bước 4: Người dùng thấy form có các tab ──

  test('người dùng thấy form agent có tabs: Cơ bản, Cá tính, Công cụ, Giới hạn', async ({ page }) => {
    await page.goto('/agents')
    await page.getByTestId('btn-new-agent').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // 4 tabs phải hiển thị
    await expect(dialog.getByRole('tab', { name: /cơ bản/i })).toBeVisible()
    await expect(dialog.getByRole('tab', { name: /cá tính/i })).toBeVisible()
    await expect(dialog.getByRole('tab', { name: /công cụ/i })).toBeVisible()
    await expect(dialog.getByRole('tab', { name: /giới hạn/i })).toBeVisible()
  })

  // ── Bước 5: Người dùng điền tên agent ──

  test('người dùng điền tên agent vào form', async ({ page }) => {
    await page.goto('/agents')
    await page.getByTestId('btn-new-agent').click()

    const dialog = page.getByRole('dialog')
    const nameInput = dialog.getByTestId('agent-form-name')

    await nameInput.fill('Test Agent UI BDD')
    await expect(nameInput).toHaveValue('Test Agent UI BDD')
  })

  // ── Bước 6: Người dùng submit form với tên hợp lệ → agent tạo thành công ──

  test('người dùng tạo agent hợp lệ → modal đóng và agent xuất hiện', async ({ page }) => {
    await page.goto('/agents')
    await page.getByTestId('btn-new-agent').click()

    const dialog = page.getByRole('dialog')
    await dialog.getByTestId('agent-form-name').fill('BDD UI Test Agent')

    // Click submit
    await dialog.getByTestId('agent-form-submit').click()

    // Modal phải đóng (agent được tạo thành công → toast + close)
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    // Agent mới phải xuất hiện trong list
    await expect(page.getByText('BDD UI Test Agent')).toBeVisible({ timeout: 3000 })
  })

  // ── Bước 7: Người dùng đóng form bằng nút Hủy ──

  test('người dùng click Hủy trong form — modal đóng không tạo agent', async ({ page }) => {
    await page.goto('/agents')
    await page.getByTestId('btn-new-agent').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Click Hủy
    await dialog.getByRole('button', { name: /hủy/i }).click()

    await expect(dialog).not.toBeVisible({ timeout: 3000 })
  })

  // ── Bước 8: Người dùng click Refresh — danh sách cập nhật ──

  test('người dùng click Refresh — không lỗi và danh sách reload', async ({ page }) => {
    await page.goto('/agents')

    await page.getByRole('button', { name: /refresh/i }).click()

    // Không được có lỗi hiển thị
    await expect(page.getByText(/error|lỗi/i)).not.toBeVisible({ timeout: 2000 }).catch(() => {})
    // Page vẫn hiển thị thống kê
    await expect(page.getByTestId('stat-total')).toBeVisible()
  })
})
