import { ForbiddenException } from '@nestjs/common';
import type { UserProfile } from '@nyx/contracts';

export function assertCanReadCustomer(user: UserProfile, customerId: string): void {
  if (user.role === 'admin' || user.role === 'auditor') {
    return;
  }

  if (!user.customerId || user.customerId !== customerId) {
    throw new ForbiddenException('User is not authorized to access this customer resource');
  }
}

export function assertCanOperateAccount(user: UserProfile, customerId: string): void {
  if (user.role === 'admin') {
    return;
  }

  if (user.role !== 'user' || !user.customerId || user.customerId !== customerId) {
    throw new ForbiddenException('User is not authorized to operate this account');
  }
}
