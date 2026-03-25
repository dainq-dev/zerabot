import type { ZerabotEvent } from '@zerobot/shared'

/**
 * Connects a real WebSocket to api-bridge and collects ZerabotEvents.
 * Used exclusively in integration tests — do not use in UI (mock) tests.
 */
export class WsEventCollector {
  private ws: WebSocket
  readonly events: ZerabotEvent[] = []
  private listeners: Array<(e: ZerabotEvent) => void> = []
  private _connected = false

  constructor(url = 'ws://localhost:3001/api/events/ws') {
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this._connected = true
    }

    this.ws.onmessage = (raw) => {
      try {
        const msg = JSON.parse(raw.data as string) as { type: string; payload?: unknown }
        if (msg.type === 'ping') {
          this.ws.send(JSON.stringify({ type: 'pong' }))
        }
        if (msg.type === 'event' && msg.payload) {
          const evt = msg.payload as ZerabotEvent
          this.events.push(evt)
          for (const fn of this.listeners) fn(evt)
        }
      } catch {}
    }
  }

  get connected(): boolean {
    return this._connected
  }

  /** Wait until WS is open */
  waitConnected(timeout = 5_000): Promise<void> {
    if (this._connected) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WS connect timeout')), timeout)
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
    })
  }

  /**
   * Resolve as soon as one event satisfies the predicate.
   * Checks the already-received backlog first, then listens for new ones.
   */
  waitFor(predicate: (e: ZerabotEvent) => boolean, timeout = 15_000): Promise<ZerabotEvent> {
    const found = this.events.find(predicate)
    if (found) return Promise.resolve(found)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter(f => f !== handler)
        reject(new Error(`WsCollector: event not received within ${timeout}ms`))
      }, timeout)

      const handler = (e: ZerabotEvent) => {
        if (predicate(e)) {
          clearTimeout(timer)
          this.listeners = this.listeners.filter(f => f !== handler)
          resolve(e)
        }
      }
      this.listeners.push(handler)
    })
  }

  /**
   * Wait for multiple events in order.
   * Each predicate is checked only after the previous one resolves.
   */
  async waitForSequence(
    predicates: Array<(e: ZerabotEvent) => boolean>,
    timeout = 30_000,
  ): Promise<ZerabotEvent[]> {
    const results: ZerabotEvent[] = []
    for (const p of predicates) {
      results.push(await this.waitFor(p, timeout))
    }
    return results
  }

  /** Return all events belonging to a specific agent */
  eventsOf(agentId: string): ZerabotEvent[] {
    return this.events.filter(e => e.agentId === agentId)
  }

  /** Return events matching a specific type */
  eventsOfType(type: ZerabotEvent['type']): ZerabotEvent[] {
    return this.events.filter(e => e.type === type)
  }

  close(): void {
    this.ws.close()
  }
}
