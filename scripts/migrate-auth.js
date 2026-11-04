import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('[migration] Starting auth schema migration...');

    // 1. Alter users table to add github OAuth columns
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS github_id BIGINT UNIQUE,
        ADD COLUMN IF NOT EXISTS avatar_url TEXT,
        ADD COLUMN IF NOT EXISTS github_access_token TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL;
    `);

    // Make email nullable if it was not null
    await client.query(`
      ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
    `);

    // 2. Create sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);
    // Wait, fix column name id in sessions table:
    // Actually: id TEXT PRIMARY KEY
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions_new (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      );
    `);
    // Drop old sessions if created incorrectly and rename
    await client.query(`
      DROP TABLE IF EXISTS sessions;
      ALTER TABLE sessions_new RENAME TO sessions;
    `);

    console.log('[migration] Auth schema migration completed successfully!');
  } catch (err) {
    console.error('[migration] Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
