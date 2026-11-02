import crypto from 'node:crypto';

/**
 * Server-Sent Events (SSE) Manager for real-time live feed (FR-7.1, FR-7.2, FR-7.3, FR-7.4).
 */
class SseManager {
  constructor() {
    /** @type {Map<string, { res: import('express').Response, timer: NodeJS.Timeout }>} */
    this.clients = new Map();
  }

  /**
   * Registers a new SSE client connection.
   * Sends headers, sets up 25-second keep-alive heartbeats, and cleans up on disconnect.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {string} Client ID
   */
  addClient(req, res) {
    const clientId = crypto.randomUUID();

    // Setup 25-second keep-alive comment so proxies don't close the stream (FR-7.3)
    const timer = setInterval(() => {
      try {
        res.write(': keep-alive\n\n');
      } catch {
        this.removeClient(clientId);
      }
    }, 25000);

    // Initial greeting comment
    res.write(`: connected client=${clientId}\n\n`);

    this.clients.set(clientId, { res, timer });

    // Remove client when connection drops (FR-7.4)
    req.on('close', () => {
      this.removeClient(clientId);
    });

    return clientId;
  }

  /**
   * Cleans up and removes a disconnected client (FR-7.4).
   * @param {string} clientId
   */
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      clearInterval(client.timer);
      this.clients.delete(clientId);
    }
  }

  /**
   * Broadcasts a newly saved event to all connected dashboards (FR-7.2).
   * Guarantees event is only broadcast after save is complete.
   *
   * @param {object} eventData
   */
  broadcast(eventData) {
    if (this.clients.size === 0) return;

    const payload = `data: ${JSON.stringify(eventData)}\n\n`;

    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.res.write(payload);
      } catch {
        this.removeClient(clientId);
      }
    }
  }

  /**
   * Returns count of active SSE client connections.
   * @returns {number}
   */
  getClientCount() {
    return this.clients.size;
  }
}

export const sseManager = new SseManager();

