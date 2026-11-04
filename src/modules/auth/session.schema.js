import { pgTable, text, serial, timestamp } from 'drizzle-orm/pg-core';
import { users } from '../users/user.schema.js';

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: serial('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
