import type { SystemSetting, Provider, ApiKey, RequestLog } from '@shared/types';

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

  async list(db: D1Database): Promise<(Provider & { keys_count: number })[]> {
    const result = await db.prepare(`
      SELECT 
        p.*,
        COUNT(k.id) AS keys_count
      FROM providers p
      LEFT JOIN api_keys k ON k.provider_id = p.id
      GROUP BY p.id
      ORDER BY p.id
    `).all<Provider & { keys_count: number }>();
    return result.results;
  },

  async get(db: D1Database, id: number): Promise<(Provider & { keys_count: number }) | null> {
    const result = await db.prepare(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM api_keys k WHERE k.provider_id = p.id) AS keys_count
      FROM providers p
      WHERE p.id = ?
    `).bind(id).first<Provider & { keys_count: number }>();
    return result ?? null;
  },

  async getByName(db: D1Database, name: string): Promise<(Provider & { keys_count: number }) | null> {
    const result = await db.prepare(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM api_keys k WHERE k.provider_id = p.id) AS keys_count
      FROM providers p
      WHERE p.name = ?
    `).bind(name).first<Provider & { keys_count: number }>();
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
