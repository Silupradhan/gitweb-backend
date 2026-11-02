import { Router } from 'express';

import asyncHandler from '../../utils/asyncHandler.js';
import { repositoryController } from './repository.controller.js';

const router = Router();

router.get('/', asyncHandler(repositoryController.listWithCounts));

export default router;

