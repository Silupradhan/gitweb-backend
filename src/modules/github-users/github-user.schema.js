import { pgTable, bigserial, bigint, text, timestamp } from 'drizzle-orm/pg-core';

export const githubUsers = pgTable('github_users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  githubUserId: bigint('github_user_id', { mode: 'number' }).notNull().unique(),
  login: text('login').notNull(),
  avatarUrl: text('avatar_url'),
  profileUrl: text('profile_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

