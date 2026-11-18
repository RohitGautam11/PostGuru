import { Provider } from '@prisma/client';
import { env } from '../../../config/env';
import { downloadMedia, ProviderError, request, requestRaw } from '../../../common/http';
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

const API = 'https://www.googleapis.com/youtube/v3';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly',
];

export class YouTubeProvider implements SocialProvider {
  readonly key = Provider.YOUTUBE;
  readonly displayName = 'YouTube';
  readonly usesPkce = true;
  readonly capabilities: ProviderCapabilities = {
    maxChars: 5000,
    maxImages: 0,
    video: true,
    requiresMedia: true,
    requiresVideo: true,
    comments: true,
    replyComments: true,
    hideComments: true,
    deleteComments: true,
    inbox: false,
    analytics: true,
  };

  isConfigured() {
    return Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET);
  }

  private auth(ctx: AccountContext) {
    return { Authorization: `Bearer ${ctx.accessToken}` };
  }

  getAuthUrl({ state, redirectUri, codeChallenge }: { state: string; redirectUri: string; codeChallenge?: string }) {
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', env().GOOGLE_CLIENT_ID ?? '');
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPES.join(' '));
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent');
    u.searchParams.set('include_granted_scopes', 'true');
    u.searchParams.set('state', state);
    u.searchParams.set('code_challenge', codeChallenge ?? '');
    u.searchParams.set('code_challenge_method', 'S256');
    return u.toString();
  }

  private toTokens(t: any): OAuthTokens {
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
    };
  }

  async handleCallback({ code, redirectUri, codeVerifier }: { code: string; redirectUri: string; codeVerifier?: string | null }) {
    const tokens = this.toTokens(
      await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        form: {
          code,
          client_id: env().GOOGLE_CLIENT_ID ?? '',
          client_secret: env().GOOGLE_CLIENT_SECRET ?? '',
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier ?? '',
        },
      }),
    );
    const res = await request<{ items?: any[] }>(`${API}/channels`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      query: { part: 'snippet,statistics', mine: 'true' },
    });
    if (!res.items?.length) throw new ProviderError('This Google account has no YouTube channel');
    return res.items.map(
      (c): ConnectedAccount => ({
        ...tokens,
        provider: Provider.YOUTUBE,
        externalId: c.id,
        name: c.snippet?.title ?? 'YouTube channel',
        username: c.snippet?.customUrl ?? null,
        avatarUrl: c.snippet?.thumbnails?.default?.url ?? null,
        scopes: SCOPES,
        followers: Number(c.statistics?.subscriberCount ?? 0),
        metadata: {},
      }),
    );
  }

  async refreshTokens(refreshToken: string) {
    const t = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      form: {
        refresh_token: refreshToken,
        client_id: env().GOOGLE_CLIENT_ID ?? '',
        client_secret: env().GOOGLE_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
      },
    });
    // Google does not return a new refresh token on refresh; keep the existing one.
    return { ...this.toTokens(t), refreshToken: t.refresh_token ?? refreshToken };
  }

  async publish(ctx: AccountContext, input: PublishInput): Promise<PublishResult> {
    const video = input.media.find((m) => m.type === 'VIDEO');
    if (!video) throw new ProviderError('YouTube requires a video');
    const { buffer, mimeType } = await downloadMedia(video.url);
    const firstLine = input.text.split('\n')[0]?.trim();
    const title = (input.title || firstLine || 'New video').slice(0, 100);
    const description = input.link ? `${input.text}\n\n${input.link}` : input.text;

    const session = await requestRaw(`https://www.googleapis.com/upload/youtube/v3/videos`, {
      method: 'POST',
      query: { uploadType: 'resumable', part: 'snippet,status' },
      headers: {
        ...this.auth(ctx),
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': String(buffer.length),
      },
      json: {
        snippet: { title, description: description.slice(0, 5000), ...(input.tags?.length ? { tags: input.tags } : {}) },
        status: { privacyStatus: 'public' },
      },
    });
    const uploadUrl = session.headers.get('location');
    if (!uploadUrl) throw new ProviderError('YouTube did not return an upload URL');

    const uploaded = await requestRaw(uploadUrl, {
      method: 'PUT',
      headers: { ...this.auth(ctx), 'Content-Type': mimeType },
      body: new Uint8Array(buffer),
      timeoutMs: 280_000,
    });
    const data = (await uploaded.json()) as { id: string };
    return { externalId: data.id, permalink: `https://www.youtube.com/watch?v=${data.id}` };
  }

  async deletePost(ctx: AccountContext, externalId: string) {
    await request(`${API}/videos`, { method: 'DELETE', headers: this.auth(ctx), query: { id: externalId } });
  }

  async fetchComments(ctx: AccountContext): Promise<RemoteComment[]> {
    const res = await request<{ items?: any[] }>(`${API}/commentThreads`, {
      headers: this.auth(ctx),
      query: { part: 'snippet,replies', allThreadsRelatedToChannelId: ctx.externalId, maxResults: 50, order: 'time' },
    });
    const out: RemoteComment[] = [];
    const map = (c: any, videoId: string, parent: string | null): RemoteComment => ({
      externalId: c.id,
      externalPostId: videoId,
      parentExternalId: parent,
      postPermalink: `https://www.youtube.com/watch?v=${videoId}`,
      authorExternalId: c.snippet?.authorChannelId?.value ?? null,
      authorName: c.snippet?.authorDisplayName ?? 'YouTube user',
      authorHandle: c.snippet?.authorDisplayName ?? null,
      authorAvatar: c.snippet?.authorProfileImageUrl ?? null,
      text: c.snippet?.textOriginal ?? c.snippet?.textDisplay ?? '',
      likeCount: c.snippet?.likeCount ?? 0,
      hidden: c.snippet?.moderationStatus === 'heldForReview',
      isOwn: c.snippet?.authorChannelId?.value === ctx.externalId,
      postedAt: new Date(c.snippet?.publishedAt ?? Date.now()),
    });
    for (const t of res.items ?? []) {
      const videoId = t.snippet?.videoId;
      const top = t.snippet?.topLevelComment;
      if (!videoId || !top) continue;
      out.push(map(top, videoId, null));
      for (const r of t.replies?.comments ?? []) out.push(map(r, videoId, top.id));
    }
    return out;
  }

  async replyToComment(ctx: AccountContext, comment: { externalId: string }, text: string) {
    const res = await request<{ id: string }>(`${API}/comments`, {
      method: 'POST',
      headers: this.auth(ctx),
      query: { part: 'snippet' },
      json: { snippet: { parentId: comment.externalId, textOriginal: text } },
    });
    return { externalId: res.id };
  }

  async hideComment(ctx: AccountContext, externalId: string, hidden: boolean) {
    await request(`${API}/comments/setModerationStatus`, {
      method: 'POST',
      headers: this.auth(ctx),
      query: { id: externalId, moderationStatus: hidden ? 'heldForReview' : 'published' },
    });
  }

  async deleteComment(ctx: AccountContext, externalId: string) {
    await request(`${API}/comments`, { method: 'DELETE', headers: this.auth(ctx), query: { id: externalId } });
  }

  async fetchAccountMetrics(ctx: AccountContext): Promise<AccountMetrics> {
    const res = await request<{ items?: any[] }>(`${API}/channels`, {
      headers: this.auth(ctx),
      query: { part: 'statistics', id: ctx.externalId },
    });
    const s = res.items?.[0]?.statistics ?? {};
    return { followers: Number(s.subscriberCount ?? 0), impressions: Number(s.viewCount ?? 0) };
  }

  async fetchPostMetrics(ctx: AccountContext, externalId: string): Promise<PostMetrics> {
    const res = await request<{ items?: any[] }>(`${API}/videos`, {
      headers: this.auth(ctx),
      query: { part: 'statistics', id: externalId },
    });
    const s = res.items?.[0]?.statistics ?? {};
    return {
      likes: Number(s.likeCount ?? 0),
      comments: Number(s.commentCount ?? 0),
      impressions: Number(s.viewCount ?? 0),
    };
  }
}
