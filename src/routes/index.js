import { Router } from 'express';

import authRoutes from '../modules/auth/auth.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import eventRoutes from '../modules/events/event.routes.js';
import repositoryRoutes from '../modules/repositories/repository.routes.js';
import analyticsRoutes from '../modules/analytics/analytics.routes.js';
import { requireAuth } from '../middlewares/requireAuth.js';

const router = Router();

// Auth routes (public login/callback/logout, protected /me)
router.use('/auth', authRoutes);

// Protected dashboard API routes (FR-9.5)
router.use('/users', requireAuth, userRoutes);
router.use('/events', requireAuth, eventRoutes);
router.use('/repos', requireAuth, repositoryRoutes);
router.use('/analytics', requireAuth, analyticsRoutes);

export default router;
