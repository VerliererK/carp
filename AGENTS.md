# CLAUDE.md

本檔案為 Claude Code (claude.ai/code) 在此專案中的操作指引。

**語言偏好：繁體中文**

## 專案概覽

CARP (Cloudflare AI Rotating Proxy) 是部署於 Cloudflare Workers 的 AI API 代理服務，提供自動 key 輪換、失敗重試與健康監控等功能。

## 技術棧

- **後端**: Cloudflare Workers + Hono 框架
- **前端**: Vue 3 + Tailwind CSS v4 + Vue Router
- **資料庫**: Cloudflare D1 (SQLite)
- **建置**: Vite + @cloudflare/vite-plugin

## 常用指令

```bash
npm install                # 安裝依賴
npm run dev                # 啟動本地開發（前端 Vite）
npm run preview            # 建置後預覽（build + wrangler dev）
npm run type-check         # 型別檢查
npm run build              # 正式建置（先 type-check 再 build-only）
npm run deploy             # 部署至 Cloudflare Workers
npm run db:migrate:local   # 套用本地 DB 遷移
npm run db:migrate:remote  # 套用正式環境 DB 遷移
npm run cf-typegen         # 修改 wrangler.jsonc 後重新產生 Worker 型別
```

## 架構

### 目錄結構

```
src/
├── worker/          # Cloudflare Worker（後端）
│   ├── index.ts     # Worker 進入點、路由、Auth 中介層
│   ├── api/         # API 路由處理
│   │   ├── proxy.ts # Proxy 處理（key 輪換與重試邏輯）
│   │   ├── gateway.ts # OpenAI 相容 Gateway（/v1/* 路由，model→provider 路由）
│   │   └── admin/   # 管理 API（providers、keys、models、logs、settings、stats）
│   └── lib/
│       ├── db.ts    # 資料庫存取層
│       └── configs.ts
├── web/             # Vue 3 前端
│   ├── views/       # 頁面元件（Dashboard、Providers、ProviderKeys、Models、Logs）
│   ├── components/  # 可重用 UI 元件
│   ├── composables/ # Vue composables
│   ├── api.ts       # API 用戶端函式
│   ├── router.ts    # Vue Router 設定
│   └── style.css    # Ethereal Flow 語意化 CSS 變數
└── shared/          # Worker 與前端共用
    └── types.ts     # TypeScript 介面（Provider、ApiKey、Model、ModelMapping、RequestLog 等）
```

### 路徑別名

- `@shared` → `src/shared`
- `@` → `src/web`

### 核心概念

**Proxy 流程** (`src/worker/api/proxy.ts`)：
1. 請求進入 `/proxy/:provider/*`
2. 驗證 provider 存在且已啟用
3. LRU 策略選出最多 3 把最久未用的 key，隨機取其一
4. 將請求轉發至 provider 的 `base_url`，附帶選中的 API key
5. 遇到 401/429/5xx 錯誤時，以不同 key 重試（上限 `max_attempts`）
6. 連續失敗超過 `max_key_failures` 次的 key 標記為 `invalid`

**Gateway 流程** (`src/worker/api/gateway.ts`)：
1. 請求進入 `/v1/*`（OpenAI 相容端點）
2. 解析 request body 中的 `model` 欄位
3. 查詢 `models` + `model_mappings` 表，找出該 model 對應的所有啟用中 provider mapping
4. 隨機選取一個 mapping，以實際 `model_name` 覆寫 body
5. 內部轉發至 `/proxy/:provider/*`，複用既有的 key 輪換與重試邏輯

**資料庫層** (`src/worker/lib/db.ts`)：
- `systemSettings`：Key-Value 設定存儲
- `providers`：LLM provider 設定（name、type、base_url、custom_headers）
- `apiKeys`：API key 池管理，含 LRU 追蹤與健康狀態
- `models`：模型定義（name、enabled），對應 Gateway 虛擬模型名稱
- `modelMappings`：模型到 provider 的路由映射（model_id → provider_id + model_name）
- `requestLogs`：請求日誌，用於監控與統計

**Provider 類型**：支援 `openai`（Bearer token 驗證）與 `gemini`（x-goog-api-key header 或 query param）

### 環境變數

- `AUTH_TOKEN`：API 驗證用 Bearer token（本地設於 `.dev.vars`，正式環境使用 Cloudflare Secrets）

### 資料庫 Schema

位於 `migrations/`。資料表：`system_settings`、`providers`、`api_keys`、`request_logs`、`models`、`model_mappings`。

### 排程任務

每日 cron（UTC 00:00）清理超過 7 天的請求日誌。

## 程式碼準則

- 盡量小步修改，避免一次大量重構。每次變更保持最小範圍，方便 review。
- 共用型別一律從 `@shared/types` 引入。
- **Worker API**：新增路由放在 `src/worker/api`，共用 DB 操作集中 `src/worker/lib/db.ts`，優先擴充現有 helper。
- **Proxy**：`/proxy/:provider/*` 需帶 `AUTH_TOKEN`，遵循 provider/base_url + key pool 選擇邏輯。
- **Gateway**：`/v1/*` 需帶 `AUTH_TOKEN`，遵循 model→provider mapping 路由邏輯，內部轉發至 proxy。

## 前端設計規範

- **色彩與尺寸**：透過 `style.css` 的 `@theme` 區塊，CSS 變數已映射為 Tailwind v4 theme utility（如 `bg-card`、`text-text-primary`、`border-border-subtle`），直接使用這些 utility class，不要用 arbitrary value 語法（`bg-[--bg-card]`）。避免新增隨機 Hex。Chart.js 等 canvas 環境無法讀取 CSS 變數時，可使用硬編碼色碼。遮罩與微透明效果可使用 Tailwind 的 `black/`、`white/` 透明度修飾（如 `bg-black/20`、`ring-black/5`）。
- **字體**：沿用系統字體堆疊（`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif`），避免自訂字體與過粗字重。
- **版面**：保持 Apple 風格留白與 16px 基準間距；容器圓角以 `rounded-2xl`（16px）為主，按鈕與輸入框可用 `rounded-xl`（12px），大型容器可用 `rounded-3xl`（24px）。陰影使用變數 `--shadow-sm`、`--shadow-md`、`--shadow-float`。Modal 遮罩可搭配 `backdrop-blur`。
- **元件**：卡片/按鈕/標籤優先套用設計範例的 Tailwind class（如 `rounded-2xl border bg-card shadow-float`），狀態色對應 success/mint、warning/amber、error/rose。
- **動效**：全域 `background-color` 與 `border-color` 過渡為 300ms ease（定義於 `style.css`）。元件級過渡使用 200~300ms（`duration-200` / `duration-300`），easing 以 `ease-out` 為主，亦可搭配自訂 `cubic-bezier`。避免過度動畫與高對比閃爍，保留 WCAG 對比。
