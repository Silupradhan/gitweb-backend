import { Router } from 'express';

import asyncHandler from '../../utils/asyncHandler.js';
import { eventController } from './event.controller.js';

const router = Router();

router.get('/', asyncHandler(eventController.list));
router.get('/:id', asyncHandler(eventController.getById));

export default router;

