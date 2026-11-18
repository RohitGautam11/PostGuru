'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  Copy,
  Ellipsis,
  Eye,
  Funnel,
  Inbox,
  Link2,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  SquarePen,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wifi,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GettingStarted } from '@/components/growth/getting-started';
import { DeletePostDialog } from '@/components/posts/delete-post-dialog';
import { usePostActions } from '@/components/posts/use-post-actions';
import { Card, Dropdown, EmptyNote, GradientAvatar, MenuItem, Skeleton, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { C, CARD_SHADOW, GRADIENT, TOOLTIP_STYLE, colorFor } from '@/lib/design';
import { DashboardData, useCan, useDashboard, useMe } from '@/lib/hooks';
import { PLATFORMS, PlatformBadge } from '@/lib/platforms';
import { compact, friendlyDate, kfmt } from '@/lib/utils';

// ─── Hero ────────────────────────────────────────────────────────────────────
function Hero({ d }: { d: DashboardData }) {
  const router = useRouter();
  const { data: me } = useMe();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const overview = [
    { label: `${d.stats.scheduledThisWeek} post${d.stats.scheduledThisWeek === 1 ? '' : 's'} scheduled this week`, dot: C.blue },
    { label: `${d.stats.publishedToday} published today`, dot: C.green },
    { label: `${d.stats.unreadInbox} unread inbox message${d.stats.unreadInbox === 1 ? '' : 's'}`, dot: C.purple },
    { label: `${d.stats.accountsNeedingAttention} account${d.stats.accountsNeedingAttention === 1 ? '' : 's'} need${d.stats.accountsNeedingAttention === 1 ? 's' : ''} attention`, dot: C.red },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 px-5 py-6 sm:px-7 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0 rounded-2xl" style={{ boxShadow: '0 6px 16px rgba(37,99,235,0.28)' }}>
            <GradientAvatar name={me?.user.name ?? ''} src={me?.user.avatarUrl} size={54} rounded="2xl" />
          </div>
          <div className="min-w-0">
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.035em', lineHeight: 1.1 }}>
              {greeting}, {me?.user.name.split(' ')[0]} 👋
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span style={{ fontSize: 13, color: C.faint }}>{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
              <span style={{ color: C.border2, fontSize: 14 }}>·</span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5" style={{ fontSize: 12, fontWeight: 600, color: C.blue, background: C.blueSoft, border: `1px solid ${C.blueBorder}` }}>
                {me?.workspace.name}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/planner')}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 transition-colors hover:bg-[#F1F5F9]"
            style={{ fontSize: 13, fontWeight: 600, color: C.slate, border: `1px solid ${C.border2}`, background: '#fff', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}
          >
            <CalendarDays size={14} color={C.muted} /> View Planner
          </button>
          <button
            onClick={() => router.push('/composer')}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: GRADIENT, boxShadow: '0 4px 16px rgba(37,99,235,0.38)' }}
          >
            <Plus size={15} strokeWidth={2.5} /> Create Post
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 sm:px-7" style={{ borderTop: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 12, color: C.faint, fontWeight: 500 }}>Today&apos;s overview</span>
        {overview.map((o) => (
          <div key={o.label} className="flex items-center gap-2">
            <span className="flex-shrink-0 rounded-full" style={{ width: 6, height: 6, background: o.dot }} />
            <span style={{ fontSize: 12, color: C.body, fontWeight: 500 }}>{o.label}</span>
          </div>
        ))}
        <button onClick={() => router.push('/analytics')} className="ml-auto flex items-center gap-1 transition-opacity hover:opacity-70" style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>
          Full report <ChevronRight size={12} strokeWidth={2.5} />
        </button>
      </div>
    </Card>
  );
}

// ─── Issues banner ───────────────────────────────────────────────────────────
function Issues({ issues }: { issues: DashboardData['issues'] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const list = issues.filter((i) => !dismissed.includes(i.id));
  if (!list.length) return null;
  const errors = list.filter((i) => i.type === 'error').length;
  const warnings = list.filter((i) => i.type === 'warning').length;
  return (
    <Card className="overflow-hidden">
      <button className="flex w-full flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-[#FEF9F9] sm:px-6" onClick={() => setOpen((v) => !v)}>
        <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 34, height: 34, background: C.redSoft }}>
          <ShieldAlert size={16} strokeWidth={2.5} color={C.red} />
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
            {list.length} issue{list.length > 1 ? 's' : ''} need your attention
          </span>
          <div className="flex items-center gap-2">
            {errors > 0 && (
              <span className="flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1" style={{ fontSize: 11, fontWeight: 700, color: C.red, background: C.redSoft, border: `1px solid ${C.redBorder}` }}>
                <CircleX size={11} strokeWidth={2.5} /> {errors} error{errors > 1 ? 's' : ''}
              </span>
            )}
            {warnings > 0 && (
              <span className="flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1" style={{ fontSize: 11, fontWeight: 700, color: C.amber, background: C.amberSoft, border: `1px solid ${C.amberBorder}` }}>
                <TriangleAlert size={11} strokeWidth={2.5} /> {warnings} warning{warnings > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span style={{ fontSize: 12, fontWeight: 600, color: C.faint }}>{open ? 'Hide' : 'Show details'}</span>
          <ChevronDown size={15} strokeWidth={2.5} style={{ color: C.faint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
        </div>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid #FEE2E2' }}>
          {list.map((i, idx) => {
            const err = i.type === 'error';
            return (
              <div key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#FAFAFA] sm:flex-nowrap sm:gap-4" style={{ borderTop: idx > 0 ? '1px solid #F8FAFC' : undefined }}>
                <div className="flex flex-shrink-0 items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: err ? '#FEE2E2' : '#FEF3C7' }}>
                  {err ? <CircleX size={13} strokeWidth={2.5} color={C.red} /> : <TriangleAlert size={13} strokeWidth={2.5} color={C.amber} />}
                </div>
                {i.provider && (
                  <span className="flex-shrink-0 rounded-lg px-2 py-1" style={{ fontSize: 11, fontWeight: 700, color: C.body, background: '#F1F5F9' }}>
                    {PLATFORMS[i.provider].short}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                    {i.title} <span style={{ fontWeight: 400, color: C.muted }}>— {i.description}</span>
                  </span>
                </div>
                <button
                  onClick={() => router.push(i.action.href)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all hover:opacity-80"
                  style={{ fontSize: 12, fontWeight: 700, color: err ? C.red : C.amber, background: err ? '#FEE2E2' : '#FEF3C7', border: `1px solid ${err ? C.redBorder : C.amberBorder}` }}
                >
                  {i.action.label === 'Reconnect' && <RefreshCw size={11} strokeWidth={2.5} />}
                  {i.action.label} <ArrowRight size={11} strokeWidth={2.5} />
                </button>
                <button
                  className="flex flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[#F1F5F9]"
                  style={{ width: 26, height: 26 }}
                  onClick={() => setDismissed((d) => [...d, i.id])}
                  aria-label="Dismiss"
                >
                  <span style={{ fontSize: 14, color: C.ghost, lineHeight: 1 }}>×</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ─── Stat cards ──────────────────────────────────────────────────────────────
function StatCard({
  title,
  value,
  icon,
  iconBg,
  trend,
  subtitle,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  iconBg: string;
  trend?: { value: string; direction: 'up' | 'down' | 'neutral'; label: string };
  subtitle?: string;
}) {
  const t = trend
    ? {
        up: { text: C.green, bg: C.greenSoft, border: C.greenBorder },
        down: { text: C.red, bg: C.redSoft, border: C.redBorder },
        neutral: { text: C.muted, bg: '#F8FAFC', border: C.border2 },
      }[trend.direction]
    : null;
  return (
    <Card className="flex flex-col overflow-hidden" style={{ minHeight: 144 }}>
      <div className="flex flex-1 flex-col justify-between p-6">
        <div className="flex items-start justify-between gap-3">
          <p style={{ fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: '0.01em', lineHeight: 1.3 }}>{title}</p>
          <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: iconBg }}>
            {icon}
          </div>
        </div>
        <div className="mt-3">
          <p style={{ fontSize: 38, fontWeight: 800, color: C.ink, letterSpacing: '-0.035em', lineHeight: 1 }}>{value}</p>
          {trend && t && (
            <div className="mt-2.5 flex items-center gap-2">
              <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5" style={{ fontSize: 11, fontWeight: 700, color: t.text, background: t.bg, border: `1px solid ${t.border}` }}>
                {trend.direction === 'up' && <TrendingUp size={10} strokeWidth={3} />}
                {trend.direction === 'down' && <TrendingDown size={10} strokeWidth={3} />}
                {trend.direction === 'neutral' && <Minus size={10} strokeWidth={3} />}
                {trend.value}
              </span>
              <span style={{ fontSize: 12, color: C.faint }}>{trend.label}</span>
            </div>
          )}
          {subtitle && !trend && <p style={{ fontSize: 12, color: C.faint, marginTop: 10 }}>{subtitle}</p>}
        </div>
      </div>
    </Card>
  );
}

// ─── Quick actions ───────────────────────────────────────────────────────────
function QuickActions({ unread }: { unread: number }) {
  const router = useRouter();
  const items = [
    { id: 'create', label: 'Create Post', description: 'Draft, schedule & publish', icon: SquarePen, path: '/composer', primary: true, iconColor: '#fff', iconBg: '' },
    { id: 'planner', label: 'Content Planner', description: 'Browse your calendar', icon: CalendarDays, path: '/planner', iconColor: C.orange, iconBg: C.orangeSoft },
    { id: 'connect', label: 'Connect Account', description: 'Add a social profile', icon: Link2, path: '/connect', iconColor: C.green, iconBg: C.greenSoft },
    { id: 'inbox', label: 'Inbox', description: unread ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'All caught up', icon: Inbox, path: '/inbox', iconColor: C.purple, iconBg: C.purpleSoft, badge: unread },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((i) => (
        <button
          key={i.id}
          onClick={() => router.push(i.path)}
          className="group flex items-stretch overflow-hidden rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: i.primary ? GRADIENT : '#fff', boxShadow: i.primary ? '0 4px 18px rgba(37,99,235,0.3)' : CARD_SHADOW }}
        >
          <div
            className="flex flex-shrink-0 items-center justify-center"
            style={{ width: 58, background: i.primary ? 'rgba(0,0,0,0.13)' : i.iconBg, borderRight: i.primary ? '1px solid rgba(255,255,255,0.09)' : '1px solid rgba(0,0,0,0.04)' }}
          >
            <i.icon size={18} strokeWidth={i.primary ? 2.5 : 2} color={i.iconColor} />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 px-4 py-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p style={{ fontSize: 13, fontWeight: 700, color: i.primary ? '#fff' : C.ink, lineHeight: 1.2 }}>{i.label}</p>
                {!!i.badge && (
                  <span className="flex flex-shrink-0 items-center justify-center rounded-full" style={{ fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, padding: '0 4px', background: C.red, color: '#fff' }}>
                    {i.badge}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 11, color: i.primary ? 'rgba(255,255,255,0.65)' : C.faint, marginTop: 1, lineHeight: 1.3 }}>{i.description}</p>
            </div>
            <ArrowRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" color={i.primary ? 'rgba(255,255,255,0.5)' : C.ghost} />
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Recent posts ────────────────────────────────────────────────────────────
const COLS = '40px 1fr 120px 108px 140px 110px 72px';
type Tab = 'all' | 'scheduled' | 'published' | 'failed' | 'draft';

function RecentPosts({ d }: { d: DashboardData }) {
  const router = useRouter();
  const canEdit = useCan('EDITOR');
  const actions = usePostActions();
  const [tab, setTab] = useState<Tab>('all');
  const [toDelete, setToDelete] = useState<{ id: string; status: string } | null>(null);
  const match: Record<Tab, (s: string) => boolean> = {
    all: () => true,
    scheduled: (s) => s === 'SCHEDULED',
    published: (s) => s === 'PUBLISHED' || s === 'PARTIAL',
    failed: (s) => s === 'FAILED',
    draft: (s) => s === 'DRAFT',
  };
  const posts = d.posts.filter((p) => match[tab](p.status)).slice(0, 10);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'published', label: 'Published' },
    { id: 'failed', label: 'Failed' },
    { id: 'draft', label: 'Draft' },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-6 pb-0 pt-6">
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Recent Posts</h3>
          <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{d.postCounts.all} posts across all platforms</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/planner?view=list')}
            className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors hover:bg-[#F8FAFC] sm:flex"
            style={{ fontSize: 12, fontWeight: 600, color: C.muted, border: '1px solid #E8EDF3' }}
          >
            <Funnel size={11} strokeWidth={2.5} /> Filter
          </button>
          <button onClick={() => router.push('/planner')} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors hover:bg-[#EFF6FF]" style={{ fontSize: 12, fontWeight: 600, color: C.blue, border: `1px solid ${C.blueBorder}` }}>
            View all <ArrowUpRight size={12} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <div className="scrollbar-thin mt-4 flex items-center gap-1 overflow-x-auto px-6" style={{ borderBottom: `1px solid ${C.line}` }}>
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className="relative flex flex-shrink-0 items-center gap-1.5 px-3 py-2 transition-all">
              <span style={{ fontSize: 12, fontWeight: on ? 700 : 500, color: on ? C.ink : C.faint }}>{t.label}</span>
              <span className="flex items-center justify-center rounded-full" style={{ fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, padding: '0 5px', background: on ? C.ink : '#F1F5F9', color: on ? '#fff' : C.faint }}>
                {d.postCounts[t.id]}
              </span>
              {on && <span className="absolute bottom-0 left-0 right-0 rounded-t-full" style={{ height: 2, background: C.ink }} />}
            </button>
          );
        })}
      </div>
      <div className="scrollbar-thin overflow-x-auto">
        <div style={{ minWidth: 700 }}>
          <div className="grid items-center px-6 py-3" style={{ gridTemplateColumns: COLS, background: '#FAFBFC', borderBottom: `1px solid ${C.line}` }}>
            {['', 'Post', 'Platform', 'Status', 'Scheduled', 'Author', ''].map((h, i) => (
              <span key={i} style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {h}
              </span>
            ))}
          </div>
          {!posts.length && <EmptyNote>{tab === 'all' ? 'No posts yet — create your first one.' : 'No posts in this category'}</EmptyNote>}
          {posts.map((p, i) => {
            const first = p.targets[0]?.socialAccount;
            const when = p.publishedAt ?? p.scheduledAt;
            return (
              <div
                key={p.id}
                className="group relative grid cursor-pointer items-center bg-white px-6 transition-colors hover:bg-[#F8FAFC]"
                style={{ gridTemplateColumns: COLS, minHeight: 64, borderBottom: i < posts.length - 1 ? `1px solid ${C.line}` : 'none' }}
                onClick={() => router.push(`/posts/${p.id}`)}
              >
                <div className="absolute bottom-0 left-0 top-0 rounded-r-full opacity-0 transition-opacity group-hover:opacity-100" style={{ width: 3, background: C.blue }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: C.ghost, paddingLeft: 6 }}>{String(i + 1).padStart(2, '0')}</span>
                <div className="py-3 pr-4">
                  <p className="line-clamp-2-safe" style={{ fontSize: 13, color: C.ink, fontWeight: 500, lineHeight: 1.45 }} title={p.content}>
                    {p.content || <span style={{ color: C.faint }}>Media post</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 py-3">
                  {first ? (
                    <>
                      <PlatformBadge provider={first.provider} size="sm" />
                      <span style={{ fontSize: 12, fontWeight: 500, color: C.body }}>
                        {PLATFORMS[first.provider].short}
                        {p.targets.length > 1 && <span style={{ color: C.faint }}> +{p.targets.length - 1}</span>}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: C.ghost }}>—</span>
                  )}
                </div>
                <div className="py-3">
                  <StatusPill status={p.status} />
                </div>
                <div className="flex items-center gap-1.5 py-3">
                  <Clock size={11} color={C.ghost} className="flex-shrink-0" />
                  <span style={{ fontSize: 12, color: when ? C.body : C.ghost, fontWeight: 500 }}>{friendlyDate(when)}</span>
                </div>
                <div className="flex items-center gap-2 py-3">
                  {p.author ? (
                    <>
                      <div className="flex flex-shrink-0 items-center justify-center rounded-full" style={{ width: 26, height: 26, background: `${colorFor(p.author.id)}15`, border: `1.5px solid ${colorFor(p.author.id)}30` }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: colorFor(p.author.id) }}>
                          {p.author.name
                            .split(' ')
                            .map((w) => w[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                      </div>
                      <span className="truncate" style={{ fontSize: 12, color: C.slate, fontWeight: 500 }}>
                        {p.author.name.split(' ')[0]}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: C.ghost }}>—</span>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1 py-3" onClick={(e) => e.stopPropagation()}>
                  {p.status === 'FAILED' && canEdit ? (
                    <button
                      onClick={() => actions.publish.mutate(p.id)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 transition-all hover:opacity-80"
                      style={{ fontSize: 11, fontWeight: 700, color: C.red, background: '#FEE2E2', border: `1px solid ${C.redBorder}` }}
                    >
                      <RefreshCw size={10} strokeWidth={2.5} className={actions.publish.isPending && actions.publish.variables === p.id ? 'animate-spin' : ''} /> Retry
                    </button>
                  ) : (
                    <button onClick={() => router.push(`/posts/${p.id}`)} className="flex items-center justify-center rounded-lg opacity-0 transition-colors hover:bg-[#EFF6FF] group-hover:opacity-100" style={{ width: 28, height: 28 }} title="View">
                      <Eye size={13} color={C.blue} />
                    </button>
                  )}
                  {canEdit && (
                    <Dropdown
                      align="right"
                      width={170}
                      trigger={
                        <button className="flex items-center justify-center rounded-lg opacity-0 transition-colors hover:bg-[#F1F5F9] group-hover:opacity-100" style={{ width: 28, height: 28 }} title="More">
                          <Ellipsis size={13} color={C.muted} />
                        </button>
                      }
                    >
                      <div style={{ padding: '4px 0' }}>
                        {['DRAFT', 'SCHEDULED', 'FAILED'].includes(p.status) && (
                          <MenuItem icon={<Pencil size={13} />} onClick={() => router.push(`/composer?id=${p.id}`)}>
                            Edit
                          </MenuItem>
                        )}
                        {['DRAFT', 'SCHEDULED'].includes(p.status) && (
                          <MenuItem icon={<Send size={13} />} onClick={() => actions.publish.mutate(p.id)}>
                            Publish now
                          </MenuItem>
                        )}
                        <MenuItem icon={<Copy size={13} />} onClick={() => actions.duplicate.mutate(p.id)}>
                          Duplicate
                        </MenuItem>
                        <MenuItem icon={<Trash2 size={13} />} danger onClick={() => setToDelete(p)}>
                          Delete
                        </MenuItem>
                      </div>
                    </Dropdown>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <DeletePostDialog post={toDelete} onClose={() => setToDelete(null)} />
    </Card>
  );
}

// ─── Performance ─────────────────────────────────────────────────────────────
interface Overview {
  totals: { impressions: number; impressionsChange: number | null; engagement: number; engagementChange: number | null; followersChange: number; followersChangePct: number | null };
  series: { date: string; engagement: number }[];
}

function ChangePill({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5" style={{ fontSize: 10, fontWeight: 700, color: up ? C.green : C.red, background: up ? C.greenSoft : C.redSoft }}>
      {up ? <TrendingUp size={8} strokeWidth={3} /> : <TrendingDown size={8} strokeWidth={3} />}
      {up ? '+' : ''}
      {value}%
    </span>
  );
}

function Performance() {
  const router = useRouter();
  const [range, setRange] = useState<'7' | '30' | '90'>('7');
  const { data } = useQuery({ queryKey: ['analytics', 'perf', range], queryFn: () => api<Overview>('/analytics/overview', { query: { days: range } }) });
  const metrics = data
    ? [
        { label: 'Impressions', value: compact(data.totals.impressions), change: data.totals.impressionsChange },
        { label: 'Engagements', value: compact(data.totals.engagement), change: data.totals.engagementChange },
        { label: 'Followers', value: `${data.totals.followersChange >= 0 ? '+' : ''}${compact(data.totals.followersChange)}`, change: data.totals.followersChangePct },
      ]
    : [];
  return (
    <Card className="overflow-hidden">
      <div className="px-6 pb-4 pt-6" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-start justify-between">
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>Performance</h3>
            <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>All platforms · last {range} days</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: '#F8FAFC', border: `1px solid ${C.line}` }}>
              {(['7', '30', '90'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className="rounded-md px-2.5 py-1 transition-all"
                  style={{ fontSize: 11, fontWeight: range === r ? 700 : 500, color: range === r ? C.ink : C.faint, background: range === r ? '#fff' : 'transparent', boxShadow: range === r ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}
                >
                  {r}d
                </button>
              ))}
            </div>
            <button onClick={() => router.push('/analytics')} className="flex items-center justify-center rounded-lg transition-colors hover:bg-[#F8FAFC]" style={{ width: 28, height: 28 }} title="Open analytics">
              <ArrowUpRight size={14} color={C.faint} />
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        {(metrics.length ? metrics : [0, 1, 2].map((i) => ({ label: ['Impressions', 'Engagements', 'Followers'][i], value: '—', change: null }))).map((m, i) => (
          <div key={m.label} className="px-4 py-4 sm:px-6" style={{ borderLeft: i > 0 ? `1px solid ${C.line}` : 'none' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{m.label}</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
              <p style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1 }}>{m.value}</p>
              <ChangePill value={m.change} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ height: 172, padding: '12px 12px 8px 0' }}>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data?.series ?? []} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: C.ghost }}
              axisLine={false}
              tickLine={false}
              minTickGap={18}
              tickFormatter={(v) => format(new Date(v), range === '7' ? 'EEE' : 'MMM d')}
            />
            <YAxis tick={{ fontSize: 10, fill: C.ghost }} axisLine={false} tickLine={false} tickCount={5} allowDecimals={false} tickFormatter={kfmt} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={{ color: C.faint, fontWeight: 500, marginBottom: 4 }}
              itemStyle={{ color: '#fff', fontWeight: 700 }}
              cursor={{ stroke: C.border2, strokeWidth: 1 }}
              labelFormatter={(v) => format(new Date(v), 'EEE, MMM d')}
            />
            <Area type="monotone" dataKey="engagement" name="Engagements" stroke={C.blue} strokeWidth={2} fill={C.blue} fillOpacity={0.12} dot={false} activeDot={{ r: 4, fill: C.blue, stroke: '#fff', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ─── Accounts ────────────────────────────────────────────────────────────────
const HEALTH = {
  active: { label: 'Active', icon: CircleCheck, color: C.green, bg: C.greenSoft, border: C.greenBorder },
  expiring: { label: 'Expiring', icon: TriangleAlert, color: C.amber, bg: C.amberSoft, border: C.amberBorder },
  expired: { label: 'Reconnect', icon: CircleX, color: C.red, bg: C.redSoft, border: C.redBorder },
};

function Accounts({ d }: { d: DashboardData }) {
  const router = useRouter();
  const healthy = d.stats.accountsHealthy;
  const total = d.accounts.length;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div>
          <div className="flex items-center gap-2">
            <h3 style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>Accounts</h3>
            {total > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: healthy === total ? C.green : C.amber,
                  background: healthy === total ? C.greenSoft : C.amberSoft,
                  border: `1px solid ${healthy === total ? C.greenBorder : C.amberBorder}`,
                }}
              >
                <Zap size={9} strokeWidth={3} /> {healthy}/{total} healthy
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>Connected social profiles</p>
        </div>
        <button onClick={() => router.push('/connect')} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all hover:bg-[#EFF6FF]" style={{ fontSize: 12, fontWeight: 600, color: C.blue, border: `1px solid ${C.blueBorder}` }}>
          <Plus size={12} strokeWidth={2.5} /> Connect
        </button>
      </div>
      {!total && <EmptyNote>No accounts connected yet</EmptyNote>}
      {d.accounts.map((a, i) => {
        const h = HEALTH[a.health];
        return (
          <div
            key={a.id}
            className="group flex cursor-pointer items-center gap-3 px-6 py-4 transition-colors hover:bg-[#F8FAFC]"
            style={{ borderBottom: i < d.accounts.length - 1 ? `1px solid ${C.line}` : 'none' }}
            onClick={() => router.push('/connect')}
          >
            <PlatformBadge provider={a.provider} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>
                {a.username ? (a.username.startsWith('@') || a.username.includes('@') ? a.username : `@${a.username}`) : a.name}
              </p>
              <p style={{ fontSize: 11, color: C.faint, lineHeight: 1.3 }}>{compact(a.followers)} followers</p>
            </div>
            {a.health !== 'active' ? (
              <button
                className="flex flex-shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 transition-all hover:opacity-80"
                style={{ fontSize: 11, fontWeight: 700, color: h.color, background: h.bg, border: `1px solid ${h.border}` }}
                onClick={(e) => {
                  e.stopPropagation();
                  router.push('/connect');
                }}
              >
                <RefreshCw size={10} strokeWidth={2.5} />
                {a.health === 'expiring' && a.daysUntilExpiry ? `${a.daysUntilExpiry}d left` : 'Reconnect'}
              </button>
            ) : (
              <div className="flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-1" style={{ background: h.bg, border: `1px solid ${h.border}` }}>
                <h.icon size={11} strokeWidth={2.5} color={h.color} />
                <span style={{ fontSize: 10, fontWeight: 700, color: h.color }}>{h.label}</span>
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 12, color: C.faint }}>Supports Instagram, Facebook, LinkedIn, X, YouTube</span>
        <button onClick={() => router.push('/connect')} style={{ fontSize: 12, fontWeight: 600, color: C.blue }} className="flex-shrink-0 transition-opacity hover:opacity-70">
          Manage →
        </button>
      </div>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { data: d, isLoading } = useDashboard();

  if (isLoading || !d) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
          <Skeleton style={{ height: 150 }} />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} style={{ height: 144 }} />
            ))}
          </div>
          <Skeleton style={{ height: 420 }} />
        </div>
      </div>
    );
  }

  const s = d.stats;
  const rateChange = s.engagementRateChange;
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <Hero d={d} />
        <Issues issues={d.issues} />
        <GettingStarted dismissible />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Scheduled Posts"
            value={s.scheduled}
            icon={<CalendarCheck size={18} color={C.blue} />}
            iconBg={C.blueSoft}
            trend={{
              value: `${s.scheduledDelta > 0 ? '+' : ''}${s.scheduledDelta === 0 ? s.scheduledAddedToday : s.scheduledDelta}`,
              direction: s.scheduledDelta > 0 ? 'up' : s.scheduledDelta < 0 ? 'down' : 'neutral',
              label: s.scheduledDelta === 0 ? 'added today' : 'since yesterday',
            }}
          />
          <StatCard
            title="Published Today"
            value={s.publishedToday}
            icon={<Send size={18} color={C.green} />}
            iconBg={C.greenSoft}
            trend={{ value: s.publishedToday > 0 ? 'On track' : 'None yet', direction: 'neutral', label: "for today's goal" }}
          />
          <StatCard
            title="Connected Accounts"
            value={s.accounts}
            icon={<Wifi size={18} color={C.purple} />}
            iconBg={C.purpleSoft}
            subtitle={s.accountsNeedingAttention ? `${s.accountsNeedingAttention} require${s.accountsNeedingAttention === 1 ? 's' : ''} attention` : s.accounts ? 'All healthy' : 'Connect your first account'}
          />
          <StatCard
            title="Avg. Engagement Rate"
            value={s.engagementRate !== null ? `${s.engagementRate}%` : '—'}
            icon={<TrendingUp size={18} color={C.orange} />}
            iconBg={C.orangeSoft}
            trend={
              rateChange !== null
                ? { value: `${rateChange >= 0 ? '+' : ''}${rateChange}%`, direction: rateChange > 0 ? 'up' : rateChange < 0 ? 'down' : 'neutral', label: 'vs last week' }
                : undefined
            }
            subtitle="Last 7 days"
          />
        </div>
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1fr_380px]">
          <div className="flex min-w-0 flex-col gap-6">
            <QuickActions unread={s.unreadInbox} />
            <RecentPosts d={d} />
          </div>
          <div className="flex flex-col gap-6">
            <Performance />
            <Accounts d={d} />
          </div>
        </div>
      </div>
    </div>
  );
}


