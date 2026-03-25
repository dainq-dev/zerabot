import {
  Bot, Brain, Cpu, Zap, Network, Globe, Database, Server, Code2, Terminal,
  Search, Eye, FileText, BarChart2, TrendingUp, Activity, Monitor, Shield, Lock,
  MessageSquare, Send, Inbox, Mail, Bell,
  GitBranch, Layers, Package, Wrench, Settings,
  Star, Sparkles, Lightbulb, Target, FlaskConical, Microscope, Workflow,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface AgentIconDef {
  id: string
  label: string
  icon: LucideIcon
}

export const AGENT_ICONS: AgentIconDef[] = [
  // AI / Compute
  { id: "Bot",         label: "Robot",        icon: Bot },
  { id: "Brain",       label: "Não",          icon: Brain },
  { id: "Cpu",         label: "CPU",          icon: Cpu },
  { id: "Sparkles",    label: "Thông minh",   icon: Sparkles },
  { id: "Zap",         label: "Tốc độ",       icon: Zap },
  { id: "Lightbulb",   label: "Ý tưởng",      icon: Lightbulb },

  // Data / Infrastructure
  { id: "Database",    label: "Cơ sở dữ liệu", icon: Database },
  { id: "Server",      label: "Máy chủ",      icon: Server },
  { id: "Network",     label: "Mạng",         icon: Network },
  { id: "Layers",      label: "Tầng",         icon: Layers },
  { id: "Package",     label: "Gói",          icon: Package },
  { id: "Globe",       label: "Toàn cầu",     icon: Globe },

  // Dev / Code
  { id: "Code2",       label: "Code",         icon: Code2 },
  { id: "Terminal",    label: "Terminal",     icon: Terminal },
  { id: "GitBranch",   label: "Git",          icon: GitBranch },
  { id: "Workflow",    label: "Quy trình",    icon: Workflow },
  { id: "Wrench",      label: "Công cụ",      icon: Wrench },
  { id: "Settings",    label: "Cài đặt",      icon: Settings },

  // Analysis / Monitor
  { id: "Search",      label: "Tìm kiếm",     icon: Search },
  { id: "Eye",         label: "Quan sát",     icon: Eye },
  { id: "Monitor",     label: "Màn hình",     icon: Monitor },
  { id: "Activity",    label: "Hoạt động",    icon: Activity },
  { id: "BarChart2",   label: "Biểu đồ",      icon: BarChart2 },
  { id: "TrendingUp",  label: "Xu hướng",     icon: TrendingUp },
  { id: "Target",      label: "Mục tiêu",     icon: Target },

  // Communication
  { id: "MessageSquare", label: "Tin nhắn",   icon: MessageSquare },
  { id: "Send",        label: "Gửi",          icon: Send },
  { id: "Inbox",       label: "Hộp thư",      icon: Inbox },
  { id: "Mail",        label: "Email",        icon: Mail },
  { id: "Bell",        label: "Thông báo",    icon: Bell },

  // Document
  { id: "FileText",    label: "Tài liệu",     icon: FileText },

  // Security
  { id: "Shield",      label: "Bảo vệ",       icon: Shield },
  { id: "Lock",        label: "Khóa",         icon: Lock },

  // Science
  { id: "FlaskConical", label: "Thí nghiệm",  icon: FlaskConical },
  { id: "Microscope",  label: "Nghiên cứu",   icon: Microscope },

  // Special
  { id: "Star",        label: "Nổi bật",      icon: Star },
]

export const DEFAULT_AGENT_ICON = "Bot"

/** Lấy LucideIcon từ id string. Fallback về Bot nếu không tìm thấy. */
export function getAgentIcon(id?: string | null): LucideIcon {
  return AGENT_ICONS.find(i => i.id === id)?.icon ?? Bot
}
