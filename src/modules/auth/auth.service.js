import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { users } from '../users/user.schema.js';
import { sessions } from './session.schema.js';
import { env } from '../../config/env.js';
import { encrypt } from '../../utils/encryption.js';

async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      console.warn(`[auth] fetch attempt ${attempt}/${retries} failed for ${url}:`, err.message);
      if (attempt === retries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delay * attempt));
    }
  }
}

export const authService = {
  getGitHubAuthorizeUrl() {
    const params = new URLSearchParams({
      client_id: env.githubClientId,
      redirect_uri: env.githubCallbackUrl,
      scope: 'read:user repo',
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  },

  async handleGitHubCallback(code) {
    // 1. Exchange code for access token with retry and proper headers
    const tokenResponse = await fetchWithRetry('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'GitHub-Webhook-Hub',
      },
      body: JSON.stringify({
        client_id: env.githubClientId,
        client_secret: env.githubClientSecret,
        code,
        redirect_uri: env.githubCallbackUrl,
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Failed to obtain access token from GitHub');
    }

    const accessToken = tokenData.access_token;

    // 2. Fetch GitHub user profile with retry
    const userResponse = await fetchWithRetry('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'GitHub-Webhook-Hub',
      },
    });

    const ghUser = await userResponse.json();
    if (!userResponse.ok || !ghUser.id) {
      throw new Error('Failed to fetch user profile from GitHub');
    }

    const githubId = Number(ghUser.id);
    const name = ghUser.name || ghUser.login || 'GitHub User';
    const email = ghUser.email || null;
    const avatarUrl = ghUser.avatar_url || null;
    const encryptedToken = encrypt(accessToken);

    // 3. Upsert user record (FR-9.2)
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.githubId, githubId))
      .limit(1);

    let dbUser;
    const now = new Date();

    if (existingUser) {
      [dbUser] = await db
        .update(users)
        .set({
          name,
          email: email || existingUser.email,
          avatarUrl,
          githubAccessToken: encryptedToken,
          updatedAt: now,
        })
        .where(eq(users.id, existingUser.id))
        .returning();
    } else {
      [dbUser] = await db
        .insert(users)
        .values({
          githubId,
          name,
          email,
          avatarUrl,
          githubAccessToken: encryptedToken,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    }

    // 4. Create database session (FR-9.3)
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(sessions).values({
      id: sessionId,
      userId: dbUser.id,
      expiresAt,
      createdAt: now,
    });

    return { sessionId, user: dbUser };
  },

  async getUserBysessionId(sessionId) {
    if (!sessionId) return null;

    const [sessionRecord] = await db
      .select({
        sessionId: sessions.id,
        expiresAt: sessions.expiresAt,
        userId: users.id,
        githubId: users.githubId,
        name: users.name,
        email: users.email,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!sessionRecord) return null;

    if (new Date() > new Date(sessionRecord.expiresAt)) {
      // Session expired, delete it
      await db.delete(sessions).where(eq(sessions.id, sessionId));
      return null;
    }

    return {
      id: sessionRecord.userId,
      githubId: sessionRecord.githubId,
      name: sessionRecord.name,
      email: sessionRecord.email,
      avatarUrl: sessionRecord.avatarUrl,
      createdAt: sessionRecord.createdAt,
    };
  },

  async logout(sessionId) {
    if (!sessionId) return;
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  },
};
