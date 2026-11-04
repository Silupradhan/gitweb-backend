import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { env } from '../config/env.js';
import * as schema from './schema.js';

export const pool = new Pool({
  connectionString: env.databaseUrl,
});

export const db = drizzle(pool, { schema });

// Automatically ensure auth schema tables and columns exist on startup
async function ensureAuthSchema() {
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS github_id BIGINT UNIQUE,
          ADD COLUMN IF NOT EXISTS avatar_url TEXT,
          ADD COLUMN IF NOT EXISTS github_access_token TEXT,
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
      `);

      await client.query(`
        ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS webhook_endpoints (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          secret TEXT NOT NULL,
          is_enabled BOOLEAN DEFAULT TRUE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
        );
      `);

      await client.query(`
        ALTER TABLE events
          ADD COLUMN IF NOT EXISTS endpoint_id TEXT REFERENCES webhook_endpoints(id) ON DELETE CASCADE;
      `);

      console.log('[db] Auth & webhook endpoints schema verified/migrated successfully.');
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[db] Auto migration notice (safe if tables/columns already exist):', err.message);
  }
}

ensureAuthSchema();
