import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@nyx/contracts';
import { randomUUID } from 'node:crypto';

export function createTestAccessToken(
  app: INestApplication,
  params: {
    role: UserRole;
    customerId?: string | null;
    email?: string;
    name?: string;
  },
): string {
  return app.get(JwtService).sign({
    sub: randomUUID(),
    email: params.email ?? `${params.role}@nyx.test`,
    name: params.name ?? `${params.role} test user`,
    role: params.role,
    customerId: params.customerId ?? null,
  });
}
