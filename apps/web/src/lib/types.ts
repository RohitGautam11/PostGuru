export type Provider = 'FACEBOOK' | 'INSTAGRAM' | 'X' | 'LINKEDIN' | 'YOUTUBE' | 'THREADS' | 'TIKTOK' | 'PINTEREST';
export type Role = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
export type Plan = 'FREE' | 'CREATOR' | 'PRO' | 'BUSINESS';
export type PostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'PARTIAL' | 'FAILED';
export type TargetStatus = 'PENDING' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
export type CommentStatus = 'NEW' | 'REVIEWED' | 'REPLIED' | 'HIDDEN';
export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export interface Capabilities {
  maxChars: number;
  maxImages: number;
  video: boolean;
  requiresMedia: boolean;
  requiresVideo: boolean;
  comments: boolean;
  replyComments: boolean;
  hideComments: boolean;
  deleteComments: boolean;
  inbox: boolean;
  analytics: boolean;
}

export interface Me {
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    timezone: string;
    jobTitle: string | null;
    passwordChangedAt: string | null;
    twoFactorEnabledAt: string | null;
    notificationPrefs: Record<string, boolean> | null;
    createdAt: string;
  };
  workspace: { id: string; name: string; plan: Plan };
  role: Role;
  workspaces: { id: string; name: string; plan: Plan; role: Role }[];
}

export interface AccountRef {
  id: string;
  provider: Provider;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
}

export interface SocialAccount extends AccountRef {
  externalId: string;
  status: 'CONNECTED' | 'EXPIRED' | 'ERROR';
  statusMessage: string | null;
  followers: number | null;
  lastSyncedAt: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
  capabilities: Capabilities;
}

export interface Integration {
  key: Provider;
  name: string;
  configured: boolean;
  /** Connection flavours, e.g. Instagram creator (Instagram Login) vs business (Facebook Page). */
  modes: { key: string; configured: boolean }[] | null;
  capabilities: Capabilities;
  callbackUrl: string;
}

export interface MediaAsset {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  type: 'IMAGE' | 'VIDEO';
  createdAt: string;
}

export interface PostMedia {
  id: string;
  url: string;
  type: 'IMAGE' | 'VIDEO';
  mimeType: string;
  size?: number;
}

export interface PostTarget {
  id: string;
  status: TargetStatus;
  externalId: string | null;
  permalink: string | null;
  error: string | null;
  attempts: number;
  publishedAt: string | null;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  socialAccount: AccountRef;
}

export interface Post {
  id: string;
  content: string;
  media: PostMedia[];
  link: string | null;
  overrides: Partial<
    Record<Provider, { content?: string; title?: string; tags?: string[]; thread?: boolean; hashtagsInFirstComment?: boolean; firstComment?: string }>
  > | null;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatarUrl: string | null } | null;
  targets: PostTarget[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Conversation {
  id: string;
  externalId: string;
  participantName: string;
  participantHandle: string | null;
  participantAvatar: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  status: 'OPEN' | 'ARCHIVED';
  socialAccount: AccountRef;
}

export interface Message {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  text: string;
  senderName: string | null;
  attachments: { type: string; url: string }[] | null;
  sentAt: string;
}

export interface Comment {
  id: string;
  externalId: string;
  externalPostId: string;
  postPermalink: string | null;
  postPreview: string | null;
  authorName: string;
  authorHandle: string | null;
  authorAvatar: string | null;
  text: string;
  likeCount: number;
  hidden: boolean;
  status: CommentStatus;
  sentiment: Sentiment;
  postedAt: string;
  socialAccount: AccountRef;
  replies: { id: string; text: string; postedAt: string; authorName: string }[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export type ThreadType = 'dm' | 'page_message' | 'comment' | 'mention' | 'reply';

export interface InboxThread {
  id: string;
  type: ThreadType;
  provider: Provider;
  account: AccountRef;
  author: { name: string; handle: string | null; avatar: string | null };
  preview: string | null;
  lastActivityAt: string;
  unread: boolean;
  status: 'open' | 'assigned' | 'resolved';
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  flagged: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
  hidden?: boolean;
  muted?: boolean;
  sourcePost: { title: string; permalink: string | null } | null;
}

export interface ThreadNote {
  id: string;
  text: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
}

export interface ThreadMessage {
  id: string;
  from: 'us' | 'them';
  author: string;
  handle?: string | null;
  avatar: string | null;
  text: string;
  sentAt: string;
  likes?: number;
  hidden?: boolean;
  isNested?: boolean;
  delivered?: boolean;
  permalink?: string | null;
  attachments?: { type: string; url: string }[] | null;
}
