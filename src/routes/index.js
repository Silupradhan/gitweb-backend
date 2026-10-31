import { Router } from 'express';

import userRoutes from '../modules/users/user.routes.js';

const router = Router();

router.use('/users', userRoutes);

export default router;
