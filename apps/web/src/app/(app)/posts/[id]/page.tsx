'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowLeft, Calendar, CalendarClock, Clock, Copy, Ellipsis, ExternalLink, Eye, Heart, MessageCircle, Pencil, RefreshCw, Send, Share2, Trash2, TriangleAlert, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MediaThumb } from '@/components/media-picker';
import { DeletePostDialog } from '@/components/posts/delete-post-dialog';
import { usePostActions } from '@/components/posts/use-post-actions';
import { Btn, Card, Dropdown, MenuItem, Modal, PageLoader, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { C, POST_STATUS } from '@/lib/design';
import { useCan } from '@/lib/hooks';
import { PLATFORMS, PlatformBadge } from '@/lib/platforms';
import type { Post } from '@/lib/types';
import { compact, friendlyDate, toLocalInput } from '@/lib/utils';

export default function PostDetailsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const canEdit = useCan('EDITOR');
  const actions = usePostActions();
  const [deleting, setDeleting] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [newTime, setNewTime] = useState('');
  const { data: post, isLoading, error } = useQuery({
    queryKey: ['post', params.id],
    queryFn: () => api<Post>(`/posts/${params.id}`),
    refetchInterval: (q) => (q.state.data?.status === 'PUBLISHING' ? 4000 : false),
  });

  if (isLoading) return <PageLoader />;
  if (error || !post) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <p style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Post not found</p>
        <Btn variant="outline" onClick={() => router.push('/dashboard')}>
          Back to Dashboard
        </Btn>
      </div>
    );
  }

  const first = post.targets[0]?.socialAccount;
  const failed = post.targets.filter((t) => t.status === 'FAILED');
  const published = post.targets.filter((t) => t.status === 'PUBLISHED');
  const editable = ['DRAFT', 'SCHEDULED', 'FAILED'].includes(post.status);
  const sum = (k: 'likes' | 'comments' | 'shares' | 'impressions') => post.targets.reduce((a, t) => a + (t[k] ?? 0), 0);
  const tokenIssue = failed.some((t) => /token|reconnect|expired|auth/i.test(t.error ?? ''));
  const card = { boxShadow: '0 1px 3px rgba(15,23,42,0.04),0 1px 2px rgba(15,23,42,0.03)' };

  const info = [
    { label: 'Platform', value: [...new Set(post.targets.map((t) => PLATFORMS[t.socialAccount.provider].short))].join(', ') || '—', badge: true },
    { label: 'Scheduled', value: friendlyDate(post.scheduledAt), icon: Clock },
    ...(post.publishedAt ? [{ label: 'Published', value: friendlyDate(post.publishedAt), icon: Calendar }] : []),
    { label: 'Author', value: post.author?.name ?? '—', icon: User },
  ];

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8" style={{ background: C.page }}>
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={() => router.back()} className="flex items-center justify-center rounded-xl bg-white transition-colors hover:bg-[#F8FAFC]" style={{ width: 38, height: 38, border: `1px solid ${C.border3}` }} aria-label="Back">
            <ArrowLeft size={16} color={C.muted} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em' }}>Post Details</h1>
              <StatusPill status={post.status} />
            </div>
            <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>
              {first ? PLATFORMS[first.provider].short : 'No platform'}
              {post.targets.length > 1 ? ` +${post.targets.length - 1}` : ''} · Created by {post.author?.name ?? 'a teammate'}
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              {(post.status === 'FAILED' || post.status === 'PARTIAL') && (
                <button
                  onClick={() => (tokenIssue ? router.push('/connect') : actions.publish.mutate(post.id))}
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 transition-all hover:opacity-90"
                  style={{ fontSize: 13, fontWeight: 500, color: '#fff', background: C.red }}
                >
                  <RefreshCw size={13} strokeWidth={2.5} className={actions.publish.isPending ? 'animate-spin' : ''} /> {tokenIssue ? 'Reconnect & Retry' : 'Retry failed'}
                </button>
              )}
              {editable && post.status !== 'FAILED' && (
                <button onClick={() => router.push(`/composer?id=${post.id}`)} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 transition-colors hover:bg-[#F8FAFC]" style={{ fontSize: 13, fontWeight: 500, color: C.ink, border: `1px solid ${C.border3}` }}>
                  <Pencil size={13} /> Edit post
                </button>
              )}
              <Dropdown
                align="right"
                width={190}
                trigger={
                  <button className="flex items-center justify-center rounded-xl bg-white transition-colors hover:bg-[#F8FAFC]" style={{ width: 38, height: 38, border: `1px solid ${C.border3}` }} aria-label="More">
                    <Ellipsis size={15} color={C.muted} />
                  </button>
                }
              >
                <div style={{ padding: '4px 0' }}>
                  {['DRAFT', 'SCHEDULED'].includes(post.status) && (
                    <MenuItem icon={<Send size={13} />} onClick={() => actions.publish.mutate(post.id)}>
                      Publish now
                    </MenuItem>
                  )}
                  <MenuItem
                    icon={<Copy size={13} />}
                    onClick={() =>
                      actions.duplicate.mutate(post.id, {
                        onSuccess: (p) => router.push(`/composer?id=${p.id}`),
                      })
                    }
                  >
                    Duplicate
                  </MenuItem>
                  <MenuItem icon={<Trash2 size={13} />} danger onClick={() => setDeleting(true)}>
                    Delete post
                  </MenuItem>
                </div>
              </Dropdown>
            </div>
          )}
        </div>

        {failed.length > 0 && (
          <div className="flex flex-wrap items-start gap-3 rounded-2xl px-6 py-5" style={{ background: C.redSoft }}>
            <TriangleAlert size={18} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
            <div className="min-w-0 flex-1">
              <p style={{ fontSize: 13, fontWeight: 600, color: C.red }}>Publishing failed{post.status === 'PARTIAL' ? ` on ${failed.length} account${failed.length > 1 ? 's' : ''}` : ''}</p>
              {failed.map((t) => (
                <p key={t.id} style={{ fontSize: 13, color: '#7F1D1D', marginTop: 2 }}>
                  <b>{t.socialAccount.name}:</b> {t.error}
                </p>
              ))}
            </div>
            {canEdit && (
              <button
                onClick={() => (tokenIssue ? router.push('/connect') : actions.publish.mutate(post.id))}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5"
                style={{ fontSize: 12, fontWeight: 500, color: C.red }}
              >
                <RefreshCw size={11} strokeWidth={2.5} /> Fix now
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-6">
            <div className="overflow-hidden rounded-2xl bg-white p-5 sm:p-7" style={card}>
              <div className="mb-5 flex items-center gap-2">
                {first && <PlatformBadge provider={first.provider} size="sm" />}
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{first ? PLATFORMS[first.provider].short : 'Post'} Preview</span>
              </div>
              <div className="mx-auto overflow-hidden rounded-2xl" style={{ border: '1px solid #EEF0F4', maxWidth: 520 }}>
                <div className="flex items-center gap-3 px-5 py-4">
                  {first ? (
                    <div className="flex flex-shrink-0 items-center justify-center rounded-full" style={{ width: 42, height: 42, background: `${PLATFORMS[first.provider].color}15` }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: PLATFORMS[first.provider].color }}>{first.name.slice(0, 2).toUpperCase()}</span>
                    </div>
                  ) : null}
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{first?.name ?? 'Your account'}</p>
                    <p style={{ fontSize: 12, color: C.faint, marginTop: 1 }}>{friendlyDate(post.publishedAt ?? post.scheduledAt)}</p>
                  </div>
                  {first && (
                    <div className="ml-auto">
                      <PlatformBadge provider={first.provider} size="sm" />
                    </div>
                  )}
                </div>
                <div className="px-5 pb-5">
                  <p style={{ fontSize: 14, color: C.ink, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{post.content || <span style={{ color: C.faint }}>No text</span>}</p>
                  {post.link && (
                    <a href={post.link} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: C.blue, wordBreak: 'break-all' }}>
                      {post.link}
                    </a>
                  )}
                </div>
                {post.media.length ? (
                  <div className={post.media.length > 1 ? 'grid grid-cols-2 gap-0.5' : ''}>
                    {post.media.slice(0, 4).map((m) => (
                      <MediaThumb key={m.id} url={m.url} type={m.type} className="w-full" style={{ height: post.media.length > 1 ? 160 : 260 }} />
                    ))}
                  </div>
                ) : (
                  <div className="flex h-36 items-center justify-center" style={{ background: C.page }}>
                    <div className="text-center">
                      <Eye size={24} color={C.ghost} className="mx-auto" />
                      <p style={{ fontSize: 12, color: C.faint, marginTop: 6 }}>No media attached</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {published.length > 0 && (
              <div className="rounded-2xl bg-white p-5 sm:p-7" style={card}>
                <div className="mb-5">
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>Post Performance</h3>
                  <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>Published {friendlyDate(post.publishedAt)} · updated every sync</p>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { icon: Eye, label: 'Impressions', value: sum('impressions'), color: C.violet },
                    { icon: Heart, label: 'Likes', value: sum('likes'), color: '#E1306C' },
                    { icon: MessageCircle, label: 'Comments', value: sum('comments'), color: '#0A66C2' },
                    { icon: Share2, label: 'Shares', value: sum('shares'), color: '#059669' },
                  ].map(({ icon: Icon, label, value, color }) => (
                    <div key={label} className="rounded-xl p-4" style={{ background: C.page }}>
                      <div className="mb-2 flex items-center gap-1.5">
                        <Icon size={12} color={color} />
                        <span style={{ fontSize: 11, fontWeight: 500, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
                      </div>
                      <p style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>{compact(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-white p-5 sm:p-7" style={card}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 14 }}>Delivery</h3>
              <div className="flex flex-col gap-2">
                {post.targets.map((t) => {
                  const s = { PENDING: POST_STATUS.SCHEDULED, PUBLISHING: POST_STATUS.PUBLISHING, PUBLISHED: POST_STATUS.PUBLISHED, FAILED: POST_STATUS.FAILED }[t.status];
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3" style={{ border: `1px solid ${C.line2}` }}>
                      <PlatformBadge provider={t.socialAccount.provider} size="sm" />
                      <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>
                        {t.socialAccount.name}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ fontSize: 10, fontWeight: 700, color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
                        <span className="rounded-full" style={{ width: 5, height: 5, background: s.dot }} />
                        {t.status === 'PENDING' ? 'Queued' : t.status.charAt(0) + t.status.slice(1).toLowerCase()}
                      </span>
                      {t.permalink && (
                        <a href={t.permalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 transition-opacity hover:opacity-70" style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>
                          View <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-2xl bg-white p-6" style={card}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 18 }}>Post Information</h3>
              <div className="flex flex-col gap-4">
                {info.map((i) => (
                  <div key={i.label} className="flex items-center gap-3">
                    <div className="flex flex-shrink-0 items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: C.page }}>
                      {i.badge && first ? <PlatformBadge provider={first.provider} size="sm" /> : i.icon ? <i.icon size={14} color={C.muted} /> : null}
                    </div>
                    <div className="min-w-0">
                      <p style={{ fontSize: 11, fontWeight: 500, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{i.label}</p>
                      <p className="truncate" style={{ fontSize: 13, fontWeight: 500, color: C.ink, marginTop: 2 }}>
                        {i.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {canEdit && (
              <div className="rounded-2xl bg-white p-6" style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 14 }}>Actions</h3>
                <div className="flex flex-col gap-2">
                  {editable && (
                    <button onClick={() => router.push(`/composer?id=${post.id}`)} className="flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 transition-colors hover:bg-[#F8FAFC]" style={{ border: `1px solid ${C.border3}` }}>
                      <Pencil size={14} color={C.muted} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>Edit post</span>
                    </button>
                  )}
                  {(post.status === 'SCHEDULED' || post.status === 'DRAFT') && (
                    <button
                      onClick={() => {
                        setNewTime(toLocalInput(post.scheduledAt ? new Date(post.scheduledAt) : new Date(Date.now() + 3600_000)));
                        setRescheduling(true);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 transition-colors hover:bg-[#F8FAFC]"
                      style={{ border: `1px solid ${C.border3}` }}
                    >
                      <Calendar size={14} color={C.muted} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.ink }}>Reschedule</span>
                    </button>
                  )}
                  {(post.status === 'FAILED' || post.status === 'PARTIAL') && (
                    <button onClick={() => actions.publish.mutate(post.id)} className="flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 transition-opacity hover:opacity-90" style={{ background: C.redSoft }}>
                      <RefreshCw size={14} color={C.red} className={actions.publish.isPending ? 'animate-spin' : ''} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.red }}>Retry publishing</span>
                    </button>
                  )}
                  {published.length > 0 && (
                    <button onClick={() => router.push('/analytics')} className="flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 transition-opacity hover:opacity-90" style={{ background: C.blueSoft }}>
                      <Eye size={14} color={C.blue} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.blue }}>View analytics</span>
                    </button>
                  )}
                  <button onClick={() => setDeleting(true)} className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-4 py-2.5 transition-colors hover:bg-[#FEF2F2]" style={{ border: `1px solid ${C.border3}` }}>
                    <Trash2 size={14} color={C.red} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: C.red }}>Delete post</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <DeletePostDialog post={deleting ? post : null} onClose={() => setDeleting(false)} onDeleted={() => router.push('/dashboard')} />
      <Modal open={rescheduling} onClose={() => setRescheduling(false)} width={400}>
        <form
          style={{ padding: 24 }}
          onSubmit={(e) => {
            e.preventDefault();
            actions.reschedule.mutate({ id: post.id, scheduledAt: new Date(newTime).toISOString() }, { onSuccess: () => setRescheduling(false) });
          }}
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: C.blueSoft }}>
              <CalendarClock size={16} color={C.blue} />
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>Reschedule post</h2>
          </div>
          <input
            type="datetime-local"
            value={newTime}
            min={toLocalInput(new Date())}
            onChange={(e) => setNewTime(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 outline-none focus:border-[#2563EB]"
            style={{ fontSize: 13, border: `1px solid ${C.border2}`, background: '#F8FAFC', color: C.ink }}
            required
          />
          <p style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>Currently {post.scheduledAt ? format(new Date(post.scheduledAt), "MMM d, yyyy 'at' h:mm a") : 'not scheduled'}</p>
          <div className="mt-6 flex justify-end gap-2.5">
            <Btn type="button" variant="outline" onClick={() => setRescheduling(false)}>
              Cancel
            </Btn>
            <Btn type="submit" loading={actions.reschedule.isPending}>
              Reschedule
            </Btn>
          </div>
        </form>
      </Modal>
    </div>
  );
}
