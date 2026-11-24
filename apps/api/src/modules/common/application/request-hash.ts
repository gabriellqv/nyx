import { createHash } from 'node:crypto';

export function hashRequest(value: Record<string, string | number | null>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
