import {
  pgTable,
  bigserial,
  text,
  varchar,
  timestamp,
  jsonb,
  bigint,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

import { repositories } from '../repositories/repository.schema.js';
import { githubUsers } from '../github-users/github-user.schema.js';
import { webhookEndpoints } from '../endpoints/endpoint.schema.js';

export const eventStatusEnum = pgEnum('event_status', ['received', 'processed', 'failed']);

export const events = pgTable(
  'events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    deliveryId: text('delivery_id').notNull().unique(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    action: varchar('action', { length: 100 }),
    repositoryId: bigint('repository_id', { mode: 'number' }).references(() => repositories.id, {
      onDelete: 'set null',
    }),
    senderId: bigint('sender_id', { mode: 'number' }).references(() => githubUsers.id, {
      onDelete: 'set null',
    }),
    webhookEndpointId: text('webhook_endpoint_id'),
    endpointId: text('endpoint_id').references(() => webhookEndpoints.id, {
      onDelete: 'cascade',
    }),
    title: text('title'),
    sourceUrl: text('source_url'),
    payload: jsonb('payload').notNull(),
    status: eventStatusEnum('status').default('received').notNull(),
    errorMessage: text('error_message'),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    index('events_repo_received_idx').on(table.repositoryId, table.receivedAt.desc()),
    index('events_type_idx').on(table.eventType),
    index('events_payload_gin_idx').using('gin', table.payload),
  ]
);

