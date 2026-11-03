import { analyticsService } from './analytics.service.js';

export const analyticsController = {
  /**
   * GET /analytics/stats - All dashboard metrics computed in database (FR-8.1 to FR-8.10).
   */
  async getStats(req, res) {
    const { repository, fromDate, toDate } = req.query;

    if (fromDate !== undefined) {
      const d = new Date(fromDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({
          error: 'Invalid fromDate: must be a valid ISO 8601 date string',
        });
      }
    }

    if (toDate !== undefined) {
      const d = new Date(toDate);
      if (isNaN(d.getTime())) {
        return res.status(400).json({
          error: 'Invalid toDate: must be a valid ISO 8601 date string',
        });
      }
    }

    if (fromDate !== undefined && toDate !== undefined) {
      if (new Date(fromDate) > new Date(toDate)) {
        return res.status(400).json({
          error: 'Invalid date range: fromDate cannot be after toDate',
        });
      }
    }

    const stats = await analyticsService.getDashboardStats({
      repository,
      fromDate,
      toDate,
    });

    return res.status(200).json(stats);
  },
};

