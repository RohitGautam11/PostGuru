import { Provider } from '@prisma/client';
import { env } from '../../../config/env';
import { ProviderError, request, sleep } from '../../../common/http';
import {
  AccountContext,
  AccountMetrics,
  ConnectedAccount,
  OAuthTokens,
  PostMetrics,
  ProviderCapabilities,
  PublishInput,
  PublishResult,
  RemoteComment,
  SocialProvider,
} from '../provider.types';

/**
 * Threads (Meta) — https://developers.facebook.com/docs/threads
 * Uses the "Access the Threads API" use case of a Meta app; it has its own app id/secret
 * (Meta app dashboard → Use cases → Threads API → Settings).
 */
const GRAPH = 'https://graph.threads.net/v1.0';
const SCOPES = ['threads_basic', 'threads_content_publish', 'threads_manage_replies', 'threads_read_replies', 'threads_manage_insights'];

export class ThreadsProvider implements SocialProvider {
  readonly key = Provider.THREADS;
  readonly displayName = 'Threads';
  readonly usesPkce = false;
  readonly capabilities: ProviderCapabilities = {
    maxChars: 500,
    maxImages: 20,
    video: true,
    requiresMedia: false,
    requiresVideo: false,
    comments: true,
    replyComments: true,
    hideComments: true,
    deleteComments: false,
    inbox: false,
    analytics: true,
  };

  isConfigured() {
    return Boolean(env().THREADS_APP_ID && env().THREADS_APP_SECRET);
  }

  getAuthUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL('https://threads.net/oauth/authorize');
    u.searchParams.set('client_id', env().THREADS_APP_ID ?? '');
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('scope', SCOPES.join(','));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('state', state);
    return u.toString();
  }

  async handleCallback({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const short = await request<{ access_token: string; user_id: string }>('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      form: {
        client_id: env().THREADS_APP_ID ?? '',
        client_secret: env().THREADS_APP_SECRET ?? '',
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      },
    });
    // Exchange the 1-hour token for a 60-day token.
    const long = await request<{ access_token: string; expires_in: number }>('https://graph.threads.net/access_token', {
      query: { grant_type: 'th_exchange_token', client_secret: env().THREADS_APP_SECRET, access_token: short.access_token },
    });
    const token = long.access_token;
    const me = await request<{ id: string; username: string; name?: string; threads_profile_picture_url?: string }>(`${GRAPH}/me`, {
      query: { access_token: token, fields: 'id,username,name,threads_profile_picture_url' },
    });
    const followers = await this.followers(me.id, token).catch(() => null);
    return [
      {
        provider: Provider.THREADS,
        accessToken: token,
        // Threads refreshes the long-lived token itself (no separate refresh token).
        refreshToken: token,
        expiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86400) * 1000),
        externalId: me.id,
        name: me.name || me.username,
        username: me.username,
        avatarUrl: me.threads_profile_picture_url ?? null,
        scopes: SCOPES,
        followers,
      },
    ];
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const r = await request<{ access_token: string; expires_in: number }>('https://graph.threads.net/refresh_access_token', {
      query: { grant_type: 'th_refresh_token', access_token: refreshToken },
    });
    return { accessToken: r.access_token, refreshToken: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
  }

  private async createContainer(ctx: AccountContext, params: Record<string, string>) {
    const r = await request<{ id: string }>(`${GRAPH}/${ctx.externalId}/threads`, {
      method: 'POST',
      form: { access_token: ctx.accessToken, ...params },
    });
    return r.id;
  }

  private async waitForContainer(id: string, token: string) {
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      const s = await request<{ status: string; error_message?: string }>(`${GRAPH}/${id}`, {
        query: { access_token: token, fields: 'status,error_message' },
      });
      if (s.status === 'FINISHED' || s.status === 'PUBLISHED') return;
      if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new ProviderError(`Threads could not process the media: ${s.error_message ?? s.status}`);
      await sleep(3000);
    }
    throw new ProviderError('Threads took too long to process the media', 0, true);
  }

  private async publishContainer(ctx: AccountContext, containerId: string): Promise<PublishResult> {
    await this.waitForContainer(containerId, ctx.accessToken);
    const published = await request<{ id: string }>(`${GRAPH}/${ctx.externalId}/threads_publish`, {
      method: 'POST',
      form: { access_token: ctx.accessToken, creation_id: containerId },
    });
    const info = await request<{ permalink?: string }>(`${GRAPH}/${published.id}`, {
      query: { access_token: ctx.accessToken, fields: 'permalink' },
    }).catch(() => ({ permalink: undefined }));
    return { externalId: published.id, permalink: info.permalink ?? null };
  }

  async publish(ctx: AccountContext, input: PublishInput): Promise<PublishResult> {
    const text = input.link && !input.text.includes(input.link) ? `${input.text}\n\n${input.link}`.trim() : input.text;
    const mediaParams = (m: PublishInput['media'][number]): Record<string, string> =>
      m.type === 'VIDEO' ? { media_type: 'VIDEO', video_url: m.url } : { media_type: 'IMAGE', image_url: m.url };

    let containerId: string;
    if (input.media.length === 0) {
      containerId = await this.createContainer(ctx, { media_type: 'TEXT', text });
    } else if (input.media.length === 1) {
      containerId = await this.createContainer(ctx, { ...mediaParams(input.media[0]), text });
    } else {
      const children: string[] = [];
      for (const m of input.media) {
        const child = await this.createContainer(ctx, { ...mediaParams(m), is_carousel_item: 'true' });
        if (m.type === 'VIDEO') await this.waitForContainer(child, ctx.accessToken);
        children.push(child);
      }
      containerId = await this.createContainer(ctx, { media_type: 'CAROUSEL', children: children.join(','), text });
    }
    return this.publishContainer(ctx, containerId);
  }

  async deletePost(ctx: AccountContext, externalId: string) {
    await request(`${GRAPH}/${externalId}`, { method: 'DELETE', query: { access_token: ctx.accessToken } });
  }

  async fetchComments(ctx: AccountContext, knownPostIds: string[]): Promise<RemoteComment[]> {
    const recent = await request<{ data: { id: string; text?: string; permalink?: string }[] }>(`${GRAPH}/${ctx.externalId}/threads`, {
      query: { access_token: ctx.accessToken, fields: 'id,text,permalink', limit: 25 },
    }).catch(() => ({ data: [] as { id: string; text?: string; permalink?: string }[] }));
    const posts = new Map(recent.data.map((p) => [p.id, p]));
    for (const id of knownPostIds) if (!posts.has(id)) posts.set(id, { id });

    const out: RemoteComment[] = [];
    for (const post of posts.values()) {
      const replies = await request<{ data: any[] }>(`${GRAPH}/${post.id}/replies`, {
        query: { access_token: ctx.accessToken, fields: 'id,text,username,timestamp,hide_status,replied_to,is_reply_owned_by_me' },
      }).catch(() => ({ data: [] as any[] }));
      for (const r of replies.data ?? []) {
        if (!r.text) continue;
        out.push({
          externalId: r.id,
          externalPostId: post.id,
          parentExternalId: r.replied_to?.id && r.replied_to.id !== post.id ? r.replied_to.id : null,
          postPermalink: post.permalink ?? null,
          postPreview: post.text?.slice(0, 140) ?? null,
          authorName: r.username ?? 'Threads user',
          authorHandle: r.username ? `@${r.username}` : null,
          text: r.text,
          hidden: r.hide_status === 'HIDDEN',
          isOwn: !!r.is_reply_owned_by_me,
          postedAt: new Date(r.timestamp),
        });
      }
    }
    return out;
  }

  async replyToComment(ctx: AccountContext, comment: { externalId: string }, text: string) {
    const containerId = await this.createContainer(ctx, { media_type: 'TEXT', text, reply_to_id: comment.externalId });
    const r = await this.publishContainer(ctx, containerId);
    return { externalId: r.externalId };
  }

  async hideComment(ctx: AccountContext, externalId: string, hidden: boolean) {
    await request(`${GRAPH}/${externalId}/manage_reply`, { method: 'POST', form: { access_token: ctx.accessToken, hide: String(hidden) } });
  }

  private async followers(userId: string, token: string) {
    const r = await request<{ data: { name: string; total_value?: { value: number } }[] }>(`${GRAPH}/${userId}/threads_insights`, {
      query: { access_token: token, metric: 'followers_count' },
    });
    return r.data?.find((d) => d.name === 'followers_count')?.total_value?.value ?? null;
  }

  async fetchAccountMetrics(ctx: AccountContext): Promise<AccountMetrics> {
    const r = await request<{ data: { name: string; total_value?: { value: number }; values?: { value: number }[] }[] }>(
      `${GRAPH}/${ctx.externalId}/threads_insights`,
      { query: { access_token: ctx.accessToken, metric: 'views,likes,replies,reposts,quotes,followers_count' } },
    );
    const v = (n: string) => {
      const d = r.data?.find((x) => x.name === n);
      return d?.total_value?.value ?? d?.values?.reduce((s, x) => s + (x.value ?? 0), 0) ?? 0;
    };
    return {
      followers: v('followers_count') || undefined,
      impressions: v('views'),
      engagement: v('likes') + v('replies') + v('reposts') + v('quotes'),
    };
  }

  async fetchPostMetrics(ctx: AccountContext, externalId: string): Promise<PostMetrics> {
    const r = await request<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
      `${GRAPH}/${externalId}/insights`,
      { query: { access_token: ctx.accessToken, metric: 'views,likes,replies,reposts,quotes,shares' } },
    );
    const v = (n: string) => {
      const d = r.data?.find((x) => x.name === n);
      return d?.total_value?.value ?? d?.values?.[0]?.value ?? 0;
    };
    return { likes: v('likes'), comments: v('replies'), shares: v('reposts') + v('quotes') + v('shares'), impressions: v('views') };
  }
}
