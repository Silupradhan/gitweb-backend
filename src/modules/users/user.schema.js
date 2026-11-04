import { pgTable, serial, bigint, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  githubId: bigint('github_id', { mode: 'number' }).notNull().unique(),
  name: text('name').notNull(),
  email: text('email'),
  avatarUrl: text('avatar_url'),
  githubAccessToken: text('github_access_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
