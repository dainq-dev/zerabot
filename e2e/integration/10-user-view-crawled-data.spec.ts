/**
 * BDD Tests: Người dùng xem và quản lý dữ liệu đã crawl (Spec 30)
 *
 * User story: Với tư cách là người dùng, tôi muốn xem dữ liệu mà agents đã crawl,
 * filter theo source/category, xem thống kê, export dữ liệu, và dọn dẹp dữ liệu cũ.
 */

import { test, expect } from '@playwright/test'
import { api } from './helpers/api-client'

const TEST_SOURCE = 'spec30-test-source'
const TEST_CATEGORY = 'gold'

test.describe('Người dùng xem và quản lý dữ liệu đã crawl', () => {
  test.afterAll(async () => {
    // Cleanup: xóa items với tag test để không ảnh hưởng data khác
    // (cleanup thực sự cần query rồi xóa từng item — dùng source filter)
    // Không có bulk delete endpoint nên cleanup thông qua các items đã tạo trong test
  })

  // ── Bước 1: Hệ thống (agent) ingest dữ liệu ──

  test('hệ thống ingest dữ liệu vàng từ SJC thành công', async () => {
    const result = await api.post<{ ok: boolean; inserted: number; skipped: number }>(
      '/api/data/ingest',
      {
        source: TEST_SOURCE,
        category: TEST_CATEGORY,
        agent_id: 'spec30-agent',
        items: [
          {
            url: 'https://sjc.com.vn/gia-vang-spec30-test-1',
            title: 'Giá vàng SJC ngày 25/03/2026',
            content: 'SJC mua vào 87.5 triệu, bán ra 89.5 triệu',
            structured_data: { buy: 87500000, sell: 89500000, unit: 'VND/lượng' },
            published_at: Date.now(),
          },
          {
            url: 'https://sjc.com.vn/gia-vang-spec30-test-2',
            title: 'Giá vàng PNJ ngày 25/03/2026',
            content: 'PNJ mua vào 87.2 triệu, bán ra 89.2 triệu',
            structured_data: { buy: 87200000, sell: 89200000, unit: 'VND/lượng' },
            published_at: Date.now(),
          },
        ],
      },
    )

    expect(result.ok).toBe(true)
    expect(result.inserted).toBe(2)
    expect(result.skipped).toBe(0)
  })

  // ── Bước 2: Ingest lại URL trùng → dedup ──

  test('hệ thống ingest URL trùng → bị deduplicated', async () => {
    const result = await api.post<{ ok: boolean; inserted: number; skipped: number }>(
      '/api/data/ingest',
      {
        source: TEST_SOURCE,
        category: TEST_CATEGORY,
        items: [
          {
            // Trùng URL với bản ingest trước (trong session này)
            url: 'https://sjc.com.vn/gia-vang-spec30-test-1',
            title: 'Giá vàng SJC — duplicate',
            content: 'Duplicate content',
          },
        ],
      },
    )

    expect(result.ok).toBe(true)
    // URL này đã được seen trong session → skip
    expect(result.skipped).toBe(1)
    expect(result.inserted).toBe(0)
  })

  // ── Bước 3: Người dùng xem danh sách items ──

  test('người dùng xem danh sách crawled items', async () => {
    const { items, count } = await api.get<{ items: unknown[]; count: number }>(
      '/api/data/items',
    )

    expect(Array.isArray(items)).toBe(true)
    expect(typeof count).toBe('number')
  })

  // ── Bước 4: Người dùng filter theo source ──

  test('người dùng filter items theo source spec30-test-source', async () => {
    const { items } = await api.get<{ items: Array<{ source: string }> }>(
      `/api/data/items?source=${TEST_SOURCE}`,
    )

    // Phải thấy ít nhất 2 items vừa ingest
    expect(items.length).toBeGreaterThanOrEqual(2)
    for (const item of items) {
      expect(item.source).toBe(TEST_SOURCE)
    }
  })

  // ── Bước 5: Người dùng filter theo category ──

  test('người dùng filter items theo category gold', async () => {
    const { items } = await api.get<{ items: Array<{ category: string | null }> }>(
      `/api/data/items?source=${TEST_SOURCE}&category=${TEST_CATEGORY}`,
    )

    expect(items.length).toBeGreaterThanOrEqual(2)
    for (const item of items) {
      expect(item.category).toBe(TEST_CATEGORY)
    }
  })

  // ── Bước 6: Người dùng xem thống kê theo source ──

  test('người dùng xem thống kê sources', async () => {
    const { sources } = await api.get<{ sources: Array<{ source: string; count: number }> }>(
      '/api/data/sources',
    )

    expect(Array.isArray(sources)).toBe(true)
    // Source spec30 phải xuất hiện trong thống kê
    const spec30Source = sources.find(s => s.source === TEST_SOURCE)
    expect(spec30Source).toBeDefined()
    expect(spec30Source!.count).toBeGreaterThanOrEqual(2)
  })

  // ── Bước 7: Người dùng export dữ liệu ──

  test('người dùng export dữ liệu → nhận JSON file', async () => {
    // Export endpoint trả file đính kèm — API client parse JSON body
    const result = await api.get<{ exported_at: number; count: number; items: unknown[] }>(
      `/api/data/export?source=${TEST_SOURCE}`,
    )

    expect(result.exported_at).toBeGreaterThan(0)
    expect(typeof result.count).toBe('number')
    expect(Array.isArray(result.items)).toBe(true)
    expect(result.count).toBeGreaterThanOrEqual(2)
  })

  // ── Bước 8: Người dùng trigger cleanup dữ liệu cũ ──

  test('người dùng trigger cleanup dữ liệu cũ → nhận báo cáo', async () => {
    // Cleanup items cũ hơn 365 ngày — sẽ không xóa items test mới tạo
    const result = await api.post<{ ok: boolean; deleted: number }>(
      '/api/data/cleanup?days=365',
    )

    expect(result.ok).toBe(true)
    expect(typeof result.deleted).toBe('number')
    // deleted có thể là 0 nếu không có data cũ — vẫn OK
    expect(result.deleted).toBeGreaterThanOrEqual(0)
  })
})
