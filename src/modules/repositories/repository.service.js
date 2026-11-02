import { eq, desc, asc, count } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { repositories } from './repository.schema.js';
import { events } from '../events/event.schema.js';

export const repositoryService = {
  /**
   * Lists all repositories with their event counts (FR-5.6).
   */
  async listWithEventCounts() {
    return db
      .select({
        id: repositories.id,
        githubRepoId: repositories.githubRepoId,
        fullName: repositories.fullName,
        ownerLogin: repositories.ownerLogin,
        isPrivate: repositories.isPrivate,
        webAddress: repositories.webAddress,
        createdAt: repositories.createdAt,
        updatedAt: repositories.updatedAt,
        eventCount: count(events.id),
      })
      .from(repositories)
      .leftJoin(events, eq(events.repositoryId, repositories.id))
      .groupBy(repositories.id)
      .orderBy(desc(count(events.id)), asc(repositories.fullName));
  },
};

