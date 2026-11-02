import 'dotenv/config';

/** Webhook secret must be at least 32 random bytes (FR-0.3 business rule). */
const MIN_SECRET_BYTES = 32;

/**
 * Estimates the byte strength of a secret value.
 * Accepts hex (2 chars = 1 byte), base64/base64url (4 chars = 3 bytes)
 * or any other text measured by its UTF-8 byte length.
 */
function secretStrengthOk(secret) {
  if (!secret) return false;

  if (/^[0-9a-f]+$/i.test(secret)) {
    return secret.length >= MIN_SECRET_BYTES * 2; // hex → 64 chars = 32 bytes
  }

  if (/^[A-Za-z0-9+/=_-]+$/.test(secret)) {
    const trimmed = secret.replace(/=+$/, '');
    return Math.floor((trimmed.length * 3) / 4) >= MIN_SECRET_BYTES;
  }

  return Buffer.byteLength(secret, 'utf8') >= MIN_SECRET_BYTES;
}

if (!process.env.DATABASE_URL) {
  console.warn('[env] DATABASE_URL is not set — set it in .env before using the database.');
}

if (!process.env.WEBHOOK_SECRET) {
  console.warn('[env] WEBHOOK_SECRET is not set — generate one for webhook features, e.g.:');
  console.warn('       node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
} else if (!secretStrengthOk(process.env.WEBHOOK_SECRET)) {
  console.error('[env] WEBHOOK_SECRET is too weak — it must be at least 32 random bytes.');
  process.exit(1);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL || '',
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
};
