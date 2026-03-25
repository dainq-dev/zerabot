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
      retries: 2,
      workers: 2,
    },
    {
      name: 'integration',
      testDir: './integration',
      use: {
        baseURL: 'http://localhost:3001',
      },
      workers: 2,
      retries: 2,
    },
  ],
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: 'results/html' }],
    ['junit', { outputFile: 'results/junit.xml' }],
    ['list'],
  ],
})
