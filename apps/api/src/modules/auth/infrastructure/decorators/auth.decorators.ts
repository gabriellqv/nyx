import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole, UserProfile } from '@nyx/contracts';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]): MethodDecorator => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserProfile | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: UserProfile }>();
    return request.user;
  },
);
