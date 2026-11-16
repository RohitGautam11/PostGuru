import { Provider } from '@prisma/client';

export interface ProviderCapabilities {
  /** Max characters for a post body. */
  maxChars: number;
  maxImages: number;
  video: boolean;
  /** Platform refuses text-only posts (Instagram, YouTube). */
  requiresMedia: boolean;
  /** Platform only accepts video (YouTube). */
  requiresVideo: boolean;
  comments: boolean;
  replyComments: boolean;
  hideComments: boolean;
  deleteComments: boolean;
  inbox: boolean;
  analytics: boolean;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}

/** One connectable identity (a Facebook Page, an IG business account, an X user, ...). */
export interface ConnectedAccount extends OAuthTokens {
  provider: Provider;
  externalId: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  scopes: string[];
  metadata?: Record<string, unknown>;
  followers?: number | null;
}

/** Decrypted account data handed to provider calls. */
export interface AccountContext {
  id: string;
  externalId: string;
  accessToken: string;
  username?: string | null;
  metadata: Record<string, any>;
}

export interface PublishMedia {
  url: string;
  type: 'IMAGE' | 'VIDEO';
  mimeType: string;
  size?: number;
}

export interface PublishInput {
  text: string;
  media: PublishMedia[];
  link?: string | null;
  /** Used by YouTube (video title). */
  title?: string | null;
}

export interface PublishResult {
  externalId: string;
  permalink?: string | null;
}

export interface RemoteComment {
  externalId: string;
  externalPostId: string;
  parentExternalId?: string | null;
  postPermalink?: string | null;
  postPreview?: string | null;
  authorExternalId?: string | null;
  authorName: string;
  authorHandle?: string | null;
  authorAvatar?: string | null;
  text: string;
  likeCount?: number;
  hidden?: boolean;
  isOwn?: boolean;
  postedAt: Date;
}

export interface RemoteMessage {
  externalId: string;
  text: string;
  direction: 'INBOUND' | 'OUTBOUND';
  senderName?: string | null;
  sentAt: Date;
  attachments?: { type: string; url: string }[];
}

export interface RemoteConversation {
  externalId: string;
  participantExternalId?: string | null;
  participantName: string;
  participantHandle?: string | null;
  participantAvatar?: string | null;
  lastMessageAt: Date;
  snippet?: string | null;
  unreadCount?: number;
  messages: RemoteMessage[];
}

export interface AccountMetrics {
  followers?: number;
  impressions?: number;
  reach?: number;
  engagement?: number;
}

export interface PostMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  impressions?: number;
}

export interface SocialProvider {
  readonly key: Provider;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  /** True when the app credentials for this provider are present in the environment. */
  isConfigured(): boolean;
  readonly usesPkce: boolean;

  getAuthUrl(params: { state: string; redirectUri: string; codeChallenge?: string }): string;
  handleCallback(params: { code: string; redirectUri: string; codeVerifier?: string | null }): Promise<ConnectedAccount[]>;
  refreshTokens?(refreshToken: string): Promise<OAuthTokens>;

  publish(ctx: AccountContext, input: PublishInput): Promise<PublishResult>;
  deletePost?(ctx: AccountContext, externalId: string): Promise<void>;

  /** `knownPostIds` = posts published via SocialHub, for platforms that cannot list an account's posts. */
  fetchComments?(ctx: AccountContext, knownPostIds: string[]): Promise<RemoteComment[]>;
  replyToComment?(ctx: AccountContext, comment: { externalId: string; externalPostId: string }, text: string): Promise<{ externalId: string }>;
  hideComment?(ctx: AccountContext, externalId: string, hidden: boolean): Promise<void>;
  deleteComment?(ctx: AccountContext, externalId: string): Promise<void>;

  fetchConversations?(ctx: AccountContext): Promise<RemoteConversation[]>;
  sendMessage?(
    ctx: AccountContext,
    conversation: { externalId: string; participantExternalId?: string | null },
    text: string,
  ): Promise<{ externalId: string }>;

  fetchAccountMetrics?(ctx: AccountContext): Promise<AccountMetrics>;
  fetchPostMetrics?(ctx: AccountContext, externalId: string): Promise<PostMetrics>;
}
