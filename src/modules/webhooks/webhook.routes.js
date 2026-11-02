import { Router } from 'express';
import express from 'express';

import asyncHandler from '../../utils/asyncHandler.js';
import { webhookController } from './webhook.controller.js';

const router = Router();

/**
 * Public endpoint for GitHub webhook deliveries (FR-2.1).
 * Reads the request body as raw unchanged bytes up to 5 MB (FR-2.2, FR-2.11).
 */
router.post(
  '/github',
  express.raw({ type: '*/*', limit: '5mb' }),
  asyncHandler(webhookController.handleGitHubWebhook)
);

export default router;

