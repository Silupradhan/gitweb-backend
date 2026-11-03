import { Router } from 'express';

import asyncHandler from '../../utils/asyncHandler.js';
import { analyticsController } from './analytics.controller.js';

const router = Router();

router.get('/', asyncHandler(analyticsController.getStats));
router.get('/stats', asyncHandler(analyticsController.getStats));

export default router;

