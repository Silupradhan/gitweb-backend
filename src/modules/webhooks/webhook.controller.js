import { env } from '../../config/env.js';
import { webhookService } from './webhook.service.js';

export const webhookController = {
  async handleGitHubWebhook(req, res) {
    const signatureHeader = req.headers['x-hub-signature-256'];
    const deliveryId = req.headers['x-github-delivery'];
    const eventType = req.headers['x-github-event'];

    // 1. Signature verification (FR-2.3, FR-2.4, FR-2.5)
    // Only verified requests may touch the database
    const isValidSignature = webhookService.verifySignature(
      req.body,
      signatureHeader,
      env.webhookSecret
    );

    if (!isValidSignature) {
      return res.status(401).json({
        error: 'Unauthorized: Missing or invalid webhook signature',
      });
    }

    // 2. Validate required GitHub delivery headers (FR-2.6)
    if (!deliveryId || !eventType) {
      return res.status(400).json({
        error: 'Bad Request: Missing X-GitHub-Delivery or X-GitHub-Event header',
      });
    }

    // 3. Parse JSON payload from the raw buffer
    let payload;
    try {
      const rawText = Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : String(req.body);
      payload = JSON.parse(rawText);
    } catch {
      return res.status(400).json({
        error: 'Bad Request: Payload could not be parsed as JSON',
      });
    }

    // 4. Handle event (Ping or Normal storage)
    const result = await webhookService.handleWebhook({
      deliveryId,
      eventType,
      action: payload.action,
      payload,
    });

    // Ping event returns 200 OK without saving (FR-2.7, FR-3.3)
    if (result.isPing) {
      return res.status(200).json({
        message: 'Ping acknowledged',
        zen: payload.zen,
        hookId: payload.hook_id,
      });
    }

    // Duplicate delivery returns 200 OK and avoids duplicate rows (FR-2.9)
    if (result.isDuplicate) {
      return res.status(200).json({
        message: 'Delivery already received',
        deliveryId,
        eventId: result.eventId,
      });
    }

    // New valid event saved with status 'received', respond 202 Accepted (FR-2.8)
    return res.status(202).json({
      message: 'Event accepted',
      deliveryId,
      eventId: result.eventId,
      status: result.status,
      title: result.title,
    });
  },
};

