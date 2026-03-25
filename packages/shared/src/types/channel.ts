export type ChannelId = "telegram" | "discord" | "slack" | "mattermost" | "webhook" | "email"
export type ChannelStatus = "connected" | "disconnected" | "error" | "testing"

export interface RoutingRule {
  eventType: "agent.alerts" | "cron.notifications" | "reports" | "user.messages"
  enabled: boolean
  agentId?: string  // for user.messages routing
}

export interface TelegramConfig {
  botToken: string
  dmPolicy: "allowlist" | "all"
  allowFrom: string[]
}

export interface DiscordConfig {
  token: string
  guildId: string
  defaultChannel: string
}

export interface SlackConfig {
  botToken: string
  signingSecret: string
  defaultChannel: string
}

export interface MattermostConfig {
  serverUrl: string
  botToken: string
  defaultChannelId: string
  teamId: string
  webhookToken?: string
  tlsVerify: boolean
}

export interface WebhookConfig {
  url: string
  authHeader?: string
  payloadTemplate?: string
}

export interface EmailConfig {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  from: string
  to: string[]
}

export type ChannelConfig =
  | TelegramConfig
  | DiscordConfig
  | SlackConfig
  | MattermostConfig
  | WebhookConfig
  | EmailConfig

export interface Channel {
  id: ChannelId
  name: string
  icon?: string
  config: ChannelConfig
  routing: RoutingRule[]
  enabled: boolean
  status?: ChannelStatus
  lastTestedAt?: number
  updatedAt: number
}
