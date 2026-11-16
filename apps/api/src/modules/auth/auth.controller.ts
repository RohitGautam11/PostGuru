import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { env, isProd } from '../../config/env';
import { pkcePair, randomToken, safeEqual } from '../../common/crypto';
import { AuthUser, CurrentUser, Public } from '../../common/decorators';
import { REFRESH_COOKIE } from '../../common/guards';
import { ForgotPasswordDto, LoginDto, MfaDto, RegisterDto, ResetPasswordDto, SwitchWorkspaceDto } from './auth.dto';
import { AuthService, isPendingMfa, MFA_COOKIE } from './auth.service';

const client = (req: Request) => ({ userAgent: req.headers['user-agent'], ip: req.ip });
const GOOGLE_STATE_COOKIE = 'sh_gs';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.register(dto, client(req));
    this.auth.setCookies(res, session);
    return { accessToken: session.accessToken, expiresIn: session.expiresIn };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, client(req));
    if (isPendingMfa(result)) {
      this.auth.setMfaCookie(res, result.mfaToken);
      return { mfaRequired: true };
    }
    this.auth.setCookies(res, result);
    return { accessToken: result.accessToken, expiresIn: result.expiresIn };
  }

  /** Second sign-in step for accounts with two-factor authentication. */
  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login/2fa')
  async loginMfa(@Body() dto: MfaDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.verifyMfa(req.cookies?.[MFA_COOKIE], dto.code, client(req));
    this.auth.clearMfaCookie(res);
    this.auth.setCookies(res, session);
    return { accessToken: session.accessToken, expiresIn: session.expiresIn };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const session = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken, client(req));
      this.auth.setCookies(res, session);
      return { accessToken: session.accessToken, expiresIn: session.expiresIn };
    } catch (err) {
      this.auth.clearCookies(res);
      throw err;
    }
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    this.auth.clearCookies(res);
    return { ok: true };
  }

  /** Public preview of an invitation or invite link (workspace name and role). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('invite/:token')
  invite(@Param('token') token: string) {
    return this.auth.describeInvite(token);
  }

  @Public()
  @Get('providers')
  providers() {
    return { google: this.auth.googleEnabled() };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('google')
  google(@Query('next') next: string | undefined, @Res() res: Response) {
    if (!this.auth.googleEnabled()) return res.redirect(`${env().WEB_URL}/login?error=${encodeURIComponent('Google sign-in is not configured')}`);
    const state = randomToken(24);
    const { verifier, challenge } = pkcePair();
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
    res.cookie(GOOGLE_STATE_COOKIE, `${state}|${verifier}|${safeNext}`, {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: 10 * 60 * 1000,
    });
    return res.redirect(this.auth.googleAuthUrl(state, challenge));
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const fail = (msg: string) => res.redirect(`${env().WEB_URL}/login?error=${encodeURIComponent(msg)}`);
    const [expected, verifier, next] = String(req.cookies?.[GOOGLE_STATE_COOKIE] ?? '').split('|');
    res.clearCookie(GOOGLE_STATE_COOKIE, { path: '/api/auth/google' });
    if (error) return fail('Google sign-in was cancelled');
    if (!code || !state || !expected || !safeEqual(state, expected)) return fail('Sign-in request expired. Please try again.');
    try {
      const result = await this.auth.loginWithGoogle(code, verifier, client(req));
      if (isPendingMfa(result)) {
        this.auth.setMfaCookie(res, result.mfaToken);
        return res.redirect(`${env().WEB_URL}/login?mfa=1&next=${encodeURIComponent(next || '/dashboard')}`);
      }
      this.auth.setCookies(res, result);
      return res.redirect(`${env().WEB_URL}${next || '/dashboard'}`);
    } catch (err) {
      return fail((err as Error).message);
    }
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id, user.workspaceId);
  }

  @HttpCode(200)
  @Post('switch-workspace')
  async switch(
    @CurrentUser() user: AuthUser,
    @Body() dto: SwitchWorkspaceDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.switchWorkspace(user.id, dto.workspaceId, client(req));
    this.auth.setCookies(res, session);
    return { ok: true };
  }

  @HttpCode(200)
  @Post('accept-invite')
  async acceptInvite(
    @CurrentUser() user: AuthUser,
    @Body('token') token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const workspaceId = await this.auth.acceptInvite(user.id, String(token ?? ''));
    const session = await this.auth.switchWorkspace(user.id, workspaceId, client(req));
    this.auth.setCookies(res, session);
    return { ok: true, workspaceId };
  }
}
