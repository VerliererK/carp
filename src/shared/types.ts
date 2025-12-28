// System configuration key-value store
export interface SystemSetting {
  key: string;
  value: string;
}

// LLM API providers (OpenAI, Gemini, etc.)
export interface Provider {
  id: number;
  name: string;            // Provider identifier (e.g., "openai", "gemini")
  type: string;            // API type (e.g., "openai", "gemini")
  base_url: string;        // Base URL for API requests
  custom_headers?: string | null; // JSON object of custom headers
  test_path?: string | null;      // Path to test API key validity
  test_model?: string | null;     // Model to use for testing
  enabled: number;         // 0 = disabled, 1 = enabled
}

// API keys pool of provider
export interface ApiKey {
  id: number;
  provider_id: number;
  key: string;                    // The actual API key
  status: 'active' | 'invalid';   // 'active' or 'invalid'
  total_count: number;
  failure_count: number;
  last_used?: string;             // TIMESTAMP
}

// Request logs for monitoring and statistics
export interface RequestLog {
  id: number;
  provider_id: number;
  api_key_id: number;
  url_path: string;          // Request path
  model?: string;            // LLM model used (e.g., "gpt-5")
  status_code: number;       // HTTP status code
  success: number;           // 0 = failed, 1 = succeeded
  duration: number;          // Request duration in milliseconds
  error_msg?: string;        // Error message if failed
  created_at: string;        // DATETIME
}

export interface RequestStats {
  total: number;
  success: number;
  failed: number;
  avg_duration: number;
}

export interface TimeSeriesStats {
  period: string;             // '1989-06-04T00:00:00Z' (hourly) or '1989-06-04' (daily)
  total: number;
  success: number;
  failed: number;
  avg_duration: number;
}
