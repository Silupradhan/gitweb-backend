import asyncHandler from '../../utils/asyncHandler.js';
import { userService } from './user.service.js';

export const userController = {
  list: asyncHandler(async (_req, res) => {
    const users = await userService.list();
    res.json({ data: users });
  }),

  getById: asyncHandler(async (req, res, next) => {
    const user = await userService.getById(Number(req.params.id));
    if (!user) return next({ status: 404, message: 'User not found' });
    res.json({ data: user });
  }),

  create: asyncHandler(async (req, res) => {
    const user = await userService.create(req.body);
    res.status(201).json({ data: user });
  }),

  update: asyncHandler(async (req, res, next) => {
    const user = await userService.update(Number(req.params.id), req.body);
    if (!user) return next({ status: 404, message: 'User not found' });
    res.json({ data: user });
  }),

  remove: asyncHandler(async (req, res, next) => {
    const user = await userService.remove(Number(req.params.id));
    if (!user) return next({ status: 404, message: 'User not found' });
    res.status(204).send();
  }),
};
