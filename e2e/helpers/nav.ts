import type { Page } from '@playwright/test'

export const goto = {
  agents:   (page: Page) => page.goto('/agents'),
  cron:     (page: Page) => page.goto('/cron'),
  flow:     (page: Page) => page.goto('/flow'),
  flowEdit: (page: Page, id: string) => page.goto(`/flow/${id}`),
  monitor:  (page: Page) => page.goto('/monitor'),
  channels: (page: Page) => page.goto('/channels'),
  config:   (page: Page) => page.goto('/config'),
  mcp:      (page: Page) => page.goto('/mcp'),
  reports:  (page: Page) => page.goto('/reports'),
  terminal: (page: Page) => page.goto('/terminal'),
}
