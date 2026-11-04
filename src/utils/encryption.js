import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
// Derive a 32-byte key from ENCRYPTION_SECRET using sha256
const getKey = () => crypto.createHash('sha256').update(env.encryptionSecret).digest();

export function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

export function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const [ivHex, tagHex, contentHex] = encryptedText.split(':');
    if (!ivHex || !tagHex || !contentHex) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(contentHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[encryption] decryption failed:', err.message);
    return null;
  }
}
