/**
 * Pre-built agent templates for common crawl / research use-cases.
 *
 * Templates are static data (no DB needed — rarely change).
 * POST /:id/use creates a real Agent from the template and returns it.
 */

import { upsertAgent, getAgentById } from "../db/queries"
import type { Agent } from "@zerobot/shared"

// ── Template definitions ──────────────────────────────────────────────────────

interface AgentTemplate {
  id: string
  name: string
  emoji: string
  description: string
  toolsProfile: Agent["toolsProfile"]
  model: string
  soul: string
  mission: string
  instructions: string
  tags: string[]
}

const TEMPLATES: AgentTemplate[] = [
  {
    id: "news-crawler-vn",
    name: "News Crawler VN",
    emoji: "📰",
    description: "Crawl tin tức từ VnExpress, Tuổi Trẻ, CafeF và các nguồn Việt Nam chính thống.",
    toolsProfile: "crawl",
    model: "anthropic/claude-haiku-4-5",
    soul: "Bạn là một công cụ thu thập dữ liệu tự động, chính xác và trung lập.",
    mission: "Thu thập tin tức mới nhất từ các nguồn báo chí Việt Nam.",
    instructions: `Quy trình crawl tin tức:
1. Dùng web_search để tìm tin tức mới nhất theo chủ đề được yêu cầu
2. Dùng firecrawl_scrape để lấy nội dung đầy đủ của từng bài
3. Chuẩn hoá dữ liệu theo cấu trúc JSON: { title, url, content, published_at, source }
4. POST kết quả tới: POST http://localhost:3001/api/data/ingest

Nguồn ưu tiên: vnexpress.net, tuoitre.vn, cafef.vn, dantri.com.vn, thanhnien.vn

Định dạng output:
{
  "source": "vnexpress",
  "category": "news",
  "items": [{ "url": "...", "title": "...", "content": "...", "published_at": <timestamp ms> }]
}`,
    tags: ["crawl", "news", "vietnam"],
  },
  {
    id: "gold-price-tracker",
    name: "Gold Price Tracker",
    emoji: "🏅",
    description: "Theo dõi giá vàng SJC, PNJ và tỷ giá ngân hàng Việt Nam theo thời gian thực.",
    toolsProfile: "research",
    model: "anthropic/claude-haiku-4-5",
    soul: "Bạn là chuyên gia tài chính, chính xác và cập nhật liên tục.",
    mission: "Lấy giá vàng và tỷ giá hiện tại từ các nguồn chính thống.",
    instructions: `Quy trình lấy giá:
1. Dùng api_fetch cho các endpoint JSON trực tiếp:
   - SJC: https://sjc.com.vn/GoldPrice/Services/PriceService.ashx
   - Vietcombank: https://vietcombank.com.vn/vi/KHCN/Cong-cu-Tien-ich/Ty-gia
2. Dùng web_fetch cho trang PNJ nếu cần
3. Parse và chuẩn hoá dữ liệu

Output JSON:
{
  "source": "sjc",
  "category": "gold",
  "items": [{ "title": "Giá vàng SJC", "structured_data": { "buy": <number>, "sell": <number>, "unit": "VND/chỉ" }, "published_at": <now> }]
}
POST tới http://localhost:3001/api/data/ingest`,
    tags: ["finance", "gold", "realtime"],
  },
  {
    id: "market-researcher",
    name: "Market Researcher",
    emoji: "📊",
    description: "Phân tích thị trường, xu hướng ngành, tổng hợp báo cáo từ nhiều nguồn.",
    toolsProfile: "research",
    model: "anthropic/claude-sonnet-4-6",
    soul: "Bạn là nhà phân tích chiến lược, tư duy hệ thống và dựa hoàn toàn vào dữ liệu thực.",
    mission: "Nghiên cứu và phân tích thị trường dựa trên dữ liệu thu thập từ web.",
    instructions: `Quy trình research:
1. web_search để tìm báo cáo, số liệu, tin tức liên quan
2. firecrawl_scrape để đọc nội dung đầy đủ các nguồn quan trọng
3. Tổng hợp và phân tích — chỉ dùng thông tin đã thu thập, không bịa
4. Trình bày kết quả theo cấu trúc: Tóm tắt → Số liệu chính → Phân tích → Khuyến nghị

Nguồn tham khảo: vietstock.vn, cafef.vn, vneconomy.vn, tinnhanhchungkhoan.vn`,
    tags: ["research", "analysis", "market"],
  },
  {
    id: "data-aggregator",
    name: "Data Aggregator",
    emoji: "🗄️",
    description: "Tổng hợp dữ liệu từ nhiều nguồn JSON API, chuẩn hoá và nhập vào hệ thống.",
    toolsProfile: "crawl",
    model: "anthropic/claude-haiku-4-5",
    soul: "Bạn là pipeline xử lý dữ liệu tự động, chính xác và không sai sót.",
    mission: "Gom dữ liệu từ nhiều nguồn API, chuẩn hoá schema và ingest vào hệ thống.",
    instructions: `Quy trình aggregation:
1. Nhận danh sách nguồn cần lấy dữ liệu
2. Với mỗi nguồn: dùng api_fetch (cho JSON API) hoặc web_fetch (cho trang web)
3. Parse, validate và chuẩn hoá về schema chung
4. Loại bỏ duplicate (kiểm tra url hoặc title+source)
5. Gom thành 1 payload và POST lên ingest API

Schema chuẩn:
{
  "source": "<tên nguồn>",
  "category": "<loại dữ liệu>",
  "items": [{ "url", "title", "content", "structured_data": {}, "published_at" }]
}
POST http://localhost:3001/api/data/ingest`,
    tags: ["crawl", "aggregation", "pipeline"],
  },
]

// ── Route handler ─────────────────────────────────────────────────────────────

export function handleAgentTemplates(req: Request, url: URL): Response {
  const subpath = url.pathname.replace("/api/agent-templates", "")

  // GET /api/agent-templates
  if (req.method === "GET" && (subpath === "" || subpath === "/")) {
    const tag = url.searchParams.get("tag")
    const templates = tag
      ? TEMPLATES.filter(t => t.tags.includes(tag))
      : TEMPLATES
    return json({ templates: templates.map(templateSummary) })
  }

  // GET /api/agent-templates/:id
  const getMatch = subpath.match(/^\/([^/]+)$/)
  if (req.method === "GET" && getMatch) {
    const tpl = TEMPLATES.find(t => t.id === getMatch[1])
    if (!tpl) return json({ error: "Template not found" }, 404)
    return json({ template: tpl })
  }

  // POST /api/agent-templates/:id/use — create an Agent from this template
  const useMatch = subpath.match(/^\/([^/]+)\/use$/)
  if (req.method === "POST" && useMatch) {
    const tpl = TEMPLATES.find(t => t.id === useMatch[1])
    if (!tpl) return json({ error: "Template not found" }, 404)

    // Generate unique agent id — append timestamp if already exists
    let agentId = tpl.id
    if (getAgentById(agentId)) {
      agentId = `${tpl.id}-${Date.now().toString(36)}`
    }

    const now = Date.now()
    const agent: Agent = {
      id: agentId,
      name: tpl.name,
      emoji: tpl.emoji,
      model: tpl.model,
      soul: tpl.soul,
      mission: tpl.mission,
      instructions: tpl.instructions,
      toolsProfile: tpl.toolsProfile,
      toolsAllow: [],
      toolsDeny: [],
      allowAgents: [],
      mcpServers: [],
      limits: { maxRamMb: 100, maxTokensPerHour: 10_000, maxConcurrentTasks: 3 },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    }

    upsertAgent(agent)
    return json({ agent }, 201)
  }

  return json({ error: "Not found" }, 404)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function templateSummary(t: AgentTemplate) {
  return {
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    description: t.description,
    toolsProfile: t.toolsProfile,
    model: t.model,
    tags: t.tags,
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
