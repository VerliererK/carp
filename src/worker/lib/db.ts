import type { SystemSetting } from '@shared/types';

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
