"use client"

import { useEffect, useRef, useCallback } from "react"
import type { Agent } from "@zerobot/shared"

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001"

interface AgentTerminalProps {
  agent: Agent
}

export function AgentTerminal({ agent }: AgentTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null)

  const connect = useCallback(async () => {
    const { Terminal } = await import("@xterm/xterm")
    const { FitAddon } = await import("@xterm/addon-fit")
    const { WebLinksAddon } = await import("@xterm/addon-web-links")
    await import("@xterm/xterm/css/xterm.css")

    if (!containerRef.current) return

    // Destroy existing terminal
    if (termRef.current) {
      termRef.current.dispose()
    }

    const term = new Terminal({
      theme: {
        background: "#0d1117",
        foreground: "#b8e0c8",
        cursor: "#75c8ae",
        cursorAccent: "#0d1117",
        black: "#1e2530",
        red: "#f38ba8",
        green: "#72c994",
        yellow: "#d4a72c",
        blue: "#89b4fa",
        magenta: "#cba6f7",
        cyan: "#75c8ae",
        white: "#cdd6f4",
        brightBlack: "#45475a",
        brightRed: "#f38ba8",
        brightGreen: "#a6e3a1",
        brightYellow: "#f9e2af",
        brightBlue: "#89b4fa",
        brightMagenta: "#f5c2e7",
        brightCyan: "#94e2d5",
        brightWhite: "#ffffff",
      },
      fontFamily: "var(--font-geist-mono), 'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: "block",
      allowTransparency: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    const linksAddon = new WebLinksAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(linksAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    termRef.current = term
    fitRef.current = fitAddon

    // Welcome message
    term.writeln(`\x1b[36m╔══════════════════════════════════════╗\x1b[0m`)
    term.writeln(`\x1b[36m║  ZeraBot Terminal — ${agent.name.padEnd(17)}║\x1b[0m`)
    term.writeln(`\x1b[36m╚══════════════════════════════════════╝\x1b[0m`)
    term.writeln(`\x1b[90mConnecting to agent ${agent.id}...\x1b[0m`)

    // Connect WebSocket relay
    const ws = new WebSocket(`${WS_URL}/api/terminal/${agent.id}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      term.writeln(`\x1b[32m● Connected\x1b[0m\r\n`)
      term.focus()
    }

    ws.onmessage = (e) => {
      const data = typeof e.data === "string" ? e.data : e.data.toString()
      try {
        const msg = JSON.parse(data)
        if (msg.type === "output") term.write(msg.data)
        else if (msg.type === "error") term.writeln(`\x1b[31m${msg.message}\x1b[0m`)
      } catch {
        term.write(data)
      }
    }

    ws.onclose = () => {
      term.writeln(`\r\n\x1b[31m● Disconnected\x1b[0m`)
    }

    ws.onerror = () => {
      term.writeln(`\r\n\x1b[31m✗ Connection failed — is api-bridge running?\x1b[0m`)
    }

    // Send user input
    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }))
      } else {
        // Fallback: echo locally
        term.write(data)
      }
    })

    // Resize observer
    const resizeObserver = new ResizeObserver(() => fitAddon.fit())
    resizeObserver.observe(containerRef.current!)

    return () => {
      resizeObserver.disconnect()
      ws.close()
      term.dispose()
    }
  }, [agent.id, agent.name])

  useEffect(() => {
    let cleanup: (() => void) | undefined

    connect().then(fn => { cleanup = fn })

    return () => {
      cleanup?.()
      wsRef.current?.close()
      termRef.current?.dispose()
    }
  }, [connect])

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-0 overflow-hidden rounded"
      style={{ padding: "4px" }}
    />
  )
}
