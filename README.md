# CARP (Cloudflare AI Rotating Proxy)

CARP 是一個部署在 Cloudflare Workers 上的 AI API 代理服務，提供一個統一的代理層，自動處理金鑰輪換、失敗重試和健康監控。

後端基於 Cloudflare Workers 和 Hono 框架，前端使用 Vue 3，資料庫為 Cloudflare D1。

## 核心功能
- **🔑 金鑰池管理**：支援為每個 AI 供應商配置多個 API 金鑰，系統自動在金鑰之間進行輪換，平衡負載並提高配額上限
- **🔄 智能重試機制**：當請求失敗時（如速率限制、金鑰失效等），自動使用其他可用金鑰重試，最大化請求成功率
- **💚 金鑰健康檢測**：當失敗次數「超過」閾值（`max_key_failures`）時，會自動標記為 `invalid` 並從輪換池中移除
- **📊 請求日誌與統計**：詳細記錄每次 API 請求的供應商、金鑰、狀態、回應時間等資訊，提供完整的使用追蹤和分析能力
- **🎨 Web 管理介面**：輕鬆管理供應商、金鑰配置，查看請求日誌和統計圖表
- **⚡ Serverless**：部署在 Cloudflare Workers 上，不需要 24 小時運行的伺服器，免費開始

## 系統架構
- **Cloudflare Worker**：處理代理請求、管理 API 與排程任務。
- **Cloudflare D1**：儲存系統設定、供應商資料、API 金鑰與請求日誌。
- **Scheduled Cron**：每日 00:00 UTC 觸發排程，清除超過 7 天的日誌。

## 快速開始

### 前置需求
- Node.js 20+
- Cloudflare Account

### 安裝與本地開發
```bash
# 1. 安裝後端相依
npm install

# 2. 設定本地環境變數
# 建立或編輯 .dev.vars，填入 AUTH_TOKEN
echo 'AUTH_TOKEN="your-secret-token-here"' > .dev.vars

# 3. 套用資料庫遷移
npm run db:migrate:local

# 4. 啟動本地開發
npm run dev
```

### 環境變數與綁定
| 名稱 | 說明 |
| --- | --- |
| `AUTH_TOKEN` | 基於 Bearer Token 的授權密鑰 |

調整 `wrangler.jsonc` 後請執行：
```bash
npm run cf-typegen
```
以重新生成 `worker-configuration.d.ts`。

## Web 管理介面

打開瀏覽器並訪問 <http://localhost:5173>（PORT 為 Web 設定，預設為 5173）

首次造訪時，系統會要求您輸入認證令牌（即您在 `.dev.vars` 或 Cloudflare Secrets 中設定的 `AUTH_TOKEN`）。

### 主要功能
- **Dashboard**：顯示總請求數、成功率、失敗率、回應時間與請求趨勢圖。
- **Providers / Provider Keys**：管理供應商與 API 金鑰。
- **Logs**：查看所有代理請求的詳細記錄。
- **Settings**：調整系統參數（最大重試次數、失敗閾值等）。

### Proxy API
- 基礎路徑：`/proxy/:provider/*`
- Bearer Token：請於 `Authorization: Bearer <AUTH_TOKEN>` 送出
- 執行流程：
  1. 依供應商名稱載入設定；若停用將回傳 403
  2. 依 LRU（Least Recently Used）取出至多 3 把最久未使用金鑰，再隨機選擇其中一把
  3. 同步轉發原始 HTTP 方法、查詢參數與 Body
  4. 若回傳 401 / 429 / 5xx，會換下一把金鑰並重試最多 `max_attempts` 次
  5. 將成功或失敗統計寫入 D1

#### Example
```bash
curl -X POST "http://localhost:5173/proxy/openai/v1/chat/completions" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
        "model": "gpt-5-mini",
        "messages": [{ "role": "user", "content": "Hi" }]
      }'
```

## 部署

### 1. 設定 Secrets（環境變數）

設定生產環境的認證令牌。

```bash
npx wrangler secret put AUTH_TOKEN
```

### 2. 更新 wrangler.jsonc 中的 database_id
開啟 `wrangler.jsonc` 檔案，找到 `d1_databases` 區塊，替換為您的 `database_id`

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "carp-db",
      "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // 替換為您的 database_id
      "migrations_dir": "migrations"
    }
  ]
}
```

### 3. 資料庫遷移
將資料庫結構部署到您的 Cloudflare D1 資料庫

```bash
npm run db:migrate:remote
```

### 4. 部署到 Cloudflare Workers
```bash
npm run deploy
```
