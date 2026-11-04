/**
 * Central schema barrel — re-exports every module's tables so Drizzle Kit
 * and the db client see the whole schema in one place.
 */
export * from '../modules/users/user.schema.js';
export * from '../modules/auth/session.schema.js';
export * from '../modules/repositories/repository.schema.js';
export * from '../modules/github-users/github-user.schema.js';
export * from '../modules/events/event.schema.js';
