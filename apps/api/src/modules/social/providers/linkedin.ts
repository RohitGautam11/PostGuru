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
  RemoteComment,
  SocialProvider,
} from '../provider.types';

const REST = 'https://api.linkedin.com/rest';
const MEMBER_SCOPES = ['openid', 'profile', 'email', 'w_member_social'];
const ORG_SCOPES = ['r_organization_social', 'w_organization_social', 'rw_organization_admin'];

const scopes = () => (env().LINKEDIN_ORGANIZATIONS ? [...MEMBER_SCOPES, ...ORG_SCOPES] : MEMBER_SCOPES);

export class LinkedInProvider implements SocialProvider {
  readonly key = Provider.LINKEDIN;
  readonly displayName = 'LinkedIn';
  readonly usesPkce = false;
  readonly capabilities: ProviderCapabilities = {
    maxChars: 3000,
    maxImages: 9,
    video: true,
    requiresMedia: false,
    requiresVideo: false,
    comments: true,
    replyComments: true,
    hideComments: false,
    deleteComments: true,
    inbox: false,
    analytics: true,
  };

  isConfigured() {
    return Boolean(env().LINKEDIN_CLIENT_ID && env().LINKEDIN_CLIENT_SECRET);
  }

  private headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'LinkedIn-Version': env().LINKEDIN_API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    };
  }

  getAuthUrl({ state, redirectUri }: { state: string; redirectUri: string }) {
    const u = new URL('https://www.linkedin.com/oauth/v2/authorization');
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', env().LINKEDIN_CLIENT_ID ?? '');
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('state', state);
    u.searchParams.set('scope', scopes().join(' '));
    return u.toString();
  }

  private toTokens(t: any): OAuthTokens {
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
    };
  }

  async handleCallback({ code, redirectUri }: { code: string; redirectUri: string }): Promise<ConnectedAccount[]> {
    const tokens = this.toTokens(
      await request('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        form: {
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: env().LINKEDIN_CLIENT_ID ?? '',
          client_secret: env().LINKEDIN_CLIENT_SECRET ?? '',
        },
      }),
    );
    const me = await request<{ sub: string; name: string; picture?: string; email?: string }>(
      'https://api.linkedin.com/v2/userinfo',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    const accounts: ConnectedAccount[] = [
      {
        ...tokens,
        provider: Provider.LINKEDIN,
        externalId: `person:${me.sub}`,
        name: me.name,
        username: me.email ?? null,
        avatarUrl: me.picture ?? null,
        scopes: scopes(),
        metadata: { authorUrn: `urn:li:person:${me.sub}`, kind: 'person' },
      },
    ];

    if (env().LINKEDIN_ORGANIZATIONS) {
      const acls = await request<{ elements?: { organization: string }[] }>(`${REST}/organizationAcls`, {
        headers: this.headers(tokens.accessToken),
        query: { q: 'roleAssignee', role: 'ADMINISTRATOR', state: 'APPROVED' },
      }).catch(() => ({ elements: [] as { organization: string }[] }));
      for (const acl of acls.elements ?? []) {
        const orgId = acl.organization.split(':').pop()!;
        const org = await request<any>(`${REST}/organizations/${orgId}`, { headers: this.headers(tokens.accessToken) }).catch(
          () => null,
        );
        accounts.push({
          ...tokens,
          provider: Provider.LINKEDIN,
          externalId: `organization:${orgId}`,
          name: org?.localizedName ?? `Organization ${orgId}`,
          username: org?.vanityName ?? null,
          avatarUrl: null,
          scopes: scopes(),
          metadata: { authorUrn: acl.organization, kind: 'organization' },
        });
      }
    }
    return accounts;
  }

  async refreshTokens(refreshToken: string) {
    return this.toTokens(
      await request('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        form: {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: env().LINKEDIN_CLIENT_ID ?? '',
          client_secret: env().LINKEDIN_CLIENT_SECRET ?? '',
        },
      }),
    );
  }

  private async uploadImage(ctx: AccountContext, url: string): Promise<string> {
    const init = await request<{ value: { uploadUrl: string; image: string } }>(`${REST}/images`, {
      method: 'POST',
      query: { action: 'initializeUpload' },
      headers: this.headers(ctx.accessToken),
      json: { initializeUploadRequest: { owner: ctx.metadata.authorUrn } },
    });
    const { buffer, mimeType } = await downloadMedia(url);
    await requestRaw(init.value.uploadUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${ctx.accessToken}`, 'Content-Type': mimeType },
      body: new Uint8Array(buffer),
      timeoutMs: 120_000,
    });
    return init.value.image;
  }

  private async uploadVideo(ctx: AccountContext, url: string): Promise<string> {
    const { buffer } = await downloadMedia(url);
    const init = await request<{
      value: { video: string; uploadToken: string; uploadInstructions: { uploadUrl: string; firstByte: number; lastByte: number }[] };
    }>(`${REST}/videos`, {
      method: 'POST',
      query: { action: 'initializeUpload' },
      headers: this.headers(ctx.accessToken),
      json: {
        initializeUploadRequest: {
          owner: ctx.metadata.authorUrn,
          fileSizeBytes: buffer.length,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      },
    });
    const etags: string[] = [];
    for (const part of init.value.uploadInstructions) {
      const res = await requestRaw(part.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: new Uint8Array(buffer.subarray(part.firstByte, part.lastByte + 1)),
        timeoutMs: 120_000,
      });
      etags.push(res.headers.get('etag') ?? '');
    }
    await request(`${REST}/videos`, {
      method: 'POST',
      query: { action: 'finalizeUpload' },
      headers: this.headers(ctx.accessToken),
      json: {
        finalizeUploadRequest: { video: init.value.video, uploadToken: init.value.uploadToken || '', uploadedPartIds: etags },
      },
    });
    // Wait until LinkedIn marks the video AVAILABLE before attaching it to a post.
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const v = await request<{ status: string }>(`${REST}/videos/${encodeURIComponent(init.value.video)}`, {
        headers: this.headers(ctx.accessToken),
      });
      if (v.status === 'AVAILABLE') return init.value.video;
      if (v.status === 'PROCESSING_FAILED') throw new ProviderError('LinkedIn failed to process the video');
      await sleep(3000);
    }
    throw new ProviderError('LinkedIn video processing timed out', 0, true);
  }

  async publish(ctx: AccountContext, input: PublishInput): Promise<PublishResult> {
    const video = input.media.find((m) => m.type === 'VIDEO');
    const images = input.media.filter((m) => m.type === 'IMAGE').slice(0, this.capabilities.maxImages);
    let content: Record<string, unknown> | undefined;

    if (video) {
      content = { media: { id: await this.uploadVideo(ctx, video.url), title: input.title ?? undefined } };
    } else if (images.length === 1) {
      content = { media: { id: await this.uploadImage(ctx, images[0].url) } };
    } else if (images.length > 1) {
      const ids: string[] = [];
      for (const img of images) ids.push(await this.uploadImage(ctx, img.url));
      content = { multiImage: { images: ids.map((id) => ({ id })) } };
    } else if (input.link) {
      content = { article: { source: input.link, title: input.title || input.link } };
    }

    const res = await requestRaw(`${REST}/posts`, {
      method: 'POST',
      headers: { ...this.headers(ctx.accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author: ctx.metadata.authorUrn,
        commentary: escapeLittleText(input.text),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
        ...(content ? { content } : {}),
      }),
    });
    const urn = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id');
    if (!urn) throw new ProviderError('LinkedIn did not return a post id');
    return { externalId: urn, permalink: `https://www.linkedin.com/feed/update/${urn}` };
  }

  async deletePost(ctx: AccountContext, externalId: string) {
    await request(`${REST}/posts/${encodeURIComponent(externalId)}`, { method: 'DELETE', headers: this.headers(ctx.accessToken) });
  }

  /** Comments on posts published through SocialHub (LinkedIn has no "list my posts" for members). */
  async fetchComments(ctx: AccountContext, knownPostIds: string[]): Promise<RemoteComment[]> {
    const out: RemoteComment[] = [];
    for (const urn of knownPostIds.slice(0, 20)) {
      const res = await request<{ elements?: any[] }>(`${REST}/socialActions/${encodeURIComponent(urn)}/comments`, {
        headers: this.headers(ctx.accessToken),
      }).catch(() => ({ elements: [] as any[] }));
      for (const c of res.elements ?? []) {
        const commentId = c.commentUrn ?? c['$URN'] ?? c.id;
        out.push({
          externalId: commentId,
          externalPostId: urn,
          parentExternalId: c.parentComment ?? null,
          postPermalink: `https://www.linkedin.com/feed/update/${urn}`,
          authorExternalId: c.actor ?? null,
          authorName: c.actor?.startsWith('urn:li:organization') ? 'Organization' : 'LinkedIn member',
          text: c.message?.text ?? '',
          likeCount: c.likesSummary?.totalLikes ?? 0,
          isOwn: c.actor === ctx.metadata.authorUrn,
          postedAt: new Date(c.created?.time ?? Date.now()),
        });
      }
    }
    return out;
  }

  async replyToComment(ctx: AccountContext, comment: { externalId: string; externalPostId: string }, text: string) {
    const res = await requestRaw(`${REST}/socialActions/${encodeURIComponent(comment.externalPostId)}/comments`, {
      method: 'POST',
      headers: { ...this.headers(ctx.accessToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: ctx.metadata.authorUrn,
        object: comment.externalPostId,
        parentComment: comment.externalId,
        message: { text },
      }),
    });
    return { externalId: res.headers.get('x-restli-id') ?? `${comment.externalId}:reply:${Date.now()}` };
  }

  async deleteComment(ctx: AccountContext, externalId: string) {
    // Comment URN format: urn:li:comment:(<postUrn>,<commentId>)
    const match = /^urn:li:comment:\((.+),(\d+)\)$/.exec(externalId);
    if (!match) throw new ProviderError('Unsupported LinkedIn comment id');
    await request(`${REST}/socialActions/${encodeURIComponent(match[1])}/comments/${match[2]}`, {
      method: 'DELETE',
      headers: this.headers(ctx.accessToken),
      query: { actor: ctx.metadata.authorUrn },
    });
  }

  async fetchAccountMetrics(ctx: AccountContext): Promise<AccountMetrics> {
    if (ctx.metadata.kind !== 'organization') return {};
    const res = await request<{ firstDegreeSize?: number }>(
      `${REST}/networkSizes/${encodeURIComponent(ctx.metadata.authorUrn)}`,
      { headers: this.headers(ctx.accessToken), query: { edgeType: 'COMPANY_FOLLOWED_BY_MEMBER' } },
    ).catch(() => null);
    return res?.firstDegreeSize !== undefined ? { followers: res.firstDegreeSize } : {};
  }

  async fetchPostMetrics(ctx: AccountContext, externalId: string): Promise<PostMetrics> {
    const r = await request<any>(`${REST}/socialActions/${encodeURIComponent(externalId)}`, {
      headers: this.headers(ctx.accessToken),
    });
    return { likes: r.likesSummary?.totalLikes ?? 0, comments: r.commentsSummary?.aggregatedTotalComments ?? 0 };
  }
}

/** LinkedIn "little text" format reserves these characters; escape them so posts aren't truncated. */
function escapeLittleText(text: string) {
  return text
    .replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`)
    .replace(/\\#([\p{L}\p{N}_]+)/gu, (_m, tag) => `{hashtag|\\#|${tag}}`);
}
