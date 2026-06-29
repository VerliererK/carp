import type { SystemSetting, Provider, ProviderWithKeyCounts, ApiKey, RequestLog, RequestStats, TimeSeriesStats, Model, ModelMapping, ModelMappingWithProvider } from '@shared/types';

// System Settings
export const systemSettings = {
  async get(db: D1Database, key: string): Promise<SystemSetting | null> {
    const result = await db.prepare('SELECT * FROM system_settings WHERE key = ?').bind(key).first<SystemSetting>();
    return result;
  },

  async set(db: D1Database, key: string, value: string): Promise<void> {
    await db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)').bind(key, value).run();
  },

  async delete(db: D1Database, key: string): Promise<void> {
    await db.prepare('DELETE FROM system_settings WHERE key = ?').bind(key).run();
  },

  async getAll(db: D1Database): Promise<SystemSetting[]> {
    const result = await db.prepare('SELECT * FROM system_settings').all<SystemSetting>();
    return result.results;
  },
};

// Providers
export const providers = {
  async create(db: D1Database, data: Omit<Provider, 'id'>): Promise<Provider> {
    const result = await db.prepare(
      `INSERT INTO providers (
        name,
        type,
        base_url,
        custom_headers,
        test_path,
        test_model,
        enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
    ).bind(
      data.name,
      data.type || 'openai',
      data.base_url,
      data.custom_headers ?? null,
      data.test_path ?? null,
      data.test_model ?? null,
      data.enabled ?? 1
    ).first<Provider>();

    return result!;
  },

  async list(db: D1Database): Promise<ProviderWithKeyCounts[]> {
    const result = await db.prepare(`
      SELECT 
        p.*,
        COUNT(k.id) AS keys_count,
        COALESCE(SUM(CASE WHEN k.status = 'active' THEN 1 ELSE 0 END), 0) AS active_key_count,
        COALESCE(SUM(CASE WHEN k.status = 'invalid' THEN 1 ELSE 0 END), 0) AS invalid_key_count
      FROM providers p
      LEFT JOIN api_keys k ON k.provider_id = p.id
      GROUP BY p.id
      ORDER BY p.id
    `).all<ProviderWithKeyCounts>();
    return result.results;
  },

  async get(db: D1Database, id: number): Promise<ProviderWithKeyCounts | null> {
    const result = await db.prepare(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM api_keys k WHERE k.provider_id = p.id) AS keys_count,
        COALESCE((SELECT SUM(CASE WHEN k.status = 'active' THEN 1 ELSE 0 END) FROM api_keys k WHERE k.provider_id = p.id), 0) AS active_key_count,
        COALESCE((SELECT SUM(CASE WHEN k.status = 'invalid' THEN 1 ELSE 0 END) FROM api_keys k WHERE k.provider_id = p.id), 0) AS invalid_key_count
      FROM providers p
      WHERE p.id = ?
    `).bind(id).first<ProviderWithKeyCounts>();
    return result ?? null;
  },

  async getByName(db: D1Database, name: string): Promise<ProviderWithKeyCounts | null> {
    const result = await db.prepare(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM api_keys k WHERE k.provider_id = p.id) AS keys_count,
        COALESCE((SELECT SUM(CASE WHEN k.status = 'active' THEN 1 ELSE 0 END) FROM api_keys k WHERE k.provider_id = p.id), 0) AS active_key_count,
        COALESCE((SELECT SUM(CASE WHEN k.status = 'invalid' THEN 1 ELSE 0 END) FROM api_keys k WHERE k.provider_id = p.id), 0) AS invalid_key_count
      FROM providers p
      WHERE p.name = ?
    `).bind(name).first<ProviderWithKeyCounts>();
    return result ?? null;
  },

  async update(db: D1Database, id: number, data: Partial<Omit<Provider, 'id'>>): Promise<void> {
    const allowedFields = ['name', 'type', 'base_url', 'custom_headers', 'test_path', 'test_model', 'enabled'];
    const updates = Object.entries(data)
      .filter(([key]) => allowedFields.includes(key))
      .map(([key]) => `${key} = ?`);

    if (updates.length === 0) return;

    const values = Object.entries(data)
      .filter(([key]) => allowedFields.includes(key))
      .map(([, value]) => value);

    await db.prepare(`UPDATE providers SET ${updates.join(', ')} WHERE id = ?`).bind(...values, id).run();
  },

  async delete(db: D1Database, id: number): Promise<void> {
    await db.prepare('DELETE FROM providers WHERE id = ?').bind(id).run();
  },
};

// API Keys
export const apiKeys = {
  async create(db: D1Database, data: Omit<ApiKey, 'id'>[]): Promise<ApiKey[]> {
    const stmts = data.map(d => db.prepare(
      'INSERT OR IGNORE INTO api_keys (provider_id, key, status, total_count, failure_count, last_used) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
    ).bind(
      d.provider_id,
      d.key,
      d.status || 'active',
      d.total_count || 0,
      d.failure_count || 0,
      d.last_used || null
    ));

    const results = await db.batch<ApiKey>(stmts);
    return results.flatMap(r => r.results);
  },

  async list(db: D1Database, providerId: number, status?: 'active' | 'invalid'): Promise<ApiKey[]> {
    const sql = status
      ? 'SELECT * FROM api_keys WHERE provider_id = ? AND status = ?'
      : 'SELECT * FROM api_keys WHERE provider_id = ?';
    const bindings = status
      ? [providerId, status]
      : [providerId];

    const result = await db.prepare(sql).bind(...bindings).all<ApiKey>();
    return result.results;
  },

  async listByCursor(db: D1Database, providerId: number, cursor: number, limit = 100, status?: 'active' | 'invalid'): Promise<ApiKey[]> {
    limit = Math.min(limit, 100);
    cursor = Math.max(cursor, 0);

    const sql = status
      ? 'SELECT * FROM api_keys WHERE provider_id = ? AND id > ? AND status = ? ORDER BY id ASC LIMIT ?'
      : 'SELECT * FROM api_keys WHERE provider_id = ? AND id > ? ORDER BY id ASC LIMIT ?';

    const bindings = status
      ? [providerId, cursor, status, limit]
      : [providerId, cursor, limit];

    const result = await db.prepare(sql).bind(...bindings).all<ApiKey>();
    return result.results;
  },

  async listWithFilters(
    db: D1Database,
    providerId: number,
    options: {
      limit?: number;
      offset?: number;
      q?: string;
      status?: 'active' | 'invalid';
      sort?: 'status' | 'key' | 'total_count' | 'failure_count' | 'last_used';
      order?: 'asc' | 'desc';
    } = {}
  ): Promise<{ keys: ApiKey[]; total: number }> {
    const limit = Math.min(options.limit ?? 100, 1000);
    const offset = options.offset ?? 0;
    const status = options.status;
    const q = options.q?.trim();

    const conditions: string[] = ['provider_id = ?'];
    const params: any[] = [providerId];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (q) {
      conditions.push('key LIKE ?');
      params.push(`%${q}%`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await db.prepare(
      `SELECT COUNT(*) as total FROM api_keys ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    const order = options.order === 'asc' ? 'ASC' : 'DESC';
    const sort = options.sort ?? 'last_used';

    let orderBy = '';
    switch (sort) {
      case 'status':
      case 'key':
      case 'total_count':
      case 'failure_count': {
        orderBy = `ORDER BY ${sort} ${order}, id ${order}`;
        break;
      }
      case 'last_used':
      default: {
        if (order === 'ASC') {
          orderBy = `ORDER BY (last_used IS NULL) DESC, last_used ASC, id ASC`;
        } else {
          orderBy = `ORDER BY (last_used IS NULL) ASC, last_used DESC, id DESC`;
        }
        break;
      }
    }

    const keysResult = await db.prepare(
      `SELECT * FROM api_keys ${whereClause} ${orderBy} LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all<ApiKey>();

    return { keys: keysResult.results, total };
  },

  async summaryByProvider(
    db: D1Database,
    providerId: number
  ): Promise<{
    total: number;
    active: number;
    invalid: number;
    total_requests: number;
    total_failures: number;
  }> {
    const row = await db.prepare(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
        COALESCE(SUM(CASE WHEN status = 'invalid' THEN 1 ELSE 0 END), 0) AS invalid,
        COALESCE(SUM(total_count), 0) AS total_requests,
        COALESCE(SUM(failure_count), 0) AS total_failures
      FROM api_keys
      WHERE provider_id = ?
    `).bind(providerId).first<{
      total: number;
      active: number;
      invalid: number;
      total_requests: number;
      total_failures: number;
    }>();

    return {
      total: row?.total ?? 0,
      active: row?.active ?? 0,
      invalid: row?.invalid ?? 0,
      total_requests: row?.total_requests ?? 0,
      total_failures: row?.total_failures ?? 0,
    };
  },

  async get(db: D1Database, id: number): Promise<ApiKey | null> {
    const result = await db.prepare('SELECT * FROM api_keys WHERE id = ?').bind(id).first<ApiKey>();
    return result;
  },

  async update(db: D1Database, id: number, data: Partial<Omit<ApiKey, 'id'>>): Promise<void> {
    const allowedFields = ['provider_id', 'key', 'status', 'total_count', 'failure_count', 'last_used'];
    const updates = Object.entries(data)
      .filter(([key]) => allowedFields.includes(key))
      .map(([key]) => `${key} = ?`);

    if (updates.length === 0) return;

    const values = Object.entries(data)
      .filter(([key]) => allowedFields.includes(key))
      .map(([, value]) => value);

    await db.prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`).bind(...values, id).run();
  },

  async delete(db: D1Database, id: number): Promise<void> {
    await db.prepare('DELETE FROM api_keys WHERE id = ?').bind(id).run();
  },

  async deleteKeys(db: D1Database, providerId: number, keys: string[]): Promise<number> {
    const uniqueKeys = Array.from(new Set(keys.map(k => (typeof k === 'string' ? k.trim() : '')).filter(Boolean)));
    if (uniqueKeys.length === 0) return 0;

    // Keep well under SQLite/D1 bind parameter limits.
    const chunkSize = 50;
    const stmts = [];

    for (let i = 0; i < uniqueKeys.length; i += chunkSize) {
      const chunk = uniqueKeys.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');
      const sql = `DELETE FROM api_keys WHERE provider_id = ? AND key IN (${placeholders})`;
      stmts.push(db.prepare(sql).bind(providerId, ...chunk));
    }

    const results = await db.batch(stmts);
    return results.reduce((sum, r) => sum + (r.meta?.changes ?? 0), 0);
  },

  async reset(db: D1Database, id: number): Promise<void> {
    await db.prepare(
      "UPDATE api_keys SET status = 'active', total_count = 0, failure_count = 0, last_used = NULL WHERE id = ?"
    ).bind(id).run();
  },

  async resetByProvider(db: D1Database, providerId: number): Promise<void> {
    await db.prepare(
      "UPDATE api_keys SET status = 'active', total_count = 0, failure_count = 0, last_used = NULL WHERE provider_id = ?"
    ).bind(providerId).run();
  },

  async recordUsage(db: D1Database, id: number, success: boolean, maxFailures: number): Promise<void> {
    if (success) {
      await db.prepare('UPDATE api_keys SET total_count = total_count + 1, failure_count = 0, last_used = strftime("%Y-%m-%dT%H:%M:%SZ", "now") WHERE id = ?')
        .bind(id).run();
    } else {
      await db.prepare(`UPDATE api_keys SET total_count = total_count + 1, failure_count = failure_count + 1, last_used = strftime("%Y-%m-%dT%H:%M:%SZ", "now"), status = CASE WHEN failure_count + 1 > ? THEN 'invalid' ELSE status END WHERE id = ?`)
        .bind(maxFailures, id).run();
    }
  },

  async recordFailure(db: D1Database, id: number, maxFailures: number): Promise<void> {
    await db.prepare(`UPDATE api_keys SET failure_count = failure_count + 1, status = CASE WHEN failure_count + 1 > ? THEN 'invalid' ELSE status END WHERE id = ?`)
      .bind(maxFailures, id).run();
  },

  async resetFailure(db: D1Database, id: number): Promise<void> {
    await db.prepare("UPDATE api_keys SET status = 'active', failure_count = 0 WHERE id = ?")
      .bind(id).run();
  },

  // List least-recently-used active keys (concise alias of the above behavior)
  async listLRU(
    db: D1Database,
    providerId: number,
    options: { limit?: number; excludeIds?: number[] } = {}
  ): Promise<ApiKey[]> {
    const limit = options.limit ?? 3;
    const excludeIds = options.excludeIds ?? [];

    let query = `
      SELECT * FROM api_keys
      WHERE provider_id = ? AND status = 'active'
    `;
    const params: any[] = [providerId];

    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(',');
      query += ` AND id NOT IN (${placeholders})`;
      params.push(...excludeIds);
    }

    query += `
      ORDER BY
        CASE WHEN last_used IS NULL THEN 0 ELSE 1 END,
        last_used ASC
      LIMIT ?
    `;
    params.push(limit);

    const result = await db.prepare(query).bind(...params).all<ApiKey>();
    return result.results;
  },

  // Rate-aware listing: prefer keys with fewer recent requests within a window,
  // then LRU, then random to spread concurrent selection.
  async listRateSafe(
    db: D1Database,
    providerId: number,
    options: {
      windowSec?: number;           // sliding window for recent usage count
      cooldownSec?: number;         // exclude keys with 429 in this cooldown
      limit?: number;
      excludeIds?: number[];
    } = {}
  ): Promise<ApiKey[]> {
    const windowSec = options.windowSec ?? 60;
    const cooldownSec = options.cooldownSec ?? 0;
    const limit = options.limit ?? 3;
    const excludeIds = options.excludeIds ?? [];

    // Build dynamic filters
    const params: any[] = [];

    // CTE counts recent requests per key in the window
    let query = `
      WITH recent AS (
        SELECT api_key_id, COUNT(*) AS recent_count
        FROM request_logs
        WHERE provider_id = ? AND created_at >= datetime('now', ?)
        GROUP BY api_key_id
      )
      SELECT k.*
      FROM api_keys k
      LEFT JOIN recent r ON r.api_key_id = k.id
      WHERE k.provider_id = ? AND k.status = 'active'
    `;
    params.push(providerId, `-${windowSec} seconds`, providerId);

    if (excludeIds.length > 0) {
      const placeholders = excludeIds.map(() => '?').join(',');
      query += ` AND k.id NOT IN (${placeholders})`;
      params.push(...excludeIds);
    }

    if (cooldownSec > 0) {
      query += ` AND NOT EXISTS (
        SELECT 1 FROM request_logs rl
        WHERE rl.api_key_id = k.id
          AND rl.provider_id = k.provider_id
          AND rl.status_code = 429
          AND rl.created_at >= datetime('now', ?)
      )`;
      params.push(`-${cooldownSec} seconds`);
    }

    query += `
      ORDER BY
        COALESCE(r.recent_count, 0) ASC,
        CASE WHEN k.last_used IS NULL THEN 0 ELSE 1 END,
        k.last_used ASC,
        RANDOM()
      LIMIT ?
    `;
    params.push(limit);

    const result = await db.prepare(query).bind(...params).all<ApiKey>();
    return result.results;
  },
};

// Models
export const models = {
  async create(db: D1Database, data: Omit<Model, 'id'>): Promise<Model> {
    const result = await db.prepare(
      'INSERT INTO models (name, enabled) VALUES (?, ?) RETURNING *'
    ).bind(data.name, data.enabled ?? 1).first<Model>();
    return result!;
  },

  async list(db: D1Database): Promise<(Model & { mappings_count: number })[]> {
    const result = await db.prepare(`
      SELECT m.*, COUNT(mm.id) AS mappings_count
      FROM models m
      LEFT JOIN model_mappings mm ON mm.model_id = m.id
      GROUP BY m.id
      ORDER BY m.id
    `).all<Model & { mappings_count: number }>();
    return result.results;
  },

  async getByName(db: D1Database, name: string): Promise<Model | null> {
    const result = await db.prepare('SELECT * FROM models WHERE name = ?').bind(name).first<Model>();
    return result ?? null;
  },

  async update(db: D1Database, id: number, data: Partial<Omit<Model, 'id'>>): Promise<void> {
    const allowedFields = ['name', 'enabled'];
    const updates = Object.entries(data)
      .filter(([key]) => allowedFields.includes(key))
      .map(([key]) => `${key} = ?`);

    if (updates.length === 0) return;

    const values = Object.entries(data)
      .filter(([key]) => allowedFields.includes(key))
      .map(([, value]) => value);

    await db.prepare(`UPDATE models SET ${updates.join(', ')} WHERE id = ?`).bind(...values, id).run();
  },

  async delete(db: D1Database, id: number): Promise<void> {
    await db.prepare('DELETE FROM models WHERE id = ?').bind(id).run();
  },
};

// Model Mappings
export const modelMappings = {
  async create(db: D1Database, data: Omit<ModelMapping, 'id'>): Promise<ModelMapping> {
    const result = await db.prepare(
      'INSERT INTO model_mappings (model_id, provider_id, model_name) VALUES (?, ?, ?) RETURNING *'
    ).bind(data.model_id, data.provider_id, data.model_name).first<ModelMapping>();
    return result!;
  },

  async listByModel(db: D1Database, modelId: number): Promise<ModelMappingWithProvider[]> {
    const result = await db.prepare(`
      SELECT mm.*, p.name AS provider_name, p.enabled AS provider_enabled
      FROM model_mappings mm
      JOIN providers p ON p.id = mm.provider_id
      WHERE mm.model_id = ?
      ORDER BY mm.id
    `).bind(modelId).all<ModelMappingWithProvider>();
    return result.results;
  },

  async get(db: D1Database, id: number): Promise<ModelMapping | null> {
    const result = await db.prepare('SELECT * FROM model_mappings WHERE id = ?').bind(id).first<ModelMapping>();
    return result ?? null;
  },

  async update(db: D1Database, id: number, data: Partial<Omit<ModelMapping, 'id' | 'model_id'>>): Promise<void> {
    const allowedFields = ['provider_id', 'model_name'];
    const updates = Object.entries(data)
      .filter(([key]) => allowedFields.includes(key))
      .map(([key]) => `${key} = ?`);

    if (updates.length === 0) return;

    const values = Object.entries(data)
      .filter(([key]) => allowedFields.includes(key))
      .map(([, value]) => value);

    await db.prepare(`UPDATE model_mappings SET ${updates.join(', ')} WHERE id = ?`).bind(...values, id).run();
  },

  async delete(db: D1Database, id: number): Promise<void> {
    await db.prepare('DELETE FROM model_mappings WHERE id = ?').bind(id).run();
  },

  async resolve(db: D1Database, name: string): Promise<{ provider_name: string; model_name: string }[]> {
    const result = await db.prepare(`
      SELECT p.name AS provider_name, mm.model_name
      FROM model_mappings mm
      JOIN models m ON m.id = mm.model_id
      JOIN providers p ON p.id = mm.provider_id
      WHERE m.name = ? AND m.enabled = 1 AND p.enabled = 1
        AND EXISTS (
          SELECT 1
          FROM api_keys k
          WHERE k.provider_id = p.id AND k.status = 'active'
        )
    `).bind(name).all<{ provider_name: string; model_name: string }>();
    return result.results;
  },
};

// Request Logs
export const requestLogs = {
  async create(db: D1Database, data: Omit<RequestLog, 'id' | 'created_at'>): Promise<RequestLog> {
    const result = await db.prepare(
      'INSERT INTO request_logs (provider_id, api_key_id, url_path, model, status_code, success, duration, error_msg) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *'
    ).bind(
      data.provider_id,
      data.api_key_id,
      data.url_path,
      data.model || null,
      data.status_code,
      data.success,
      data.duration,
      data.error_msg || null
    ).first<RequestLog>();

    return result!;
  },

  async list(db: D1Database, limit = 100, offset = 0): Promise<RequestLog[]> {
    const result = await db.prepare('SELECT * FROM request_logs ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .bind(limit, offset).all<RequestLog>();
    return result.results.map(log => ({
      ...log,
      created_at: log.created_at.replace(' ', 'T') + 'Z'
    }));
  },

  async listWithFilters(
    db: D1Database,
    options: {
      limit?: number;
      offset?: number;
      providerId?: number;
      success?: boolean;
      startDate?: string;
      endDate?: string;
    } = {}
  ): Promise<{ logs: RequestLog[]; total: number }> {
    const limit = Math.min(options.limit ?? 100, 1000);
    const offset = options.offset ?? 0;
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.providerId !== undefined) {
      conditions.push('provider_id = ?');
      params.push(options.providerId);
    }

    if (options.success !== undefined) {
      conditions.push('success = ?');
      params.push(options.success ? 1 : 0);
    }

    if (options.startDate) {
      conditions.push('created_at >= ?');
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push('created_at <= ?');
      params.push(options.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.prepare(
      `SELECT COUNT(*) as total FROM request_logs ${whereClause}`
    ).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    const logsResult = await db.prepare(
      `SELECT * FROM request_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all<RequestLog>();

    return {
      logs: logsResult.results.map(log => ({
        ...log,
        created_at: log.created_at.replace(' ', 'T') + 'Z'
      })),
      total
    };
  },

  async deleteAll(db: D1Database): Promise<void> {
    await db.prepare('DELETE FROM request_logs').run();
  },

  async deleteOlderThan(db: D1Database, days: number): Promise<number> {
    const safeDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
    if (safeDays <= 0) {
      return 0;
    }

    const result = await db
      .prepare("DELETE FROM request_logs WHERE created_at < datetime('now', ?)")
      .bind(`-${safeDays} days`)
      .run();

    return result.meta?.changes ?? 0;
  },

  getTimeConfig(period: '24h' | '7d'): { type: 'hours' | 'days'; value: number; format: string } {
    const config = {
      '24h': { type: 'hours' as const, value: 24, format: '%Y-%m-%dT%H:00:00Z' },
      '7d': { type: 'days' as const, value: 7, format: '%Y-%m-%d' },
    };
    return config[period];
  },

  async getStats(db: D1Database, period: '24h' | '7d'): Promise<RequestStats> {
    const { type, value } = this.getTimeConfig(period);

    const result = await db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
        CAST(AVG(duration) AS INTEGER) as avg_duration
      FROM request_logs
      WHERE created_at >= datetime('now', ?)
    `).bind(`-${value} ${type}`).first<RequestStats>();

    if (!result || result.total === 0) {
      return {
        total: 0,
        success: 0,
        failed: 0,
        avg_duration: 0
      };
    }

    return result;
  },

  async getTimeSeriesStats(db: D1Database, period: '24h' | '7d'): Promise<TimeSeriesStats[]> {
    const { type, value, format } = this.getTimeConfig(period);

    const result = await db.prepare(`
      SELECT 
        strftime(?, created_at) as period,
        COUNT(*) as total,
        SUM(success) as success,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
        CAST(AVG(duration) AS INTEGER) as avg_duration
      FROM request_logs
      WHERE created_at >= datetime('now', ?)
      GROUP BY period
      ORDER BY period ASC
    `).bind(format, `-${value} ${type}`).all<TimeSeriesStats>();

    // Fill gaps with zero values
    const data = result.results;
    const filledData: TimeSeriesStats[] = [];
    const now = new Date();

    for (let i = value - 1; i >= 0; i--) {
      let periodStr: string;
      if (type === 'hours') {
        const date = new Date(now);
        date.setUTCHours(now.getUTCHours() - i, 0, 0, 0);
        periodStr = date.toISOString().slice(0, 13) + ':00:00Z';
      } else {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
        periodStr = date.toISOString().slice(0, 10);
      }

      const existing = data.find(d => d.period === periodStr);
      filledData.push(existing || {
        period: periodStr,
        total: 0,
        success: 0,
        failed: 0,
        avg_duration: 0,
      });
    }

    return filledData;
  },
};
