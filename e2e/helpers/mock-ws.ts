import type { Page } from '@playwright/test'
import type { ZerabotEvent } from '@zerobot/shared'

/**
 * Mock the main event WebSocket (/api/events/ws).
 * Responds to ping with pong, then injects synthetic events after connection.
 */
export async function mockEventsWs(page: Page, events: ZerabotEvent[] = []) {
  await page.routeWebSocket('**/api/events/ws', ws => {
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg as string) as { type: string }
        if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }))
      } catch {}
    }
    events.forEach((evt, i) => {
      setTimeout(
        () => ws.send(JSON.stringify({ type: 'event', payload: evt })),
        150 + i * 80,
      )
    })
  })
}

/**
 * Mock the event WebSocket that closes after connecting
 * (to test the "Disconnected" indicator).
 */
export async function mockEventsWsDisconnect(page: Page, delayMs = 300) {
  await page.routeWebSocket('**/api/events/ws', ws => {
    setTimeout(() => ws.close(), delayMs)
  })
}

/**
 * Mock a terminal WebSocket for a specific agentId.
 * Sends optional output strings, responds to input in echo mode.
 */
export async function mockTerminalWs(
  page: Page,
  agentId: string,
  outputs: string[] = [],
) {
  await page.routeWebSocket(`**/api/terminal/${agentId}/ws`, ws => {
    // Send connection banner
    setTimeout(() => {
      ws.send(JSON.stringify({ type: 'output', data: `\x1b[32mConnected to agent ${agentId}\x1b[0m\r\n> ` }))
    }, 100)

    // Send queued outputs
    outputs.forEach((data, i) => {
      setTimeout(
        () => ws.send(JSON.stringify({ type: 'output', data })),
        200 + i * 100,
      )
    })

    // Echo mode for input
    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg as string) as { type: string; data?: string }
        if (data.type === 'input' && data.data) {
          ws.send(JSON.stringify({ type: 'output', data: data.data }))
        }
      } catch {}
    }
  })
}

/**
 * Mock a terminal WebSocket that immediately fails
 * (to test the echo mode fallback message).
 */
export async function mockTerminalWsOffline(page: Page, agentId: string) {
  await page.routeWebSocket(`**/api/terminal/${agentId}/ws`, ws => {
    ws.close()
  })
}
