import { Router } from 'express';

import userRoutes from '../modules/users/user.routes.js';
import eventRoutes from '../modules/events/event.routes.js';
import repositoryRoutes from '../modules/repositories/repository.routes.js';

const router = Router();

router.use('/users', userRoutes);
router.use('/events', eventRoutes);
router.use('/repos', repositoryRoutes);

export default router;
