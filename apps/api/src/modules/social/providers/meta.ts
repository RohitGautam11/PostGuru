import { Provider } from '@prisma/client';
import { env } from '../../../config/env';
import { ProviderError, request, sleep } from '../../../common/http';
import {
  AccountContext,
  AccountMetrics,
  ConnectedAccount,
  PostMetrics,
  ProviderCapabilities,
  PublishInput,
  PublishResult,
  RemoteComment,
  RemoteConversation,
  SocialProvider,
} from '../provider.types';

const graph = () => `https://graph.facebook.com/${env().META_GRAPH_VERSION}`;
const graphVideo = () => `https://graph-video.facebook.com/${env().META_GRAPH_VERSION}`;

const FACEBOOK_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'pages_read_user_content',
  'pages_manage_engagement',
  'pages_messaging',
  'read_insights',
  'business_management',
];

const INSTAGRAM_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'business_management',
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_comments',
  'instagram_manage_messages',
  'instagram_manage_insights',
];

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  followers_count?: number;
  fan_count?: number;
  picture?: { data?: { url?: string } };
  /** App-scoped id of the Facebook user who connected the Page (used for data-deletion callbacks). */
  ownerId?: string;
  instagram_business_account?: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
    followers_count?: number;
  };
}

/** Shared OAuth for Facebook Login: exchanges the code for a long-lived user token and lists Pages. */
async function exchangeAndListPages(code: string, redirectUri: string): Promise<MetaPage[]> {
  const { META_APP_ID, META_APP_SECRET } = env();
  const short = await request<{ access_token: string }>(`${graph()}/oauth/access_token`, {
    query: { client_id: META_APP_ID, client_secret: META_APP_SECRET, redirect_uri: redirectUri, code },
  });
  const long = await request<{ access_token: string }>(`${graph()}/oauth/access_token`, {
    query: {
      grant_type: 'fb_exchange_token',
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: short.access_token,
    },
  });
  // Page tokens derived from a long-lived user token do not expire.
  const pages = await request<{ data: MetaPage[] }>(`${graph()}/me/accounts`, {
    query: {
      access_token: long.access_token,
      limit: 100,
      fields:
        'id,name,access_token,followers_count,fan_count,picture.type(large){url},' +
        'instagram_business_account{id,username,name,profile_picture_url,followers_count}',
    },
  });
  const owner = await request<{ id: string }>(`${graph()}/me`, { query: { access_token: long.access_token, fields: 'id' } }).catch(() => null);
  const list = (pages.data ?? []).map((p) => ({ ...p, ownerId: owner?.id }));
  // Subscribe each Page to our app's webhooks so comments/messages arrive in real time (best effort).
  await Promise.all(
    list.map((p) =>
      request(`${graph()}/${p.id}/subscribed_apps`, {
        method: 'POST',
        form: { access_token: p.access_token, subscribed_fields: 'feed,messages' },
      }).catch(() => undefined),
    ),
  );
  return list;
}

function metaAuthUrl(scopes: string[], state: string, redirectUri: string) {
  const u = new URL(`https://www.facebook.com/${env().META_GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set('client_id', env().META_APP_ID ?? '');
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', scopes.join(','));
  return u.toString();
}

const metaConfigured = () => Boolean(env().META_APP_ID && env().META_APP_SECRET);

// ── Instagram API with Instagram Login (creators & influencers, no Facebook Page required) ──
const IG_LOGIN_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
];
const igGraph = () => `https://graph.instagram.com/${env().META_GRAPH_VERSION}`;
const igAppId = () => env().INSTAGRAM_APP_ID ?? env().META_APP_ID;
const igAppSecret = () => env().INSTAGRAM_APP_SECRET ?? env().META_APP_SECRET;
const igLoginConfigured = () => Boolean(igAppId() && igAppSecret());
/** Accounts connected with Instagram Login live on graph.instagram.com; the rest on graph.facebook.com. */
const igBase = (ctx?: { metadata?: Record<string, any> }) => (ctx?.metadata?.loginType === 'instagram' ? igGraph() : graph());

export const CREATOR_SWITCH_HELP =
  'Personal Instagram profiles cannot be scheduled by any app. Switch to a free Creator account in 30 seconds: ' +
  'Instagram → Settings → Account type and tools → Switch to professional account → Creator. Then connect again.';

function withLink(text: string, link?: string | null) {
  return link && !text.includes(link) ? `${text}\n\n${link}`.trim() : text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Facebook Pages
// ─────────────────────────────────────────────────────────────────────────────
export class FacebookProvider implements SocialProvider {
  readonly key = Provider.FACEBOOK;
  readonly displayName = 'Facebook';
  readonly usesPkce = false;
  readonly capabilities: ProviderCapabilities = {
    maxChars: 63206,
    maxImages: 10,
    video: true,
    requiresMedia: false,
    requiresVideo: false,
    comments: true,
    replyComments: true,
    hideComments: true,
    deleteComments: true,
    inbox: true,
    analytics: true,
  };

  isConfigured = metaConfigured;

  getAuthUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    return metaAuthUrl(FACEBOOK_SCOPES, state, redirectUri);
  }

  async handleCallback({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const pages = await exchangeAndListPages(code, redirectUri);
    if (!pages.length) throw new ProviderError('No Facebook Pages were shared. Select at least one Page during login.');
    return pages.map((p) => ({
      provider: Provider.FACEBOOK,
      externalId: p.id,
      name: p.name,
      username: null,
      avatarUrl: p.picture?.data?.url ?? null,
      accessToken: p.access_token,
      refreshToken: null,
      expiresAt: null,
      scopes: FACEBOOK_SCOPES,
      followers: p.followers_count ?? p.fan_count ?? null,
      metadata: { fbUserId: p.ownerId ?? null },
    }));
  }

  async publish(ctx: AccountContext, input: PublishInput): Promise<PublishResult> {
    const token = ctx.accessToken;
    const page = ctx.externalId;
    const video = input.media.find((m) => m.type === 'VIDEO');
    const images = input.media.filter((m) => m.type === 'IMAGE');
    let postId: string;

    if (video) {
      const res = await request<{ id: string }>(`${graphVideo()}/${page}/videos`, {
        method: 'POST',
        form: { access_token: token, file_url: video.url, description: withLink(input.text, input.link) },
        timeoutMs: 120_000,
      });
      return { externalId: res.id, permalink: `https://www.facebook.com/${page}/videos/${res.id}` };
    } else if (images.length === 1) {
      const res = await request<{ id: string; post_id?: string }>(`${graph()}/${page}/photos`, {
        method: 'POST',
        form: { access_token: token, url: images[0].url, message: withLink(input.text, input.link) },
      });
      postId = res.post_id ?? res.id;
    } else if (images.length > 1) {
      const ids: string[] = [];
      for (const img of images.slice(0, this.capabilities.maxImages)) {
        const res = await request<{ id: string }>(`${graph()}/${page}/photos`, {
          method: 'POST',
          form: { access_token: token, url: img.url, published: 'false' },
        });
        ids.push(res.id);
      }
      const res = await request<{ id: string }>(`${graph()}/${page}/feed`, {
        method: 'POST',
        form: {
          access_token: token,
          message: withLink(input.text, input.link),
          attached_media: JSON.stringify(ids.map((id) => ({ media_fbid: id }))),
        },
      });
      postId = res.id;
    } else {
      const form: Record<string, string> = { access_token: token, message: input.text };
      if (input.link) form.link = input.link;
      const res = await request<{ id: string }>(`${graph()}/${page}/feed`, { method: 'POST', form });
      postId = res.id;
    }

    if (input.firstComment) {
      await request(`${graph()}/${postId}/comments`, {
        method: 'POST',
        form: { access_token: token, message: input.firstComment },
      }).catch(() => undefined); // best effort: the post itself is live
    }
    const permalink = await request<{ permalink_url?: string }>(`${graph()}/${postId}`, {
      query: { access_token: token, fields: 'permalink_url' },
    })
      .then((r) => r.permalink_url ?? null)
      .catch(() => `https://www.facebook.com/${postId}`);
    return { externalId: postId, permalink };
  }

  async deletePost(ctx: AccountContext, externalId: string) {
    await request(`${graph()}/${externalId}`, { method: 'DELETE', query: { access_token: ctx.accessToken } });
  }

  async fetchComments(ctx: AccountContext): Promise<RemoteComment[]> {
    const posts = await request<{ data: { id: string; message?: string; permalink_url?: string }[] }>(
      `${graph()}/${ctx.externalId}/published_posts`,
      { query: { access_token: ctx.accessToken, fields: 'id,message,permalink_url', limit: 15 } },
    );
    const out: RemoteComment[] = [];
    for (const post of posts.data ?? []) {
      const comments = await request<{ data: any[] }>(`${graph()}/${post.id}/comments`, {
        query: {
          access_token: ctx.accessToken,
          fields: 'id,message,from{id,name},created_time,like_count,parent{id},is_hidden',
          filter: 'stream',
          order: 'reverse_chronological',
          limit: 50,
        },
      }).catch(() => ({ data: [] }));
      for (const c of comments.data ?? []) {
        out.push({
          externalId: c.id,
          externalPostId: post.id,
          parentExternalId: c.parent?.id ?? null,
          postPermalink: post.permalink_url ?? null,
          postPreview: post.message?.slice(0, 140) ?? null,
          authorExternalId: c.from?.id ?? null,
          authorName: c.from?.name ?? 'Facebook user',
          text: c.message ?? '',
          likeCount: c.like_count ?? 0,
          hidden: Boolean(c.is_hidden),
          isOwn: c.from?.id === ctx.externalId,
          postedAt: new Date(c.created_time),
        });
      }
    }
    return out;
  }

  async replyToComment(ctx: AccountContext, comment: { externalId: string }, text: string) {
    const res = await request<{ id: string }>(`${graph()}/${comment.externalId}/comments`, {
      method: 'POST',
      form: { access_token: ctx.accessToken, message: text },
    });
    return { externalId: res.id };
  }

  async hideComment(ctx: AccountContext, externalId: string, hidden: boolean) {
    await request(`${graph()}/${externalId}`, {
      method: 'POST',
      form: { access_token: ctx.accessToken, is_hidden: String(hidden) },
    });
  }

  async deleteComment(ctx: AccountContext, externalId: string) {
    await request(`${graph()}/${externalId}`, { method: 'DELETE', query: { access_token: ctx.accessToken } });
  }

  fetchConversations(ctx: AccountContext) {
    return fetchMetaConversations(ctx, 'messenger', ctx.externalId, ctx.externalId);
  }

  sendMessage(ctx: AccountContext, conv: { participantExternalId?: string | null }, text: string) {
    return sendMetaMessage(ctx.externalId, ctx.accessToken, conv.participantExternalId, text);
  }

  async fetchAccountMetrics(ctx: AccountContext): Promise<AccountMetrics> {
    const info = await request<{ followers_count?: number; fan_count?: number }>(`${graph()}/${ctx.externalId}`, {
      query: { access_token: ctx.accessToken, fields: 'followers_count,fan_count' },
    });
    const metrics: AccountMetrics = { followers: info.followers_count ?? info.fan_count ?? 0 };
    const insights = await request<{ data: { name: string; values: { value: number }[] }[] }>(
      `${graph()}/${ctx.externalId}/insights`,
      { query: { access_token: ctx.accessToken, metric: 'page_impressions_unique,page_post_engagements', period: 'day' } },
    ).catch(() => null);
    for (const m of insights?.data ?? []) {
      const latest = m.values?.[m.values.length - 1]?.value ?? 0;
      if (m.name === 'page_impressions_unique') {
        metrics.reach = latest;
        metrics.impressions = latest;
      }
      if (m.name === 'page_post_engagements') metrics.engagement = latest;
    }
    return metrics;
  }

  async fetchPostMetrics(ctx: AccountContext, externalId: string): Promise<PostMetrics> {
    const r = await request<any>(`${graph()}/${externalId}`, {
      query: {
        access_token: ctx.accessToken,
        fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares',
      },
    });
    return {
      likes: r.reactions?.summary?.total_count ?? 0,
      comments: r.comments?.summary?.total_count ?? 0,
      shares: r.shares?.count ?? 0,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Instagram (Business / Creator accounts linked to a Facebook Page)
// ─────────────────────────────────────────────────────────────────────────────
export class InstagramProvider implements SocialProvider {
  readonly key = Provider.INSTAGRAM;
  readonly displayName = 'Instagram';
  readonly usesPkce = false;
  readonly capabilities: ProviderCapabilities = {
    maxChars: 2200,
    maxImages: 10,
    video: true,
    requiresMedia: true,
    requiresVideo: false,
    comments: true,
    replyComments: true,
    hideComments: true,
    deleteComments: true,
    inbox: true,
    analytics: true,
  };

  isConfigured = () => metaConfigured() || igLoginConfigured();

  /** "creator" = Instagram Login (no Facebook Page); "business" = Facebook Login for Business (linked Page). */
  modes() {
    return [
      { key: 'creator', configured: igLoginConfigured() },
      { key: 'business', configured: metaConfigured() },
    ];
  }

  getAuthUrl({ state, redirectUri, mode }: { state: string; redirectUri: string; mode?: string | null }) {
    if (mode === 'creator' || !metaConfigured()) {
      const u = new URL('https://www.instagram.com/oauth/authorize');
      u.searchParams.set('client_id', igAppId() ?? '');
      u.searchParams.set('redirect_uri', redirectUri);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', IG_LOGIN_SCOPES.join(','));
      u.searchParams.set('state', state);
      return u.toString();
    }
    return metaAuthUrl(INSTAGRAM_SCOPES, state, redirectUri);
  }

  /** Instagram Login: code → short-lived token → 60-day token → professional account profile. */
  private async creatorCallback(code: string, redirectUri: string): Promise<ConnectedAccount[]> {
    const raw = await request<any>('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      form: {
        client_id: igAppId() ?? '',
        client_secret: igAppSecret() ?? '',
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      },
    });
    const short = Array.isArray(raw?.data) ? raw.data[0] : raw;
    const long = await request<{ access_token: string; expires_in?: number }>('https://graph.instagram.com/access_token', {
      query: { grant_type: 'ig_exchange_token', client_secret: igAppSecret(), access_token: short.access_token },
    });
    const me = await request<{
      id: string;
      user_id?: string;
      username?: string;
      name?: string;
      account_type?: string;
      profile_picture_url?: string;
      followers_count?: number;
    }>(`${igGraph()}/me`, {
      query: { access_token: long.access_token, fields: 'id,user_id,username,name,account_type,profile_picture_url,followers_count' },
    });
    if (me.account_type && !['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(me.account_type.toUpperCase())) {
      throw new ProviderError(CREATOR_SWITCH_HELP);
    }
    return [
      {
        provider: Provider.INSTAGRAM,
        externalId: String(me.user_id ?? me.id),
        name: me.name || me.username || 'Instagram',
        username: me.username ?? null,
        avatarUrl: me.profile_picture_url ?? null,
        accessToken: long.access_token,
        // Instagram refreshes the long-lived token itself (no separate refresh token).
        refreshToken: long.access_token,
        expiresAt: new Date(Date.now() + (long.expires_in ?? 60 * 86400) * 1000),
        scopes: IG_LOGIN_SCOPES,
        followers: me.followers_count ?? null,
        metadata: { loginType: 'instagram', accountType: me.account_type ?? null },
      },
    ];
  }

  /** Long-lived Instagram Login tokens last 60 days and can be refreshed once they are 24h old. */
  async refreshTokens(refreshToken: string) {
    const r = await request<{ access_token: string; expires_in: number }>('https://graph.instagram.com/refresh_access_token', {
      query: { grant_type: 'ig_refresh_token', access_token: refreshToken },
    });
    return { accessToken: r.access_token, refreshToken: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
  }

  async handleCallback({ code, redirectUri, mode }: { code: string; redirectUri: string; mode?: string | null }): Promise<ConnectedAccount[]> {
    if (mode === 'creator' || !metaConfigured()) return this.creatorCallback(code, redirectUri);
    const pages = await exchangeAndListPages(code, redirectUri);
    const linked = pages.filter((p) => p.instagram_business_account);
    if (!linked.length) {
      throw new ProviderError(
        'No Instagram Business account is linked to the Facebook Pages you shared. Creators can use "Connect Creator Profile" instead (no Facebook Page needed). ' +
          CREATOR_SWITCH_HELP,
      );
    }
    return linked.map((p) => {
      const ig = p.instagram_business_account!;
      return {
        provider: Provider.INSTAGRAM,
        externalId: ig.id,
        name: ig.name || ig.username || p.name,
        username: ig.username ?? null,
        avatarUrl: ig.profile_picture_url ?? null,
        accessToken: p.access_token,
        refreshToken: null,
        expiresAt: null,
        scopes: INSTAGRAM_SCOPES,
        followers: ig.followers_count ?? null,
        metadata: { pageId: p.id, pageName: p.name, loginType: 'facebook', fbUserId: p.ownerId ?? null },
      };
    });
  }

  private async waitForContainer(id: string, token: string, ctx?: AccountContext) {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const s = await request<{ status_code: string; status?: string }>(`${igBase(ctx)}/${id}`, {
        query: { access_token: token, fields: 'status_code,status' },
      });
      if (s.status_code === 'FINISHED') return;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') {
        throw new ProviderError(`Instagram could not process the media: ${s.status ?? s.status_code}`);
      }
      await sleep(3000);
    }
    throw new ProviderError('Instagram media processing timed out', 0, true);
  }

  async publish(ctx: AccountContext, input: PublishInput): Promise<PublishResult> {
    if (!input.media.length) throw new ProviderError('Instagram posts require at least one image or video');
    const token = ctx.accessToken;
    const ig = ctx.externalId;
    const caption = withLink(input.text, input.link);
    let containerId: string;

    if (input.media.length === 1) {
      const m = input.media[0];
      const form: Record<string, string> =
        m.type === 'VIDEO'
          ? { access_token: token, caption, media_type: 'REELS', video_url: m.url }
          : { access_token: token, caption, image_url: m.url };
      containerId = (await request<{ id: string }>(`${igBase(ctx)}/${ig}/media`, { method: 'POST', form })).id;
    } else {
      const children: string[] = [];
      for (const m of input.media.slice(0, this.capabilities.maxImages)) {
        const form: Record<string, string> =
          m.type === 'VIDEO'
            ? { access_token: token, media_type: 'VIDEO', video_url: m.url, is_carousel_item: 'true' }
            : { access_token: token, image_url: m.url, is_carousel_item: 'true' };
        const child = await request<{ id: string }>(`${igBase(ctx)}/${ig}/media`, { method: 'POST', form });
        if (m.type === 'VIDEO') await this.waitForContainer(child.id, token, ctx);
        children.push(child.id);
      }
      containerId = (
        await request<{ id: string }>(`${igBase(ctx)}/${ig}/media`, {
          method: 'POST',
          form: { access_token: token, caption, media_type: 'CAROUSEL', children: children.join(',') },
        })
      ).id;
    }

    await this.waitForContainer(containerId, token, ctx);
    const published = await request<{ id: string }>(`${igBase(ctx)}/${ig}/media_publish`, {
      method: 'POST',
      form: { access_token: token, creation_id: containerId },
    });
    if (input.firstComment) {
      await request(`${igBase(ctx)}/${published.id}/comments`, {
        method: 'POST',
        form: { access_token: token, message: input.firstComment },
      }).catch(() => undefined); // best effort: the post itself is live
    }
    const permalink = await request<{ permalink?: string }>(`${igBase(ctx)}/${published.id}`, {
      query: { access_token: token, fields: 'permalink' },
    })
      .then((r) => r.permalink ?? null)
      .catch(() => null);
    return { externalId: published.id, permalink };
  }

  async fetchComments(ctx: AccountContext): Promise<RemoteComment[]> {
    const media = await request<{ data: any[] }>(`${igBase(ctx)}/${ctx.externalId}/media`, {
      query: { access_token: ctx.accessToken, fields: 'id,caption,permalink,comments_count', limit: 15 },
    });
    const out: RemoteComment[] = [];
    const push = (c: any, mediaItem: any, parent: string | null) =>
      out.push({
        externalId: c.id,
        externalPostId: mediaItem.id,
        parentExternalId: parent,
        postPermalink: mediaItem.permalink ?? null,
        postPreview: mediaItem.caption?.slice(0, 140) ?? null,
        authorExternalId: c.from?.id ?? null,
        authorName: c.username ?? c.from?.username ?? 'instagram user',
        authorHandle: c.username ?? c.from?.username ?? null,
        text: c.text ?? '',
        likeCount: c.like_count ?? 0,
        hidden: Boolean(c.hidden),
        isOwn: Boolean(ctx.username && (c.username ?? c.from?.username) === ctx.username),
        postedAt: new Date(c.timestamp),
      });

    for (const m of media.data ?? []) {
      if (!m.comments_count) continue;
      const comments = await request<{ data: any[] }>(`${igBase(ctx)}/${m.id}/comments`, {
        query: {
          access_token: ctx.accessToken,
          fields:
            'id,text,username,timestamp,like_count,hidden,from{id,username},' +
            'replies{id,text,username,timestamp,like_count,hidden,from{id,username}}',
          limit: 50,
        },
      }).catch(() => ({ data: [] }));
      for (const c of comments.data ?? []) {
        push(c, m, null);
        for (const r of c.replies?.data ?? []) push(r, m, c.id);
      }
    }
    return out;
  }

  async replyToComment(ctx: AccountContext, comment: { externalId: string }, text: string) {
    const res = await request<{ id: string }>(`${igBase(ctx)}/${comment.externalId}/replies`, {
      method: 'POST',
      form: { access_token: ctx.accessToken, message: text },
    });
    return { externalId: res.id };
  }

  async hideComment(ctx: AccountContext, externalId: string, hidden: boolean) {
    await request(`${igBase(ctx)}/${externalId}`, {
      method: 'POST',
      form: { access_token: ctx.accessToken, hide: String(hidden) },
    });
  }

  async deleteComment(ctx: AccountContext, externalId: string) {
    await request(`${igBase(ctx)}/${externalId}`, { method: 'DELETE', query: { access_token: ctx.accessToken } });
  }

  async fetchConversations(ctx: AccountContext) {
    // Creator (Instagram Login) accounts have no Page; DMs are read from the IG account itself.
    if (ctx.metadata.loginType === 'instagram') {
      return fetchMetaConversations(ctx, 'instagram', ctx.externalId, ctx.externalId, igGraph()).catch(() => []);
    }
    return fetchMetaConversations(ctx, 'instagram', ctx.metadata.pageId, ctx.externalId);
  }

  sendMessage(ctx: AccountContext, conv: { participantExternalId?: string | null }, text: string) {
    if (ctx.metadata.loginType === 'instagram') {
      return sendMetaMessage(ctx.externalId, ctx.accessToken, conv.participantExternalId, text, igGraph());
    }
    return sendMetaMessage(ctx.metadata.pageId, ctx.accessToken, conv.participantExternalId, text);
  }

  async fetchAccountMetrics(ctx: AccountContext): Promise<AccountMetrics> {
    const info = await request<{ followers_count?: number }>(`${igBase(ctx)}/${ctx.externalId}`, {
      query: { access_token: ctx.accessToken, fields: 'followers_count,media_count' },
    });
    const metrics: AccountMetrics = { followers: info.followers_count ?? 0 };
    const insights = await request<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
      `${igBase(ctx)}/${ctx.externalId}/insights`,
      { query: { access_token: ctx.accessToken, metric: 'reach', period: 'day' } },
    ).catch(() => null);
    const reach = insights?.data?.find((d) => d.name === 'reach');
    if (reach) {
      metrics.reach = reach.total_value?.value ?? reach.values?.[reach.values.length - 1]?.value ?? 0;
      metrics.impressions = metrics.reach;
    }
    return metrics;
  }

  async fetchPostMetrics(ctx: AccountContext, externalId: string): Promise<PostMetrics> {
    const r = await request<{ like_count?: number; comments_count?: number }>(`${igBase(ctx)}/${externalId}`, {
      query: { access_token: ctx.accessToken, fields: 'like_count,comments_count' },
    });
    return { likes: r.like_count ?? 0, comments: r.comments_count ?? 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared Messenger / Instagram Direct helpers (both go through the Page)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchMetaConversations(
  ctx: AccountContext,
  platform: 'messenger' | 'instagram',
  pageId: string,
  selfId: string,
  base = graph(),
): Promise<RemoteConversation[]> {
  if (!pageId) return [];
  const res = await request<{ data: any[] }>(`${base}/${pageId}/conversations`, {
    query: {
      access_token: ctx.accessToken,
      platform,
      limit: 25,
      fields:
        'id,updated_time,snippet,unread_count,participants,' +
        'messages.limit(25){id,message,from,to,created_time,attachments{image_data{url},file_url,mime_type}}',
    },
  });

  return (res.data ?? []).map((c) => {
    const participants: any[] = c.participants?.data ?? [];
    const other = participants.find((p) => p.id !== selfId && p.id !== pageId) ?? participants[0] ?? {};
    const messages = (c.messages?.data ?? []).map((m: any) => ({
      externalId: m.id,
      text: m.message ?? '',
      direction: m.from?.id === selfId || m.from?.id === pageId ? ('OUTBOUND' as const) : ('INBOUND' as const),
      senderName: m.from?.name ?? m.from?.username ?? null,
      sentAt: new Date(m.created_time),
      attachments: (m.attachments?.data ?? [])
        .map((a: any) => ({ type: a.mime_type ?? 'file', url: a.image_data?.url ?? a.file_url }))
        .filter((a: any) => a.url),
    }));
    return {
      externalId: c.id,
      participantExternalId: other.id ?? null,
      participantName: other.name ?? other.username ?? 'Unknown',
      participantHandle: other.username ?? null,
      participantAvatar: null,
      lastMessageAt: new Date(c.updated_time ?? Date.now()),
      snippet: c.snippet ?? messages[0]?.text ?? null,
      unreadCount: c.unread_count ?? 0,
      messages,
    };
  });
}

async function sendMetaMessage(pageId: string, token: string, recipientId: string | null | undefined, text: string, base = graph()) {
  if (!recipientId) throw new ProviderError('Recipient is unknown for this conversation');
  const res = await request<{ message_id: string }>(`${base}/${pageId}/messages`, {
    method: 'POST',
    query: { access_token: token },
    json: { recipient: { id: recipientId }, messaging_type: 'RESPONSE', message: { text } },
  });
  return { externalId: res.message_id };
}
