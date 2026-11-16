import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  workspaceId: string;
  role: Role;
}

export const IS_PUBLIC = 'isPublic';
/** Skip JWT authentication for this route. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const MIN_ROLE = 'minRole';
/** Require at least this workspace role (OWNER > ADMIN > EDITOR > VIEWER). */
export const MinRole = (role: Role) => SetMetadata(MIN_ROLE, role);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const ROLE_RANK: Record<Role, number> = { OWNER: 4, ADMIN: 3, EDITOR: 2, VIEWER: 1 };
