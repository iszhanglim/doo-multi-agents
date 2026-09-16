import { ChildPortrait, ClassPortraitGroup } from '../core/types';
import { IPortraitStorage } from './IPortraitStorage';
import { Pool } from 'pg';

export class PostgresStorage implements IPortraitStorage {
  private pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS portraits (
        child_id VARCHAR(128) PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        class_id VARCHAR(128) NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_portraits_class ON portraits(class_id);

      CREATE TABLE IF NOT EXISTS users (
        username VARCHAR(64) PRIMARY KEY,
        password_hash VARCHAR(128) NOT NULL,
        name VARCHAR(64) NOT NULL,
        role VARCHAR(16) NOT NULL DEFAULT 'teacher',
        class_id VARCHAR(64),
        avatar VARCHAR(16) DEFAULT '👩‍🏫',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ PostgreSQL 数据表初始化完成');
  }

  // ========== 用户管理 ==========

  async createUser(username: string, passwordHash: string, name: string, role = 'teacher', classId?: string, avatar = '👩‍🏫'): Promise<boolean> {
    try {
      await this.pool.query(
        'INSERT INTO users (username, password_hash, name, role, class_id, avatar) VALUES ($1, $2, $3, $4, $5, $6)',
        [username, passwordHash, name, role, classId || null, avatar]
      );
      return true;
    } catch {
      return false;
    }
  }

  async getUser(username: string): Promise<{ username: string; password_hash: string; name: string; role: string; class_id: string | null; avatar: string } | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] || null;
  }

  async listUsers(): Promise<Array<{ username: string; name: string; role: string; class_id: string | null; avatar: string }>> {
    const result = await this.pool.query('SELECT username, name, role, class_id, avatar FROM users ORDER BY created_at');
    return result.rows;
  }

  async updateUser(username: string, updates: { name?: string; role?: string; class_id?: string; avatar?: string }): Promise<boolean> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(updates)) {
      if (val !== undefined) {
        fields.push(`${key} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    if (fields.length === 0) return false;
    values.push(username);
    const result = await this.pool.query(`UPDATE users SET ${fields.join(', ')} WHERE username = $${idx}`, values);
    return (result.rowCount ?? 0) > 0;
  }

  async updatePassword(username: string, passwordHash: string): Promise<boolean> {
    const result = await this.pool.query('UPDATE users SET password_hash = $1 WHERE username = $2', [passwordHash, username]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteUser(username: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM users WHERE username = $1', [username]);
    return (result.rowCount ?? 0) > 0;
  }

  async savePortrait(portrait: ChildPortrait): Promise<void> {
    await this.pool.query(
      `INSERT INTO portraits (child_id, name, class_id, data, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (child_id) DO UPDATE SET
         name = EXCLUDED.name,
         class_id = EXCLUDED.class_id,
         data = EXCLUDED.data,
         updated_at = NOW()`,
      [portrait.childId, portrait.name, portrait.classId, JSON.stringify(portrait)]
    );
  }

  async loadPortrait(childId: string): Promise<ChildPortrait | null> {
    const result = await this.pool.query(
      'SELECT data FROM portraits WHERE child_id = $1',
      [childId]
    );
    if (result.rows.length === 0) return null;
    return this.parsePortrait(result.rows[0].data);
  }

  async deletePortrait(childId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM portraits WHERE child_id = $1',
      [childId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listPortraits(): Promise<string[]> {
    const result = await this.pool.query('SELECT child_id FROM portraits ORDER BY updated_at DESC');
    return result.rows.map(r => r.child_id);
  }

  async loadAllPortraits(): Promise<ChildPortrait[]> {
    const result = await this.pool.query('SELECT data FROM portraits ORDER BY updated_at DESC');
    return result.rows.map(r => this.parsePortrait(r.data)).filter(Boolean) as ChildPortrait[];
  }

  async saveClassGroup(group: ClassPortraitGroup): Promise<void> {
    // Class groups are derived from portraits, no separate storage needed
  }

  async loadClassGroup(_classId: string): Promise<ClassPortraitGroup | null> {
    return null;
  }

  async exportToJSON(): Promise<string> {
    const portraits = await this.loadAllPortraits();
    return JSON.stringify({ exportTime: new Date().toISOString(), portraitCount: portraits.length, portraits }, null, 2);
  }

  async importFromJSON(jsonData: string): Promise<number> {
    try {
      const data = JSON.parse(jsonData);
      for (const portrait of data.portraits as ChildPortrait[]) {
        await this.savePortrait(portrait);
      }
      return data.portraits.length;
    } catch {
      return 0;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private parsePortrait(data: any): ChildPortrait | null {
    try {
      const portrait = typeof data === 'string' ? JSON.parse(data) : data;
      portrait.basePortrait.createdAt = new Date(portrait.basePortrait.createdAt);
      portrait.basePortrait.updatedAt = new Date(portrait.basePortrait.updatedAt);
      for (const a of portrait.basePortrait.assessments) {
        a.timestamp = new Date(a.timestamp);
      }
      return portrait;
    } catch {
      return null;
    }
  }
}
