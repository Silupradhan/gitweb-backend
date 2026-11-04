import { Router } from 'express';
import { authController } from './auth.controller.js';
import { requireAuth } from '../../middlewares/requireAuth.js';

const router = Router();

router.get('/github', authController.redirectToGitHub);
router.get('/github/callback', authController.handleGitHubCallback);
router.get('/me', requireAuth, authController.getCurrentUser);
router.post('/logout', authController.logout);

export default router;
