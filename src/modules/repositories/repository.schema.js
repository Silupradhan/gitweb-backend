import { pgTable, bigserial, bigint, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const repositories = pgTable('repositories', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  githubRepoId: bigint('github_repo_id', { mode: 'number' }).notNull().unique(),
  fullName: text('full_name').notNull(),
  ownerLogin: text('owner_login').notNull(),
  isPrivate: boolean('is_private').default(false).notNull(),
  webAddress: text('web_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

