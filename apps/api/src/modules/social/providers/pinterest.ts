import { Provider } from '@prisma/client';
import { env } from '../../../config/env';
import { ProviderError, request, requestRaw, sleep } from '../../../common/http';
import {
  AccountContext,
  AccountMetrics,
  ConnectedAccount,
  OAuthTokens,
  PostMetrics,
  ProviderCapabilities,
  PublishInput,
  PublishResult,
  SocialProvider,
} from '../provider.types';

/**
 * Pinterest API v5 — https://developers.pinterest.com/docs/api/v5/
 * Every board is offered as its own connectable "account", so users pick the board in the composer.
 * Apps with Trial access can only write to the sandbox: set PINTEREST_SANDBOX=true until Standard access is granted.
 */
const SCOPES = ['user_accounts:read', 'boards:read', 'boards:write', 'pins:read', 'pins:write'];
const api = () => (env().PINTEREST_SANDBOX ? 'https://api-sandbox.pinterest.com/v5' : 'https://api.pinterest.com/v5');
const basic = () => `Basic ${Buffer.from(`${env().PINTEREST_APP_ID}:${env().PINTEREST_APP_SECRET}`).toString('base64')}`;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

export class PinterestProvider implements SocialProvider {
  readonly key = Provider.PINTEREST;
  readonly displayName = 'Pinterest';
  readonly usesPkce = false;
  readonly capabilities: ProviderCapabilities = {
    maxChars: 500,
    maxImages: 5,
    video: true,
    requiresMedia: true,
    requiresVideo: false,
    comments: false,
    replyComments: false,
    hideComments: false,
    deleteComments: false,
    inbox: false,
    analytics: true,
  };

  isConfigured() {
    return Boolean(env().PINTEREST_APP_ID && env().PINTEREST_APP_SECRET);
  }

  getAuthUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL('https://www.pinterest.com/oauth/');
    u.searchParams.set('client_id', env().PINTEREST_APP_ID ?? '');
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES.join(','));
    u.searchParams.set('state', state);
    return u.toString();
  }

  private async token(form: Record<string, string>): Promise<OAuthTokens> {
    // Token endpoint is always production, even for sandbox apps.
    const t = await request<{ access_token: string; refresh_token?: string; expires_in?: number }>('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: { Authorization: basic() },
      form,
    });
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
    };
  }

  async handleCallback({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const tokens = await this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
    const me = await request<{ username: string; profile_image?: string; follower_count?: number; business_name?: string }>(
      `${api()}/user_account`,
      { headers: auth(tokens.accessToken) },
    );
    let boards = await request<{ items: { id: string; name: string }[] }>(`${api()}/boards`, {
      headers: auth(tokens.accessToken),
      query: { page_size: 100 },
    });
    if (!boards.items?.length) {
      const created = await request<{ id: string; name: string }>(`${api()}/boards`, {
        method: 'POST',
        headers: auth(tokens.accessToken),
        json: { name: env().APP_NAME, privacy: 'PUBLIC' },
      });
      boards = { items: [created] };
    }
    return boards.items.map((b) => ({
      ...tokens,
      provider: Provider.PINTEREST,
      externalId: `board:${b.id}`,
      name: `${me.business_name || me.username} · ${b.name}`,
      username: me.username,
      avatarUrl: me.profile_image ?? null,
      scopes: SCOPES,
      followers: me.follower_count ?? null,
      metadata: { boardId: b.id, boardName: b.name },
    }));
  }

  async refreshTokens(refreshToken: string) {
    const t = await this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  }

  private async uploadVideo(token: string, url: string): Promise<string> {
    const reg = await request<{ media_id: string; upload_url: string; upload_parameters: Record<string, string> }>(`${api()}/media`, {
      method: 'POST',
      headers: auth(token),
      json: { media_type: 'video' },
    });
    const file = await requestRaw(url, { headers: { Accept: '*/*' }, timeoutMs: 120_000 });
    const form = new FormData();
    for (const [k, v] of Object.entries(reg.upload_parameters)) form.append(k, v);
    form.append('file', new Blob([await file.arrayBuffer()]));
    await requestRaw(reg.upload_url, { method: 'POST', body: form, timeoutMs: 300_000 });

    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      const s = await request<{ status: string }>(`${api()}/media/${reg.media_id}`, { headers: auth(token) });
      if (s.status === 'succeeded') return reg.media_id;
      if (s.status === 'failed') throw new ProviderError('Pinterest could not process the video');
      await sleep(4000);
    }
    throw new ProviderError('Pinterest took too long to process the video', 0, true);
  }

  async publish(ctx: AccountContext, input: PublishInput): Promise<PublishResult> {
    const boardId = ctx.metadata?.boardId ?? ctx.externalId.replace(/^board:/, '');
    const images = input.media.filter((m) => m.type === 'IMAGE');
    const video = input.media.find((m) => m.type === 'VIDEO');
    if (!images.length && !video) throw new ProviderError('Pinterest needs an image or a video');

    let media_source: Record<string, unknown>;
    if (video) {
      const mediaId = await this.uploadVideo(ctx.accessToken, video.url);
      media_source = images[0]
        ? { source_type: 'video_id', media_id: mediaId, cover_image_url: images[0].url }
        : { source_type: 'video_id', media_id: mediaId, cover_image_key_frame_time: 1 };
    } else if (images.length === 1) {
      media_source = { source_type: 'image_url', url: images[0].url };
    } else {
      media_source = { source_type: 'multiple_image_urls', items: images.map((i) => ({ url: i.url })) };
    }

    const firstLine = input.text.split('\n')[0]?.trim() ?? '';
    const pin = await request<{ id: string }>(`${api()}/pins`, {
      method: 'POST',
      headers: auth(ctx.accessToken),
      json: {
        board_id: boardId,
        title: (input.title || firstLine).slice(0, 100) || undefined,
        description: input.text.slice(0, 500),
        link: input.link || undefined,
        media_source,
      },
    });
    return { externalId: pin.id, permalink: `https://www.pinterest.com/pin/${pin.id}/` };
  }

  async deletePost(ctx: AccountContext, externalId: string) {
    await request(`${api()}/pins/${externalId}`, { method: 'DELETE', headers: auth(ctx.accessToken) });
  }

  private range() {
    const d = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
    return { start_date: d(30), end_date: d(0) };
  }

  async fetchAccountMetrics(ctx: AccountContext): Promise<AccountMetrics> {
    const [me, a] = await Promise.all([
      request<{ follower_count?: number }>(`${api()}/user_account`, { headers: auth(ctx.accessToken) }),
      request<any>(`${api()}/user_account/analytics`, { headers: auth(ctx.accessToken), query: this.range() }).catch(() => null),
    ]);
    const s = a?.all?.summary_metrics ?? {};
    return { followers: me.follower_count, impressions: s.IMPRESSION, engagement: s.ENGAGEMENT ?? (s.SAVE ?? 0) + (s.PIN_CLICK ?? 0) };
  }

  async fetchPostMetrics(ctx: AccountContext, externalId: string): Promise<PostMetrics> {
    const a = await request<any>(`${api()}/pins/${externalId}/analytics`, {
      headers: auth(ctx.accessToken),
      query: { ...this.range(), metric_types: 'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK' },
    });
    const s = a?.all?.lifetime_metrics ?? a?.all?.summary_metrics ?? {};
    return { impressions: s.IMPRESSION, shares: s.SAVE, likes: s.PIN_CLICK };
  }
}
