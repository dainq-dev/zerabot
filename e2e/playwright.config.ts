import { defineConfig } from '@playwright/test'

export default defineConfig({
  projects: [
    {
      name: 'ui',
      testDir: './tests',
      use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
      },
    },
    {
      name: 'integration',
      testDir: './integration',
      use: {
        baseURL: 'http://localhost:3001',
      },
      workers: 1,
      retries: 1,
    },
  ],
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['html', { outputFolder: 'results/html' }],
    ['junit', { outputFile: 'results/junit.xml' }],
    ['list'],
  ],
})
