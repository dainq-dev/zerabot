"use client"

import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { channelsApi } from "@/lib/api"
import type { Channel } from "@zerobot/shared"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  Send, CheckCircle2, XCircle, Circle, AlertTriangle,
  Slack,
  Layers,
  Webhook,
  Mail,
  MessageSquareText
} from "lucide-react"

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  telegram: <Send />,
  discord: <MessageSquareText />,
  slack: <Slack />,
  mattermost: <Layers />,
  webhook: <Webhook />,
  email: <Mail />,
};

const CHANNEL_DEFS: { id: Channel["id"]; name: string; priority: number }[] = [
  { id: "telegram", name: "Telegram", priority: 1 },
  { id: "discord", name: "Discord", priority: 1 },
  { id: "slack", name: "Slack", priority: 2 },
  { id: "mattermost", name: "Mattermost", priority: 2 },
  { id: "webhook", name: "Webhook", priority: 3 },
  { id: "email", name: "Email", priority: 3 },
]

interface ChannelCardProps {
  def: { id: Channel["id"]; name: string }
  channel?: Channel
}

function ChannelCard({ def, channel }: ChannelCardProps) {
  const [enabled, setEnabled] = useState(channel?.enabled ?? false)
  const [testLoading, setTestLoading] = useState(false)

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Channel>) => channelsApi.update(def.id, data),
    onSuccess: () => toast.success(`${def.name} updated`),
    onError: (err) => toast.error(String(err)),
  })

  const handleToggle = (v: boolean) => {
    setEnabled(v)
    updateMutation.mutate({ enabled: v })
  }

  const handleTest = async () => {
    setTestLoading(true)
    try {
      const r = await channelsApi.test(def.id)
      toast.success(r.message)
    } catch (err) {
      toast.error(String(err))
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <Card className={cn(
      "p-4 bg-card border card-hover",
      enabled ? "border-border" : "border-border/40 opacity-60"
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{CHANNEL_ICONS[def.id]}</span>
          <div>
            <div className="font-bold text-sm">{def.name}</div>
            <div className="text-[10px] text-muted-foreground">{def.id}</div>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {/* Config fields based on channel type */}
      {def.id === "telegram" && (
        <ChannelConfigFields
          fields={[
            { key: "bot_token", label: "Bot Token", secret: true, placeholder: "1234567890:AAF..." },
          ]}
          config={channel?.config as unknown as Record<string, string> ?? {}}
          channelId={def.id}
        />
      )}
      {def.id === "discord" && (
        <ChannelConfigFields
          fields={[
            { key: "token", label: "Bot Token", secret: true },
            { key: "guild_id", label: "Guild ID" },
            { key: "default_channel", label: "Default Channel", placeholder: "general" },
          ]}
          config={channel?.config as unknown as Record<string, string> ?? {}}
          channelId={def.id}
        />
      )}
      {def.id === "slack" && (
        <ChannelConfigFields
          fields={[
            { key: "bot_token", label: "Bot Token", secret: true },
            { key: "signing_secret", label: "Signing Secret", secret: true },
            { key: "default_channel", label: "Default Channel" },
          ]}
          config={channel?.config as unknown as Record<string, string> ?? {}}
          channelId={def.id}
        />
      )}
      {def.id === "mattermost" && (
        <ChannelConfigFields
          fields={[
            { key: "server_url", label: "Server URL", placeholder: "https://chat.example.com" },
            { key: "token", label: "Bot Token", secret: true },
            { key: "team_id", label: "Team ID" },
            { key: "default_channel", label: "Default Channel" },
          ]}
          config={channel?.config as unknown as Record<string, string> ?? {}}
          channelId={def.id}
        />
      )}

      {enabled && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full h-7 text-xs gap-1.5"
          onClick={handleTest}
          disabled={testLoading}
        >
          <Send className="w-3 h-3" />
          {testLoading ? "Testing..." : "Test Connection"}
        </Button>
      )}
    </Card>
  )
}

function ChannelConfigFields({
  fields, config, channelId
}: {
  fields: { key: string; label: string; secret?: boolean; placeholder?: string }[]
  config: Record<string, string>
  channelId: string
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map(f => [f.key, config[f.key] ?? ""]))
  )

  const mutation = useMutation({
    mutationFn: (cfg: Record<string, string>) => channelsApi.update(channelId as Channel["id"], { config: cfg }),
    onSuccess: () => toast.success("Config saved"),
    onError: (err) => toast.error(String(err)),
  })

  return (
    <div className="space-y-2 mb-2">
      {fields.map(f => (
        <div key={f.key}>
          <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
          <Input
            type={f.secret ? "password" : "text"}
            value={values[f.key] ?? ""}
            onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
            onBlur={() => mutation.mutate(values)}
            className="mt-0.5 h-7 text-xs font-mono"
            placeholder={f.placeholder}
          />
        </div>
      ))}
    </div>
  )
}

export default function ChannelsPage() {
  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: channelsApi.list,
  })

  const channelMap = new Map(channels.map(c => [c.id, c]))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold tracking-wide">Multi-Channel Gateway</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure notification channels for agents and cron jobs
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)
          : CHANNEL_DEFS.map(def => (
              <ChannelCard key={def.id} def={def} channel={channelMap.get(def.id)} />
            ))
        }
      </div>
    </div>
  )
}
