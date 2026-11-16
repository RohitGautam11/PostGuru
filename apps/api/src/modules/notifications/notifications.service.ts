import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';

export type NotificationType =
  | 'publishSuccess'
  | 'publishFailure'
  | 'newMessages'
  | 'newComments'
  | 'accountIssues'
  | 'teamActivity'
  | 'weeklyReport';

/** Preference rows shown in Settings → Notifications. Comments and DMs share the "New inbox message" row. */
export const PREF_KEYS = ['publishSuccess', 'publishFailure', 'newMessages', 'accountIssues', 'teamActivity', 'weeklyReport'] as const;
export type PrefKey = (typeof PREF_KEYS)[number];
export type Channel = 'push' | 'email';

const PREF_FOR: Record<NotificationType, PrefKey> = {
  publishSuccess: 'publishSuccess',
  publishFailure: 'publishFailure',
  newMessages: 'newMessages',
  newComments: 'newMessages',
  accountIssues: 'accountIssues',
  teamActivity: 'teamActivity',
  weeklyReport: 'weeklyReport',
};

/** Defaults follow the design's notification matrix; operational alerts stay on in-app by default. */
export const DEFAULT_PREFS: Record<PrefKey, Record<Channel, boolean>> = {
  publishSuccess: { push: true, email: true },
  publishFailure: { push: true, email: true },
  newMessages: { push: true, email: false },
  accountIssues: { push: true, email: true },
  teamActivity: { push: true, email: true },
  weeklyReport: { push: false, email: true },
};

/**
 * Stored shape: `{ publishSuccess: true, publishSuccessEmail: false, … }` — the bare key is the
 * in-app ("push") channel, which keeps preferences saved before email existed valid.
 */
export function prefEnabled(raw: unknown, key: PrefKey, channel: Channel): boolean {
  const prefs = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const v = prefs[channel === 'push' ? key : `${key}Email`];
  return typeof v === 'boolean' ? v : DEFAULT_PREFS[key][channel];
}

export function resolvePrefs(raw: unknown) {
  return Object.fromEntries(PREF_KEYS.map((k) => [k, { push: prefEnabled(raw, k, 'push'), email: prefEnabled(raw, k, 'email') }])) as Record<
    PrefKey,
    Record<Channel, boolean>
  >;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Fans a notification out to every workspace member: in-app (bell + desktop "push") and/or email,
   * according to each member's preferences.
   */
  async notifyWorkspace(
    workspaceId: string,
    type: NotificationType,
    data: { title: string; body?: string; link?: string; stats?: { label: string; value: string }[] },
    opts: { excludeUserId?: string } = {},
  ) {
    try {
      const [members, workspace] = await Promise.all([
        this.prisma.membership.findMany({
          where: { workspaceId, ...(opts.excludeUserId ? { userId: { not: opts.excludeUserId } } : {}) },
          select: { user: { select: { id: true, email: true, name: true, notificationPrefs: true } } },
        }),
        this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } }),
      ]);
      const key = PREF_FOR[type];
      const users = members.map((m) => m.user);
      const push = users.filter((u) => prefEnabled(u.notificationPrefs, key, 'push'));
      const mail = users.filter((u) => prefEnabled(u.notificationPrefs, key, 'email'));

      if (push.length) {
        await this.prisma.notification.createMany({
          data: push.map((u) => ({ userId: u.id, workspaceId, type, title: data.title, body: data.body, link: data.link })),
        });
      }
      await Promise.all(
        mail.map((u) =>
          this.email.send({
            to: u.email,
            subject: `${data.title} · ${workspace?.name ?? env().APP_NAME}`,
            heading: data.title,
            paragraphs: [data.body, `Workspace: ${workspace?.name ?? ''}`].filter(Boolean) as string[],
            stats: data.stats,
            action: data.link ? { label: 'Open in ' + env().APP_NAME, url: `${env().WEB_URL}${data.link}` } : undefined,
            footer: 'You are receiving this because of your notification settings. Change them in Settings → Notifications.',
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(`Failed to deliver notification: ${(err as Error).message}`);
    }
  }

  list(userId: string, workspaceId: string) {
    return Promise.all([
      this.prisma.notification.findMany({
        where: { userId, workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({ where: { userId, workspaceId, readAt: null } }),
    ]).then(([items, unread]) => ({ items, unread }));
  }

  markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
  }

  markAllRead(userId: string, workspaceId: string) {
    return this.prisma.notification.updateMany({ where: { userId, workspaceId, readAt: null }, data: { readAt: new Date() } });
  }
}
