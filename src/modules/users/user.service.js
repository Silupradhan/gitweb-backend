import { eq } from 'drizzle-orm';

import { db } from '../../db/index.js';
import { users } from './user.schema.js';

export const userService = {
  async list() {
    return db.select().from(users).orderBy(users.id);
  },

  async getById(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  },

  async create({ name, email }) {
    const [user] = await db.insert(users).values({ name, email }).returning();
    return user;
  },

  async update(id, { name, email }) {
    const [user] = await db
      .update(users)
      .set({ ...(name !== undefined && { name }), ...(email !== undefined && { email }) })
      .where(eq(users.id, id))
      .returning();
    return user ?? null;
  },

  async remove(id) {
    const [user] = await db.delete(users).where(eq(users.id, id)).returning();
    return user ?? null;
  },
};
