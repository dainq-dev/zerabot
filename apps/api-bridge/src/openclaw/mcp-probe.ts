/**
 * MCP Tool Auto-Discovery
 * Spawns a short-lived MCP client probe to list tools from a server.
 * Uses JSON-RPC 2.0 over stdio for stdio transport.
 */

import type { McpServerConfig, McpTool } from "@zerobot/shared"

interface McpInitializeResult {
  protocolVersion: string
  capabilities: Record<string, unknown>
  serverInfo: { name: string; version: string }
}

interface McpToolsListResult {
  tools: Array<{
    name: string
    description: string
    inputSchema: Record<string, unknown>
  }>
}

/**
 * Discover tools from a stdio MCP server by spawning the process
 * and sending initialize + tools/list over stdin/stdout.
 */
export async function discoverMcpTools(server: McpServerConfig, timeoutMs = 8000): Promise<McpTool[]> {
  if (server.transport !== "stdio" || !server.command) {
    return []
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      proc.kill()
      resolve([])
    }, timeoutMs)

    let stdoutBuf = ""
    let initialized = false

    const proc = Bun.spawn([server.command!, ...(server.args ?? [])], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
      env: { ...process.env, ...(server.env ?? {}) },
    })

    // Send initialize request
    const initRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "zerabot-probe", version: "1.0.0" },
      },
    }) + "\n"

    proc.stdin.write(initRequest)
    proc.stdin.flush()

    // Read stdout line by line
    const reader = proc.stdout.getReader()
    const decoder = new TextDecoder()

    const readLoop = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          stdoutBuf += decoder.decode(value)
          const lines = stdoutBuf.split("\n")
          stdoutBuf = lines.pop() ?? ""

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const msg = JSON.parse(line) as { id?: number; result?: unknown }

              if (msg.id === 1 && !initialized) {
                // Initialize response — send initialized notification + tools/list
                initialized = true
                proc.stdin.write(JSON.stringify({
                  jsonrpc: "2.0",
                  method: "notifications/initialized",
                }) + "\n")
                proc.stdin.write(JSON.stringify({
                  jsonrpc: "2.0",
                  id: 2,
                  method: "tools/list",
                  params: {},
                }) + "\n")
                proc.stdin.flush()
              } else if (msg.id === 2) {
                // tools/list response
                clearTimeout(timer)
                proc.kill()
                const res = msg.result as McpToolsListResult
                resolve((res.tools ?? []).map(t => ({
                  name: t.name,
                  description: t.description ?? "",
                  inputSchema: t.inputSchema ?? {},
                })))
                return
              }
            } catch {}
          }
        }
      } catch {}
      resolve([])
    }

    readLoop()
  })
}
