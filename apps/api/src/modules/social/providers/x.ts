import { Provider } from '@prisma/client';
import { env } from '../../../config/env';
import { downloadMedia, ProviderError, request, sleep } from '../../../common/http';
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
  RemoteConversation,
  SocialProvider,
} from '../provider.types';

const API = 'https://api.x.com/2';
const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'dm.read', 'dm.write', 'media.write', 'tweet.moderate.write'];
const CHUNK = 4 * 1024 * 1024;

export class XProvider implements SocialProvider {
  readonly key = Provider.X;
  readonly displayName = 'X (Twitter)';
  readonly usesPkce = true;
  readonly capabilities: ProviderCapabilities = {
    maxChars: 280,
    maxImages: 4,
    video: true,
    requiresMedia: false,
    requiresVideo: false,
    comments: true,
    replyComments: true,
    hideComments: true,
    deleteComments: false,
    inbox: true,
    analytics: true,
  };

  isConfigured() {
    return Boolean(env().X_CLIENT_ID && env().X_CLIENT_SECRET);
  }

  private basicAuth() {
    return 'Basic ' + Buffer.from(`${env().X_CLIENT_ID}:${env().X_CLIENT_SECRET}`).toString('base64');
  }

  private auth(ctx: AccountContext) {
    return { Authorization: `Bearer ${ctx.accessToken}` };
  }

  getAuthUrl({ state, redirectUri, codeChallenge }: { state: string; redirectUri: string; codeChallenge?: string }) {
    const u = new URL('https://x.com/i/oauth2/authorize');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', env().X_CLIENT_ID ?? '');
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('scope', SCOPES.join(' '));
    u.searchParams.set('state', state);
    u.searchParams.set('code_challenge', codeChallenge ?? '');
    u.searchParams.set('code_challenge_method', 'S256');
    return u.toString();
  }

  private toTokens(t: { access_token: string; refresh_token?: string; expires_in?: number }): OAuthTokens {
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
    };
  }

  async handleCallback({ code, redirectUri, codeVerifier }: { code: string; redirectUri: string; codeVerifier?: string | null }) {
    const tokens = this.toTokens(
      await request(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: this.basicAuth() },
        form: { code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: codeVerifier ?? '' },
      }),
    );
    const me = await request<{ data: any }>(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      query: { 'user.fields': 'profile_image_url,public_metrics,username,name' },
    });
    const account: ConnectedAccount = {
      ...tokens,
      provider: Provider.X,
      externalId: me.data.id,
      name: me.data.name,
      username: me.data.username,
      avatarUrl: me.data.profile_image_url ?? null,
      scopes: SCOPES,
      followers: me.data.public_metrics?.followers_count ?? null,
      metadata: {},
    };
    return [account];
  }

  async refreshTokens(refreshToken: string) {
    return this.toTokens(
      await request(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { Authorization: this.basicAuth() },
        form: { refresh_token: refreshToken, grant_type: 'refresh_token' },
      }),
    );
  }

  private async uploadMedia(ctx: AccountContext, url: string, type: 'IMAGE' | 'VIDEO'): Promise<string> {
    const { buffer, mimeType } = await downloadMedia(url);

    if (type === 'IMAGE') {
      const form = new FormData();
      form.append('media', new Blob([new Uint8Array(buffer)], { type: mimeType }));
      form.append('media_category', 'tweet_image');
      const res = await request<{ data: { id: string } }>(`${API}/media/upload`, {
        method: 'POST',
        headers: this.auth(ctx),
        body: form,
        timeoutMs: 120_000,
      });
      return res.data.id;
    }

    // Chunked upload for video: initialize → append → finalize → poll status.
    const init = await request<{ data: { id: string } }>(`${API}/media/upload/initialize`, {
      method: 'POST',
      headers: this.auth(ctx),
      json: { media_type: mimeType, total_bytes: buffer.length, media_category: 'tweet_video' },
    });
    const id = init.data.id;
    for (let i = 0, seg = 0; i < buffer.length; i += CHUNK, seg++) {
      const form = new FormData();
      form.append('media', new Blob([new Uint8Array(buffer.subarray(i, i + CHUNK))], { type: 'application/octet-stream' }));
      form.append('segment_index', String(seg));
      await request(`${API}/media/upload/${id}/append`, { method: 'POST', headers: this.auth(ctx), body: form, timeoutMs: 120_000 });
    }
    let fin = await request<{ data: { processing_info?: { state: string; check_after_secs?: number; error?: any } } }>(
      `${API}/media/upload/${id}/finalize`,
      { method: 'POST', headers: this.auth(ctx) },
    );
    const deadline = Date.now() + 120_000;
    while (fin.data.processing_info && ['pending', 'in_progress'].includes(fin.data.processing_info.state)) {
      if (Date.now() > deadline) throw new ProviderError('X video processing timed out', 0, true);
      await sleep((fin.data.processing_info.check_after_secs ?? 3) * 1000);
      fin = await request(`${API}/media/upload`, {
        headers: this.auth(ctx),
        query: { command: 'STATUS', media_id: id },
      });
    }
    if (fin.data.processing_info?.state === 'failed') {
      throw new ProviderError(`X rejected the video: ${fin.data.processing_info.error?.message ?? 'processing failed'}`);
    }
    return id;
  }

  async publish(ctx: AccountContext, input: PublishInput): Promise<PublishResult> {
    const text = input.link && !input.text.includes(input.link) ? `${input.text} ${input.link}`.trim() : input.text;
    const video = input.media.find((m) => m.type === 'VIDEO');
    const items = video ? [video] : input.media.filter((m) => m.type === 'IMAGE').slice(0, 4);
    const mediaIds: string[] = [];
    for (const m of items) mediaIds.push(await this.uploadMedia(ctx, m.url, m.type));

    // Long posts go out as a thread: media on the first tweet, the rest as a reply chain.
    const parts = input.thread && input.thread.length > 1 ? [...input.thread] : [text];
    if (parts.length > 1 && input.link && !parts.some((p) => p.includes(input.link!))) parts[parts.length - 1] += ` ${input.link}`;
    const res = await request<{ data: { id: string } }>(`${API}/tweets`, {
      method: 'POST',
      headers: this.auth(ctx),
      json: { text: parts[0], ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) },
    });
    let previous = res.data.id;
    for (const part of parts.slice(1)) {
      const reply = await request<{ data: { id: string } }>(`${API}/tweets`, {
        method: 'POST',
        headers: this.auth(ctx),
        json: { text: part, reply: { in_reply_to_tweet_id: previous } },
      });
      previous = reply.data.id;
    }
    return { externalId: res.data.id, permalink: `https://x.com/${ctx.username ?? 'i'}/status/${res.data.id}` };
  }

  async deletePost(ctx: AccountContext, externalId: string) {
    await request(`${API}/tweets/${externalId}`, { method: 'DELETE', headers: this.auth(ctx) });
  }

  /** Mentions and replies to the user's tweets are treated as comments. */
  async fetchComments(ctx: AccountContext): Promise<RemoteComment[]> {
    const res = await request<{ data?: any[]; includes?: { users?: any[] } }>(`${API}/users/${ctx.externalId}/mentions`, {
      headers: this.auth(ctx),
      query: {
        max_results: 50,
        'tweet.fields': 'conversation_id,created_at,author_id,public_metrics,referenced_tweets',
        expansions: 'author_id',
        'user.fields': 'profile_image_url,username,name',
      },
    });
    const users = new Map((res.includes?.users ?? []).map((u) => [u.id, u]));
    return (res.data ?? []).map((t) => {
      const u = users.get(t.author_id) ?? {};
      const parent = t.referenced_tweets?.find((r: any) => r.type === 'replied_to')?.id ?? null;
      return {
        externalId: t.id,
        externalPostId: t.conversation_id ?? t.id,
        parentExternalId: parent,
        postPermalink: `https://x.com/${u.username ?? 'i'}/status/${t.id}`,
        postPreview: null,
        authorExternalId: t.author_id,
        authorName: u.name ?? 'X user',
        authorHandle: u.username ?? null,
        authorAvatar: u.profile_image_url ?? null,
        text: t.text,
        likeCount: t.public_metrics?.like_count ?? 0,
        isOwn: t.author_id === ctx.externalId,
        postedAt: new Date(t.created_at),
      };
    });
  }

  async replyToComment(ctx: AccountContext, comment: { externalId: string }, text: string) {
    const res = await request<{ data: { id: string } }>(`${API}/tweets`, {
      method: 'POST',
      headers: this.auth(ctx),
      json: { text, reply: { in_reply_to_tweet_id: comment.externalId } },
    });
    return { externalId: res.data.id };
  }

  async hideComment(ctx: AccountContext, externalId: string, hidden: boolean) {
    await request(`${API}/tweets/${externalId}/hidden`, { method: 'PUT', headers: this.auth(ctx), json: { hidden } });
  }

  async fetchConversations(ctx: AccountContext): Promise<RemoteConversation[]> {
    const res = await request<{ data?: any[]; includes?: { users?: any[] } }>(`${API}/dm_events`, {
      headers: this.auth(ctx),
      query: {
        max_results: 100,
        event_types: 'MessageCreate',
        'dm_event.fields': 'id,text,created_at,sender_id,dm_conversation_id,participant_ids',
        expansions: 'sender_id,participant_ids',
        'user.fields': 'profile_image_url,username,name',
      },
    });
    const users = new Map((res.includes?.users ?? []).map((u) => [u.id, u]));
    const grouped = new Map<string, any[]>();
    for (const e of res.data ?? []) {
      const list = grouped.get(e.dm_conversation_id) ?? [];
      list.push(e);
      grouped.set(e.dm_conversation_id, list);
    }

    return [...grouped.entries()].map(([convId, events]) => {
      const other = events.find((e) => e.sender_id !== ctx.externalId)?.sender_id
        ?? convId.split('-').find((id) => id !== ctx.externalId);
      const u = users.get(other) ?? {};
      const messages = events.map((e) => ({
        externalId: e.id,
        text: e.text ?? '',
        direction: e.sender_id === ctx.externalId ? ('OUTBOUND' as const) : ('INBOUND' as const),
        senderName: users.get(e.sender_id)?.name ?? null,
        sentAt: new Date(e.created_at),
      }));
      const latest = messages.reduce((a, b) => (a.sentAt > b.sentAt ? a : b));
      return {
        externalId: convId,
        participantExternalId: other ?? null,
        participantName: u.name ?? 'X user',
        participantHandle: u.username ?? null,
        participantAvatar: u.profile_image_url ?? null,
        lastMessageAt: latest.sentAt,
        snippet: latest.text,
        unreadCount: 0,
        messages,
      };
    });
  }

  async sendMessage(ctx: AccountContext, conv: { externalId: string }, text: string) {
    const res = await request<{ data: { dm_event_id: string } }>(`${API}/dm_conversations/${conv.externalId}/messages`, {
      method: 'POST',
      headers: this.auth(ctx),
      json: { text },
    });
    return { externalId: res.data.dm_event_id };
  }

  async fetchAccountMetrics(ctx: AccountContext): Promise<AccountMetrics> {
    const me = await request<{ data: any }>(`${API}/users/me`, {
      headers: this.auth(ctx),
      query: { 'user.fields': 'public_metrics' },
    });
    return { followers: me.data.public_metrics?.followers_count ?? 0 };
  }

  async fetchPostMetrics(ctx: AccountContext, externalId: string): Promise<PostMetrics> {
    const r = await request<{ data: any }>(`${API}/tweets/${externalId}`, {
      headers: this.auth(ctx),
      query: { 'tweet.fields': 'public_metrics' },
    });
    const m = r.data.public_metrics ?? {};
    return {
      likes: m.like_count ?? 0,
      comments: m.reply_count ?? 0,
      shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
      impressions: m.impression_count ?? 0,
    };
  }
}
