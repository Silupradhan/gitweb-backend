import { endpointService } from './endpoint.service.js';

export const endpointController = {
  async list(req, res) {
    try {
      const endpoints = await endpointService.listByUser(req.user.id);
      res.json(endpoints);
    } catch (err) {
      console.error('[endpoint] list error:', err);
      res.status(500).json({ error: 'Failed to list webhook endpoints' });
    }
  },

  async create(req, res) {
    try {
      const { name } = req.body;
      const endpoint = await endpointService.create({
        userId: req.user.id,
        name,
      });
      res.status(201).json(endpoint);
    } catch (err) {
      console.error('[endpoint] create error:', err);
      res.status(500).json({ error: 'Failed to create webhook endpoint' });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { name, isEnabled } = req.body;
      const updated = await endpointService.update(id, req.user.id, { name, isEnabled });
      if (!updated) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      res.json(updated);
    } catch (err) {
      console.error('[endpoint] update error:', err);
      res.status(500).json({ error: 'Failed to update webhook endpoint' });
    }
  },

  async remove(req, res) {
    try {
      const { id } = req.params;
      const deleteEvents = req.query.deleteEvents === 'true';
      const deleted = await endpointService.remove(id, req.user.id, deleteEvents);
      if (!deleted) {
        return res.status(404).json({ error: 'Endpoint not found' });
      }
      res.json({ message: 'Endpoint deleted successfully' });
    } catch (err) {
      console.error('[endpoint] remove error:', err);
      res.status(500).json({ error: 'Failed to delete webhook endpoint' });
    }
  },
};
