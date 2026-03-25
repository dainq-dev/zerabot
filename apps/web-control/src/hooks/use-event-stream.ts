"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import type { ZerabotEvent } from "@zerobot/shared"

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001"

export function useEventStream(maxEvents = 200) {
  const [events, setEvents] = useState<ZerabotEvent[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(`${WS_URL}/api/events/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === "event" && msg.payload) {
            setEvents(prev => {
              const next = [msg.payload as ZerabotEvent, ...prev]
              return next.slice(0, maxEvents)
            })
          }
        } catch {}
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    } catch {}
  }, [maxEvents])

  useEffect(() => {
    connect()
    return () => {
      if (wsRef.current) wsRef.current.close()
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }
  }, [connect])

  const clear = useCallback(() => setEvents([]), [])

  return { events, connected, clear }
}
