import crypto from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { webhookEndpoints } from './endpoint.schema.js';
import { events } from '../events/event.schema.js';
import { encrypt, decrypt } from '../../utils/encryption.js';

export const endpointService = {
  async listByUser(userId) {
    const list = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.userId, userId))
      .orderBy(webhookEndpoints.createdAt);

    // Decrypt secrets for the owner (FR-10.8: Secrets are shown to the owner only)
    return list.map((ep) => ({
      ...ep,
      secret: decrypt(ep.secret) || ep.secret,
    }));
  },

  async create({ userId, name }) {
    const id = crypto.randomBytes(16).toString('hex'); // Unique endpoint address ID
    const rawSecret = crypto.randomBytes(32).toString('hex'); // Unique endpoint secret
    const encryptedSecret = encrypt(rawSecret);
    const now = new Date();

    const [created] = await db
      .insert(webhookEndpoints)
      .values({
        id,
        userId,
        name: name || 'Default Repository Endpoint',
        secret: encryptedSecret,
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return {
      ...created,
      secret: rawSecret, // Return plaintext secret once upon creation
    };
  },

  async update(id, userId, { name, isEnabled }) {
    const [existing] = await db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, userId)))
      .limit(1);

    if (!existing) return null;

    const [updated] = await db
      .update(webhookEndpoints)
      .set({
        ...(name !== undefined && { name }),
        ...(isEnabled !== undefined && { isEnabled }),
        updatedAt: new Date(),
      })
      .where(eq(webhookEndpoints.id, id))
      .returning();

    return {
      ...updated,
      secret: decrypt(updated.secret) || updated.secret,
    };
  },

  async remove(id, userId, deleteEvents = false) {
    const [existing] = await db
      .select()
      .from(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, userId)))
      .limit(1);

    if (!existing) return null;

    // Optional event deletion (FR-10.7)
    if (deleteEvents) {
      await db.delete(events).where(eq(events.endpointId, id));
    } else {
      // Unlink events from endpoint if keeping them
      await db
        .update(events)
        .set({ endpointId: null })
        .where(eq(events.endpointId, id));
    }

    const [deleted] = await db
      .delete(webhookEndpoints)
      .where(eq(webhookEndpoints.id, id))
      .returning();

    return deleted;
  },

  async getActiveById(id) {
    const [ep] = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.id, id))
      .limit(1);

    if (!ep || !ep.isEnabled) return null;

    return {
      ...ep,
      secret: decrypt(ep.secret) || ep.secret,
    };
  },
};
