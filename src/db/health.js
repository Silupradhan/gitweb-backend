import { Pool } from 'pg';

import { pool } from './index.js';

/**
 * Pings the database with a trivial query.
 * Returns "connected" | "disconnected" so it can be surfaced
 * by the health endpoint without ever leaking credentials.
 */
export async function checkDatabase(poolRef = pool) {
  try {
    await poolRef.query('SELECT 1');
    return 'connected';
  } catch {
    return 'disconnected';
  }
}
