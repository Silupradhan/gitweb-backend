import { Router } from 'express';
import { endpointController } from './endpoint.controller.js';

const router = Router();

router.get('/', endpointController.list);
router.post('/', endpointController.create);
router.patch('/:id', endpointController.update);
router.delete('/:id', endpointController.remove);

export default router;
