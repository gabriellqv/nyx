import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const prefix = 'enc:v1:';
const additionalData = Buffer.from('nyx-webhook-secret:v1');

function encryptionKey(): Buffer | null {
  const configuredKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
  if (configuredKey) {
    return Buffer.from(configuredKey, 'hex');
  }
  if (process.env.NODE_ENV === 'test') {
    return createHash('sha256').update('nyx-webhook-test-key').digest();
  }
  if (process.env.NODE_ENV !== 'production') {
    return createHash('sha256').update('nyx-webhook-development-key').digest();
  }
  return null;
}

export function encryptWebhookSecret(secret: string): string {
  const key = encryptionKey();
  if (!key) {
    return secret;
  }

  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(additionalData);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${prefix}${nonce.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptWebhookSecret(storedSecret: string): string {
  if (!storedSecret.startsWith(prefix)) {
    return storedSecret;
  }

  const key = encryptionKey();
  if (!key) {
    throw new Error('WEBHOOK_SECRET_ENCRYPTION_KEY is required to read encrypted webhook secrets');
  }

  const [nonceHex, tagHex, ciphertextHex] = storedSecret.slice(prefix.length).split(':');
  if (!nonceHex || !tagHex || !ciphertextHex) {
    throw new Error('Stored webhook secret has an invalid encrypted format');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonceHex, 'hex'));
  decipher.setAAD(additionalData);
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}
