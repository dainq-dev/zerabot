/**
 * Agent sync: writes per-agent OpenClaw workspace files when agent is created/updated.
 * Each agent gets a workspace at ~/.openclaw/agents/{agentId}/
 *
 * OpenClaw model: agents share a single gateway — no per-agent ports needed.
 */

import { writeAgentWorkspace } from "../openclaw/config"
import { createLogger } from "../utils/logger"
import type { Agent } from "@zerobot/shared"

const log = createLogger("AgentSync")

export async function syncAgentConfig(agent: Agent): Promise<void> {
  const { join } = await import("path")
  const { homedir } = await import("os")
  const openclawHome = process.env.OPENCLAW_HOME ?? join(homedir(), ".openclaw")
  const configDir = join(openclawHome, "agents", agent.id)

  await writeAgentWorkspace(agent, configDir)
  log.info("Agent workspace synced", { agentId: agent.id, configDir })
}
