import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { env } from '../config/env';
import { sha256 } from './crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, IS_PUBLIC, MIN_ROLE, ROLE_RANK } from './decorators';

export const ACCESS_COOKIE = 'sh_at';
export const REFRESH_COOKIE = 'sh_rt';
export const API_KEY_PREFIX = 'pk_live_';
const API_KEY_BLOCKED = /\/(auth\/(?!me$)|billing|workspace\/api-keys|workspace\/invite-link|users\/me\/(password|delete|2fa|sessions))/;

export interface AccessPayload {
  sub: string;
  wid: string;
}

/**
 * Global authentication guard. Accepts `Authorization: Bearer <jwt>` or the httpOnly access cookie,
 * then re-loads the membership on every request so role changes and removals take effect immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.[ACCESS_COOKIE];
    if (!token) throw new UnauthorizedException('Authentication required');
    if (token.startsWith(API_KEY_PREFIX)) {
      req.user = await this.authenticateApiKey(token, req.path);
      return true;
    }

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, { secret: env().JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException('Session expired');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: payload.sub, workspaceId: payload.wid } },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!membership) throw new UnauthorizedException('Workspace access revoked');

    req.user = {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      workspaceId: membership.workspaceId,
      role: membership.role,
    };
    return true;
  }

  /**
   * Workspace API keys (Settings → API & Integrations) act as the member who created them, with
   * that member's current role. Account-security, billing and key-management routes stay session-only.
   */
  private async authenticateApiKey(key: string, path: string): Promise<AuthUser> {
    if (API_KEY_BLOCKED.test(path)) throw new ForbiddenException('This endpoint cannot be used with an API key');
    const record = await this.prisma.apiKey.findUnique({ where: { keyHash: sha256(key) } });
    if (!record || record.revokedAt) throw new UnauthorizedException('Invalid API key');
    const membership = await this.prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: record.createdById, workspaceId: record.workspaceId } },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!membership) throw new UnauthorizedException('The member who created this API key no longer has access');
    if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 5 * 60_000) {
      await this.prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
    }
    return {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      workspaceId: membership.workspaceId,
      role: membership.role,
    };
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role>(MIN_ROLE, [ctx.getHandler(), ctx.getClass()]);
    if (!required) return true;
    const user: AuthUser | undefined = ctx.switchToHttp().getRequest().user;
    if (!user) return true; // public route
    if (ROLE_RANK[user.role] < ROLE_RANK[required]) {
      throw new ForbiddenException(`This action requires the ${required.toLowerCase()} role or higher`);
    }
    return true;
  }
}
