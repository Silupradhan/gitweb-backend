import { pgTable, text, serial, boolean, timestamp, integer } from 'drizzle-orm/pg-core';
import { users } from '../users/user.schema.js';

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  secret: text('secret').notNull(), // Encrypted secret (FR-10.8)
  isEnabled: boolean('is_enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
