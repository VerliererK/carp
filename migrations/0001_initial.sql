-- System configuration key-value store
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- LLM API providers (OpenAI, Anthropic, etc.)
CREATE TABLE providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,            -- Provider identifier (e.g., "openai", "anthropic")
  type TEXT NOT NULL DEFAULT 'openai',  -- Provider type (e.g., "openai", "anthropic", "gemini")
  base_url TEXT NOT NULL,               -- Base URL for API requests
  custom_headers TEXT,                  -- JSON object of custom headers
  test_path TEXT,                       -- Optional API path for testing connectivity (e.g., "/v1/chat/completions")
  test_model TEXT,                      -- Optional model for testing connectivity (e.g., "gpt-5")

  enabled INTEGER DEFAULT 1 NOT NULL,   -- 0 = disabled, 1 = enabled
  
  CHECK (enabled IN (0, 1))
);

-- API keys pool of provider
CREATE TABLE api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL,
  key TEXT NOT NULL,                        -- The actual API key
  status TEXT DEFAULT 'active' NOT NULL,    -- 'active' or 'invalid'
  total_count INTEGER DEFAULT 0 NOT NULL,
  failure_count INTEGER DEFAULT 0 NOT NULL,
  last_used TIMESTAMP,

  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  UNIQUE(provider_id, key)
);

-- Indexes for frequent queries
CREATE INDEX idx_api_keys_provider_status ON api_keys(provider_id, status);
CREATE INDEX idx_api_keys_provider_status_last_used ON api_keys(provider_id, status, last_used);

-- Request logs for monitoring and statistics
CREATE TABLE request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL,
  api_key_id INTEGER NOT NULL,

  url_path TEXT NOT NULL,             -- Request path
  model TEXT,                         -- LLM model used (e.g., "gpt-5")
  status_code INTEGER NOT NULL,       -- HTTP status code
  success INTEGER NOT NULL,           -- 0 = failed, 1 = succeeded
  duration INTEGER NOT NULL,          -- Request duration in milliseconds
  error_msg TEXT,                     -- Error message if failed
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,

  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
  CHECK (success IN (0, 1))
);

-- Indexes for analytics and monitoring queries
CREATE INDEX idx_request_logs_api_key_id ON request_logs(api_key_id);
CREATE INDEX idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX idx_request_logs_provider_created ON request_logs(provider_id, created_at);
