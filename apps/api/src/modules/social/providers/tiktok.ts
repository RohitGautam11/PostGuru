import { Provider } from '@prisma/client';
import { env } from '../../../config/env';
import { downloadMedia, ProviderError, request, requestRaw, sleep } from '../../../common/http';
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
 * TikTok — Login Kit + Content Posting API (Direct Post).
 * https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 * Until TikTok audits the app, posts can only be published as private ("Only me").
 */
const API = 'https://open.tiktokapis.com/v2';
const SCOPES = ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.publish', 'video.list'];
const MB = 1024 * 1024;

interface TikTokEnvelope<T> {
  data: T;
  error?: { code: string; message: string; log_id?: string };
}

async function tt<T>(url: string, token: string, json?: unknown, query?: Record<string, string>): Promise<T> {
  const r = await request<TikTokEnvelope<T>>(url, {
    method: json === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}` },
    json,
    query,
  });
  if (r?.error && r.error.code !== 'ok') {
    const auth = /access_token|scope_not_authorized|token/i.test(r.error.code);
    throw new ProviderError(`TikTok: ${r.error.message || r.error.code}`, 400, r.error.code === 'rate_limit_exceeded', auth);
  }
  return r.data;
}

export class TikTokProvider implements SocialProvider {
  readonly key = Provider.TIKTOK;
  readonly displayName = 'TikTok';
  readonly usesPkce = false;
  readonly capabilities: ProviderCapabilities = {
    maxChars: 2200,
    maxImages: 0,
    video: true,
    requiresMedia: true,
    requiresVideo: true,
    comments: false,
    replyComments: false,
    hideComments: false,
    deleteComments: false,
    inbox: false,
    analytics: true,
  };

  isConfigured() {
    return Boolean(env().TIKTOK_CLIENT_KEY && env().TIKTOK_CLIENT_SECRET);
  }

  getAuthUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL('https://www.tiktok.com/v2/auth/authorize/');
    u.searchParams.set('client_key', env().TIKTOK_CLIENT_KEY ?? '');
    u.searchParams.set('scope', SCOPES.join(','));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    return u.toString();
  }

  private async token(form: Record<string, string>) {
    const t = await request<any>(`${API}/oauth/token/`, {
      method: 'POST',
      form: { client_key: env().TIKTOK_CLIENT_KEY ?? '', client_secret: env().TIKTOK_CLIENT_SECRET ?? '', ...form },
    });
    if (t.error) throw new ProviderError(`TikTok: ${t.error_description || t.error}`, 400, false, true);
    return t as { access_token: string; refresh_token: string; expires_in: number; open_id: string; scope: string };
  }

  async handleCallback({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const t = await this.token({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
    const { user } = await tt<{ user: any }>(`${API}/user/info/`, t.access_token, undefined, {
      fields: 'open_id,avatar_url,display_name,username,follower_count',
    });
    return [
      {
        provider: Provider.TIKTOK,
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: new Date(Date.now() + t.expires_in * 1000),
        externalId: t.open_id,
        name: user?.display_name || user?.username || 'TikTok account',
        username: user?.username ?? null,
        avatarUrl: user?.avatar_url ?? null,
        scopes: (t.scope ?? '').split(','),
        followers: user?.follower_count ?? null,
      },
    ];
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const t = await this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
    return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) };
  }

  async publish(ctx: AccountContext, input: PublishInput): Promise<PublishResult> {
    const video = input.media.find((m) => m.type === 'VIDEO');
    if (!video) throw new ProviderError('TikTok needs a video');

    // Privacy must be one of the options TikTok returns for this creator (unaudited apps: SELF_ONLY).
    const creator = await tt<{ privacy_level_options: string[] }>(`${API}/post/publish/creator_info/query/`, ctx.accessToken, {});
    const options = creator.privacy_level_options ?? [];
    const privacy = options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : options[0] ?? 'SELF_ONLY';

    const { buffer } = await downloadMedia(video.url);
    const size = buffer.length;
    // Chunks must be 5–64 MB; a file up to 64 MB goes in one chunk; the last chunk absorbs the remainder.
    const chunkSize = size <= 64 * MB ? size : 10 * MB;
    const chunks = size <= 64 * MB ? 1 : Math.floor(size / chunkSize);

    const caption = input.link && !input.text.includes(input.link) ? `${input.text}\n${input.link}` : input.text;
    const init = await tt<{ publish_id: string; upload_url: string }>(`${API}/post/publish/video/init/`, ctx.accessToken, {
      post_info: { title: caption.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: chunks },
    });

    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = i === chunks - 1 ? size : start + chunkSize;
      await requestRaw(init.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': video.mimeType || 'video/mp4', 'Content-Range': `bytes ${start}-${end - 1}/${size}` },
        body: new Uint8Array(buffer.subarray(start, end)),
        timeoutMs: 300_000,
      });
    }

    // TikTok processes the upload asynchronously.
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      const s = await tt<{ status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }>(
        `${API}/post/publish/status/fetch/`,
        ctx.accessToken,
        { publish_id: init.publish_id },
      );
      if (s.status === 'PUBLISH_COMPLETE') {
        const id = s.publicaly_available_post_id?.[0];
        return {
          externalId: id ? String(id) : init.publish_id,
          permalink: id && ctx.username ? `https://www.tiktok.com/@${ctx.username}/video/${id}` : null,
        };
      }
      if (s.status === 'FAILED') throw new ProviderError(`TikTok rejected the video: ${s.fail_reason ?? 'unknown reason'}`);
      await sleep(4000);
    }
    // Still processing: it was accepted; TikTok will finish it in the background (common for private posts).
    return { externalId: init.publish_id, permalink: null };
  }

  async fetchAccountMetrics(ctx: AccountContext): Promise<AccountMetrics> {
    const { user } = await tt<{ user: any }>(`${API}/user/info/`, ctx.accessToken, undefined, {
      fields: 'follower_count,likes_count,video_count',
    });
    return { followers: user?.follower_count, engagement: user?.likes_count };
  }

  async fetchPostMetrics(ctx: AccountContext, externalId: string): Promise<PostMetrics> {
    if (!/^\d+$/.test(externalId)) return {}; // still a publish_id, no public video yet
    const r = await tt<{ videos: any[] }>(
      `${API}/video/query/`,
      ctx.accessToken,
      { filters: { video_ids: [externalId] } },
      { fields: 'id,like_count,comment_count,share_count,view_count' },
    );
    const v = r.videos?.[0];
    return v ? { likes: v.like_count, comments: v.comment_count, shares: v.share_count, impressions: v.view_count } : {};
  }
}
