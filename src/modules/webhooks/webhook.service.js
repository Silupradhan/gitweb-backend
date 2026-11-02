import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { events } from '../events/event.schema.js';
import { repositories } from '../repositories/repository.schema.js';
import { githubUsers } from '../github-users/github-user.schema.js';
import { normalizeEvent } from '../events/event.normalizer.js';

/**
 * Validates GitHub's HMAC SHA-256 signature using a timing-safe comparison.
 * GitHub sends the header as: `sha256=<hex_digest>`
 *
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string|undefined} signatureHeader - Value of 'x-hub-signature-256'
 * @param {string} secret - Shared webhook secret
 * @returns {boolean} True if the signature matches, false otherwise
 */
export function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret || !rawBody) {
    return false;
  }

  const [prefix, providedHash] = signatureHeader.split('=');
  if (prefix !== 'sha256' || !providedHash) {
    return false;
  }

  const calculatedHash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const providedBuffer = Buffer.from(providedHash, 'utf8');
  const calculatedBuffer = Buffer.from(calculatedHash, 'utf8');

  // Prevent timing attacks by checking buffer lengths first, then comparing timing-safely
  if (providedBuffer.length !== calculatedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, calculatedBuffer);
}

export const webhookService = {
  verifySignature,

  /**
   * Processes an incoming verified webhook delivery.
   * Handles idempotency (FR-2.9) and ping acknowledgement (FR-2.7, FR-3.3).
   * Executes event normalization, repository and sender upserts, and event creation
   * in a single atomic database transaction (FR-4.1).
   */
  async handleWebhook({ deliveryId, eventType, action, payload }) {
    // Ping events are test handshakes and do not need to be stored (FR-2.7, FR-3.3)
    if (eventType === 'ping') {
      return {
        isPing: true,
        message: 'Ping event acknowledged successfully',
      };
    }

    // Check if this delivery ID already exists to prevent duplicate processing (FR-2.9, FR-1.4)
    const [existingEvent] = await db
      .select({ id: events.id, status: events.status })
      .from(events)
      .where(eq(events.deliveryId, deliveryId))
      .limit(1);

    if (existingEvent) {
      return {
        isDuplicate: true,
        eventId: existingEvent.id,
        status: existingEvent.status,
      };
    }

    // FR-4.2, FR-4.3, FR-4.4: Normalize event title and source link
    const { title, sourceUrl } = normalizeEvent(eventType, action, payload);

    // FR-4.1: Atomic all-or-nothing database transaction:
    // 1. Create or update repository record
    // 2. Create or update sender record
    // 3. Create event record
    const result = await db.transaction(async (tx) => {
      let repositoryId = null;
      let senderId = null;

      // 1. Upsert repository if present in payload (FR-4.1, FR-4.5)
      if (payload.repository?.id) {
        const repoData = {
          githubRepoId: Number(payload.repository.id),
          fullName: payload.repository.full_name || payload.repository.name || 'unknown',
          ownerLogin:
            payload.repository.owner?.login ||
            payload.repository.full_name?.split('/')[0] ||
            'unknown',
          isPrivate: Boolean(payload.repository.private),
          webAddress: payload.repository.html_url || null,
          updatedAt: new Date(),
        };

        const [repoRecord] = await tx
          .insert(repositories)
          .values(repoData)
          .onConflictDoUpdate({
            target: repositories.githubRepoId,
            set: {
              fullName: repoData.fullName,
              ownerLogin: repoData.ownerLogin,
              isPrivate: repoData.isPrivate,
              webAddress: repoData.webAddress,
              updatedAt: repoData.updatedAt,
            },
          })
          .returning({ id: repositories.id });

        repositoryId = repoRecord?.id ?? null;
      }

      // 2. Upsert GitHub sender if present in payload (FR-4.1, FR-4.5)
      if (payload.sender?.id) {
        const senderData = {
          githubUserId: Number(payload.sender.id),
          login: payload.sender.login || 'unknown',
          avatarUrl: payload.sender.avatar_url || null,
          profileUrl: payload.sender.html_url || null,
          updatedAt: new Date(),
        };

        const [senderRecord] = await tx
          .insert(githubUsers)
          .values(senderData)
          .onConflictDoUpdate({
            target: githubUsers.githubUserId,
            set: {
              login: senderData.login,
              avatarUrl: senderData.avatarUrl,
              profileUrl: senderData.profileUrl,
              updatedAt: senderData.updatedAt,
            },
          })
          .returning({ id: githubUsers.id });

        senderId = senderRecord?.id ?? null;
      }

      // 3. Create the event record (FR-4.1, FR-4.6: original payload stored unchanged)
      const [savedEvent] = await tx
        .insert(events)
        .values({
          deliveryId,
          eventType,
          action: action || payload.action || null,
          repositoryId,
          senderId,
          title,
          sourceUrl,
          payload,
          status: 'received',
        })
        .onConflictDoNothing({ target: events.deliveryId })
        .returning({ id: events.id, status: events.status });

      return savedEvent;
    });

    return {
      isDuplicate: false,
      eventId: result?.id ?? existingEvent?.id,
      status: result?.status ?? 'received',
      title,
      sourceUrl,
    };
  },
};
