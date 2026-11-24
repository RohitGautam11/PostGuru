import { ForbiddenException } from '@nestjs/common';
import { env } from '../config/env';
import type { AuthUser } from './decorators';

/** Platform admins (the PostGuru team), configured with ADMIN_EMAILS. Not the same as a workspace ADMIN role. */
export function isPlatformAdmin(email?: string | null): boolean {
  if (!email) return false;
  const list = env()
    .ADMIN_EMAILS.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export function assertPlatformAdmin(user: AuthUser) {
  if (!isPlatformAdmin(user.email)) throw new ForbiddenException('Admins only');
}

export function adminEmails(): string[] {
  return env()
    .ADMIN_EMAILS.split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}
