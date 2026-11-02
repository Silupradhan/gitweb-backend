import { eventService, decodeCursor } from './event.service.js';

export const eventController = {
  /**
   * GET /events - List events with multi-field filtering and cursor pagination (FR-5.1 to FR-5.4).
   */
  async list(req, res) {
    const {
      repository,
      eventType,
      action,
      sender,
      fromDate,
      toDate,
      search,
      limit,
      cursor,
    } = req.query;

    // FR-5.7: Validation of filter inputs
    if (limit !== undefined) {
      const parsedLimit = Number(limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return res.status(400).json({
          error: 'Invalid limit: must be an integer between 1 and 100',
        });
      }
    }

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

    if (cursor !== undefined) {
      try {
        decodeCursor(cursor);
      } catch {
        return res.status(400).json({
          error: 'Invalid cursor: malformed pagination token',
        });
      }
    }

    const result = await eventService.listEvents({
      repository,
      eventType,
      action,
      sender,
      fromDate,
      toDate,
      search,
      limit: limit ? Number(limit) : 50,
      cursor,
    });

    return res.status(200).json(result);
  },

  /**
   * GET /events/:id - View single event with complete original payload (FR-5.5).
   */
  async getById(req, res) {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        error: 'Invalid event ID: must be a positive integer',
      });
    }

    const event = await eventService.getEventById(Number(id));

    if (!event) {
      return res.status(404).json({
        error: 'Event not found',
      });
    }

    return res.status(200).json(event);
  },
};

