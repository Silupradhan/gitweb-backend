import { Router } from 'express';
import express from 'express';

import asyncHandler from '../../utils/asyncHandler.js';
import { webhookController } from './webhook.controller.js';

const router = Router();

/**
 * Endpoint-specific webhook delivery (FR-10.1, FR-10.2).
 * Reads the request body as raw unchanged bytes up to 5 MB.
 */
router.post(
  '/:endpointId',
  express.raw({ type: '*/*', limit: '5mb' }),
  asyncHandler(webhookController.handleGitHubWebhook)
);

/**
 * Legacy global webhook delivery (fallback).
 */
router.post(
  '/github',
  express.raw({ type: '*/*', limit: '5mb' }),
  asyncHandler(webhookController.handleGitHubWebhook)
);

export default router;
