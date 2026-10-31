import { Router } from 'express';

import { checkDatabase } from '../../db/health.js';
import { env } from '../../config/env.js';

const router = Router();

router.get('/', async (_req, res) => {
  const database = await checkDatabase();

  res.json({
    status: 'ok',
    database,
    environment: env.nodeEnv,
    uptime: `${process.uptime().toFixed(1)}s`,
    timestamp: new Date().toISOString(),
  });
});

export default router;
