import { eq, or, and, lt, gte, lte, desc, ilike } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { events } from './event.schema.js';
import { repositories } from '../repositories/repository.schema.js';
import { githubUsers } from '../github-users/github-user.schema.js';

/**
 * Encodes cursor data into a URL-safe Base64 token.
 */
export function encodeCursor({ receivedAt, id }) {
  const payload = JSON.stringify({
    receivedAt: receivedAt instanceof Date ? receivedAt.toISOString() : receivedAt,
    id: Number(id),
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Decodes a cursor token back into { receivedAt, id }.
 * Throws an error if invalid.
 */
export function decodeCursor(cursorToken) {
  try {
    const raw = Buffer.from(cursorToken, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    const date = new Date(parsed.receivedAt);
    const id = Number(parsed.id);

    if (isNaN(date.getTime()) || isNaN(id) || id <= 0) {
      throw new Error('Malformed cursor structure');
    }

    return { receivedAt: date, id };
  } catch {
    throw new Error('Invalid cursor token');
  }
}

export const eventService = {
  /**
   * Lists events, newest first, with multi-field filtering and cursor-based pagination (FR-5.1 to FR-5.4).
   */
  async listEvents({
    repository,
    eventType,
    action,
    sender,
    fromDate,
    toDate,
    search,
    limit = 50,
    cursor,
  } = {}) {
    const conditions = [];

    // Filter by repository (full name or numeric ID)
    if (repository) {
      if (/^\d+$/.test(String(repository).trim())) {
        conditions.push(
          or(
            eq(events.repositoryId, Number(repository)),
            eq(repositories.fullName, String(repository).trim())
          )
        );
      } else {
        conditions.push(eq(repositories.fullName, String(repository).trim()));
      }
    }

    // Filter by event type
    if (eventType) {
      conditions.push(eq(events.eventType, String(eventType).trim()));
    }

    // Filter by action
    if (action) {
      conditions.push(eq(events.action, String(action).trim()));
    }

    // Filter by sender (login username or numeric ID)
    if (sender) {
      if (/^\d+$/.test(String(sender).trim())) {
        conditions.push(
          or(
            eq(events.senderId, Number(sender)),
            eq(githubUsers.login, String(sender).trim())
          )
        );
      } else {
        conditions.push(eq(githubUsers.login, String(sender).trim()));
      }
    }

    // Filter by date range
    if (fromDate) {
      conditions.push(gte(events.receivedAt, new Date(fromDate)));
    }
    if (toDate) {
      conditions.push(lte(events.receivedAt, new Date(toDate)));
    }

    // Filter by title text search (case-insensitive substring)
    if (search && String(search).trim()) {
      conditions.push(ilike(events.title, `%${String(search).trim()}%`));
    }

    // Apply cursor condition for next page (strict descending order)
    if (cursor) {
      const decoded = decodeCursor(cursor);
      conditions.push(
        or(
          lt(events.receivedAt, decoded.receivedAt),
          and(
            eq(events.receivedAt, decoded.receivedAt),
            lt(events.id, decoded.id)
          )
        )
      );
    }

    // Fetch limit + 1 items to determine hasMore and generate nextCursor
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

    const query = db
      .select({
        id: events.id,
        eventType: events.eventType,
        action: events.action,
        title: events.title,
        receivedAt: events.receivedAt,
        repositoryName: repositories.fullName,
        senderName: githubUsers.login,
        senderAvatar: githubUsers.avatarUrl,
        sourceLink: events.sourceUrl,
      })
      .from(events)
      .leftJoin(repositories, eq(events.repositoryId, repositories.id))
      .leftJoin(githubUsers, eq(events.senderId, githubUsers.id));

    if (conditions.length > 0) {
      query.where(and(...conditions));
    }

    const items = await query
      .orderBy(desc(events.receivedAt), desc(events.id))
      .limit(safeLimit + 1);

    const hasMore = items.length > safeLimit;
    const data = hasMore ? items.slice(0, safeLimit) : items;

    let nextCursor = null;
    if (hasMore && data.length > 0) {
      const lastItem = data[data.length - 1];
      nextCursor = encodeCursor({
        receivedAt: lastItem.receivedAt,
        id: lastItem.id,
      });
    }

    return {
      data,
      pagination: {
        limit: safeLimit,
        hasMore,
        nextCursor,
      },
    };
  },

  /**
   * Returns a single event with its complete original payload and details (FR-5.5).
   */
  async getEventById(id) {
    const numericId = Number(id);
    if (isNaN(numericId) || numericId <= 0) {
      return null;
    }

    const [event] = await db
      .select({
        id: events.id,
        deliveryId: events.deliveryId,
        eventType: events.eventType,
        action: events.action,
        title: events.title,
        sourceLink: events.sourceUrl,
        status: events.status,
        errorMessage: events.errorMessage,
        payload: events.payload,
        receivedAt: events.receivedAt,
        processedAt: events.processedAt,
        repository: {
          id: repositories.id,
          githubRepoId: repositories.githubRepoId,
          fullName: repositories.fullName,
          ownerLogin: repositories.ownerLogin,
          isPrivate: repositories.isPrivate,
          webAddress: repositories.webAddress,
        },
        sender: {
          id: githubUsers.id,
          githubUserId: githubUsers.githubUserId,
          login: githubUsers.login,
          avatarUrl: githubUsers.avatarUrl,
          profileUrl: githubUsers.profileUrl,
        },
      })
      .from(events)
      .leftJoin(repositories, eq(events.repositoryId, repositories.id))
      .leftJoin(githubUsers, eq(events.senderId, githubUsers.id))
      .where(eq(events.id, numericId))
      .limit(1);

    return event ?? null;
  },
};

