'use client';

import { useQuery } from '@tanstack/react-query';
import { addDays, addWeeks, endOfWeek, format, isBefore, isSameDay, isToday, startOfDay, startOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Funnel, LayoutGrid, List, Plus, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { usePostActions } from '@/components/posts/use-post-actions';
import { Card, EmptyNote, PageLoader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { C, POST_STATUS } from '@/lib/design';
import { useAccounts, useCan } from '@/lib/hooks';
import { PLATFORMS, PROVIDER_ORDER, PlatformBadge } from '@/lib/platforms';
import type { Paginated, Post, PostStatus, Provider } from '@/lib/types';

const when = (p: Post) => new Date(p.publishedAt ?? p.scheduledAt ?? p.createdAt);
const movable = (p: Post) => p.status === 'SCHEDULED' || p.status === 'DRAFT';
const providerOf = (p: Post): Provider | null => p.targets[0]?.socialAccount.provider ?? null;
const timeLabel = (p: Post) => (p.status === 'DRAFT' && !p.scheduledAt ? '--' : format(when(p), 'h:mm a'));

function PostChip({ p, draggable, onOpen }: { p: Post; draggable: boolean; onOpen: () => void }) {
  const s = POST_STATUS[p.status];
  const prov = providerOf(p);
  return (
    <button
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData('text/post-id', p.id)}
      onClick={onOpen}
      className="w-full rounded-xl p-2.5 text-left transition-all hover:scale-[1.02] hover:shadow-md"
      style={{ background: s.bg, border: `1.5px solid ${s.border}`, cursor: draggable ? 'grab' : 'pointer' }}
      title={p.content}
    >
      <div className="mb-1 flex items-center gap-1.5">
        {prov && <PlatformBadge provider={prov} size="sm" />}
        <span style={{ fontSize: 10, fontWeight: 700, color: prov ? PLATFORMS[prov].color : C.muted }}>{timeLabel(p)}</span>
        {p.targets.length > 1 && <span style={{ fontSize: 9, fontWeight: 700, color: C.faint }}>+{p.targets.length - 1}</span>}
        <span className="ml-auto flex-shrink-0 rounded-full" style={{ width: 6, height: 6, background: s.dot }} />
      </div>
      <p className="line-clamp-2-safe" style={{ fontSize: 11, color: C.slate, lineHeight: 1.4 }}>
        {p.content || 'Media post'}
      </p>
    </button>
  );
}

function Planner() {
  const router = useRouter();
  const params = useSearchParams();
  const canEdit = useCan('EDITOR');
  const { reschedule } = usePostActions();
  const { data: accounts } = useAccounts();
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState<'week' | 'list'>(params.get('view') === 'list' ? 'list' : 'week');
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [hidden, setHidden] = useState<Provider[]>([]);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(cursor, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const searching = query.trim().length > 0;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['planner', searching ? `q:${query}` : weekStart.toISOString()],
    queryFn: () =>
      api<Paginated<Post>>('/posts', {
        query: searching ? { search: query.trim(), pageSize: 200 } : { from: weekStart.toISOString(), to: weekEnd.toISOString(), pageSize: 500 },
      }),
  });

  // Platforms the workspace actually uses (connected accounts + platforms on loaded posts).
  const platforms = useMemo(() => {
    const set = new Set<Provider>((accounts ?? []).map((a) => a.provider));
    for (const p of data?.items ?? []) for (const t of p.targets) set.add(t.socialAccount.provider);
    return PROVIDER_ORDER.filter((p) => set.has(p));
  }, [accounts, data]);

  const posts = (data?.items ?? []).filter((p) => {
    const provs = p.targets.map((t) => t.socialAccount.provider);
    return !provs.length || provs.some((x) => !hidden.includes(x));
  });
  const scheduledCount = posts.filter((p) => p.status === 'SCHEDULED').length;
  const byDay = (d: Date) => posts.filter((p) => isSameDay(when(p), d)).sort((a, b) => when(a).getTime() - when(b).getTime());

  const toggle = (p: Provider) =>
    setHidden((h) => (h.includes(p) ? h.filter((x) => x !== p) : platforms.filter((x) => !h.includes(x)).length > 1 ? [...h, p] : h));

  function createOn(day: Date) {
    if (!canEdit) return;
    if (isBefore(day, startOfDay(new Date()))) return toast.error("You can't schedule posts in the past");
    const at = isToday(day) ? new Date(Date.now() + 3600_000) : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, 0);
    router.push(`/composer?date=${encodeURIComponent(at.toISOString())}`);
  }

  function drop(day: Date, id: string) {
    const p = posts.find((x) => x.id === id);
    if (!p || !movable(p)) return;
    const old = when(p);
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), old.getHours(), old.getMinutes());
    if (next.getTime() < Date.now()) return toast.error('Pick a day in the future');
    if (isSameDay(next, old)) return;
    reschedule.mutate({ id, scheduledAt: next.toISOString() });
  }

  const subtitle = searching
    ? `${posts.length} result${posts.length === 1 ? '' : 's'} for “${query.trim()}”`
    : `${format(weekStart, 'MMM d')} – ${format(weekEnd, weekStart.getMonth() === weekEnd.getMonth() ? 'd, yyyy' : 'MMM d, yyyy')} · ${scheduledCount} post${scheduledCount === 1 ? '' : 's'} scheduled`;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>Content Planner</h1>
            <div className="flex items-center gap-2" style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>
              {subtitle} {isFetching && <Spinner size={12} />}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {platforms.length > 0 && (
              <div className="flex items-center gap-1.5">
                {platforms.map((p) => {
                  const on = !hidden.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => toggle(p)}
                      title={`${on ? 'Hide' : 'Show'} ${PLATFORMS[p].label}`}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all"
                      style={{ border: `1.5px solid ${on ? PLATFORMS[p].color + '40' : C.border2}`, background: on ? PLATFORMS[p].bg : '#fff', opacity: on ? 1 : 0.55 }}
                    >
                      <PlatformBadge provider={p} size="sm" />
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mx-2 hidden h-5 w-px sm:block" style={{ background: C.border2 }} />
            {!searching && (
              <div className="flex items-center gap-1">
                <button onClick={() => setCursor((c) => addWeeks(c, -1))} className="flex items-center justify-center rounded-lg transition-colors hover:bg-white" style={{ width: 32, height: 32, border: `1px solid ${C.border2}` }} aria-label="Previous week">
                  <ChevronLeft size={14} color={C.muted} />
                </button>
                <button onClick={() => setCursor(new Date())} className="rounded-lg px-3 py-1.5 transition-colors hover:bg-white" style={{ fontSize: 12, fontWeight: 600, color: C.blue, border: `1px solid ${C.blueBorder}`, background: C.blueSoft }}>
                  Today
                </button>
                <button onClick={() => setCursor((c) => addWeeks(c, 1))} className="flex items-center justify-center rounded-lg transition-colors hover:bg-white" style={{ width: 32, height: 32, border: `1px solid ${C.border2}` }} aria-label="Next week">
                  <ChevronRight size={14} color={C.muted} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: '#F1F5F9', border: `1px solid ${C.border2}` }}>
              {(
                [
                  ['week', LayoutGrid],
                  ['list', List],
                ] as const
              ).map(([v, Icon]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className="flex items-center justify-center rounded-md transition-all"
                  style={{ width: 28, height: 28, background: view === v ? '#fff' : 'transparent', boxShadow: view === v ? '0 1px 3px rgba(15,23,42,0.08)' : 'none' }}
                  title={v === 'week' ? 'Week view' : 'List view'}
                >
                  <Icon size={13} color={view === v ? C.ink : C.faint} />
                </button>
              ))}
            </div>
            {canEdit && (
              <button onClick={() => router.push('/composer')} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 transition-all hover:opacity-90" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: C.blue, boxShadow: '0 1px 3px rgba(37,99,235,0.2)' }}>
                <Plus size={14} strokeWidth={2.5} /> New Post
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <PageLoader />
        ) : view === 'week' && !searching ? (
          <Card className="overflow-hidden">
            <div className="scrollbar-thin overflow-x-auto">
              <div style={{ minWidth: 840 }}>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${C.line}` }}>
                  {days.map((d) => {
                    const today = isToday(d);
                    return (
                      <div key={d.toISOString()} className="px-4 py-4 text-center" style={{ background: today ? C.blueSoft : 'transparent' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: today ? C.blue : C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{format(d, 'EEE')}</p>
                        <div className="mt-1 flex items-center justify-center">
                          <span className="flex items-center justify-center rounded-full" style={{ width: 28, height: 28, background: today ? C.blue : 'transparent' }}>
                            <span style={{ fontSize: 13, fontWeight: today ? 800 : 600, color: today ? '#fff' : C.ink }}>{format(d, 'd')}</span>
                          </span>
                        </div>
                        <p style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{format(d, 'MMM')}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', minHeight: 420 }}>
                  {days.map((d, i) => {
                    const list = byDay(d);
                    const past = isBefore(d, startOfDay(new Date()));
                    return (
                      <div
                        key={d.toISOString()}
                        className="group flex flex-col gap-2 p-3"
                        style={{
                          borderLeft: i > 0 ? `1px solid ${C.line}` : 'none',
                          background: dragOver === i ? '#EFF6FF' : isToday(d) ? 'rgba(239,246,255,0.25)' : 'transparent',
                          outline: dragOver === i ? `2px dashed ${C.blueBorder}` : 'none',
                          outlineOffset: -4,
                        }}
                        onDragOver={(e) => {
                          if (canEdit && !past) {
                            e.preventDefault();
                            setDragOver(i);
                          }
                        }}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(null);
                          drop(d, e.dataTransfer.getData('text/post-id'));
                        }}
                      >
                        {list.map((p) => (
                          <PostChip key={p.id} p={p} draggable={canEdit && movable(p)} onOpen={() => router.push(`/posts/${p.id}`)} />
                        ))}
                        {canEdit && !past && (
                          <button
                            onClick={() => createOn(d)}
                            className="flex items-center justify-center rounded-xl opacity-0 transition-all hover:bg-[#F8FAFC] hover:opacity-100 group-hover:opacity-100"
                            style={{ height: 36, border: `1.5px dashed ${C.border2}` }}
                            aria-label={`Create post on ${format(d, 'EEEE')}`}
                          >
                            <Plus size={14} color={C.ghost} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-6 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
              <Funnel size={12} color={C.faint} />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{searching ? 'Search results' : 'All posts · this week'}</span>
              <div className="ml-auto flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: '#F8FAFC', border: `1px solid ${C.line2}`, minWidth: 220 }}>
                <Search size={12} color={C.faint2} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search posts…" className="flex-1 bg-transparent outline-none" style={{ fontSize: 12, color: C.ink2 }} />
                {query && (
                  <button onClick={() => setQuery('')} aria-label="Clear search">
                    <X size={12} color={C.faint2} />
                  </button>
                )}
              </div>
            </div>
            {!posts.length && <EmptyNote>{searching ? 'No posts match your search' : 'No posts this week'}</EmptyNote>}
            {searching
              ? posts.map((p, i) => <ListRow key={p.id} p={p} last={i === posts.length - 1} withDate />)
              : days.map((d) => {
                  const list = byDay(d);
                  if (!list.length) return null;
                  return (
                    <div key={d.toISOString()}>
                      <div className="px-6 py-3" style={{ background: '#FAFBFC', borderBottom: `1px solid ${C.line}` }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.body }}>{format(d, 'EEE, MMM d')}</span>
                      </div>
                      {list.map((p) => (
                        <ListRow key={p.id} p={p} />
                      ))}
                    </div>
                  );
                })}
          </Card>
        )}
      </div>
    </div>
  );
}

function ListRow({ p, withDate, last }: { p: Post; withDate?: boolean; last?: boolean }) {
  const router = useRouter();
  const s = POST_STATUS[p.status as PostStatus];
  const prov = providerOf(p);
  return (
    <div className="flex cursor-pointer items-center gap-4 px-6 py-4 transition-colors hover:bg-[#F8FAFC]" style={{ borderBottom: last ? 'none' : `1px solid ${C.line}` }} onClick={() => router.push(`/posts/${p.id}`)}>
      {prov ? <PlatformBadge provider={prov} size="sm" /> : <span style={{ width: 22 }} />}
      <span style={{ fontSize: 12, color: C.muted, fontWeight: 600, minWidth: withDate ? 120 : 64 }}>{withDate ? format(when(p), 'MMM d, h:mm a') : timeLabel(p)}</span>
      <p className="min-w-0 flex-1 truncate" style={{ fontSize: 13, color: C.ink }}>
        {p.content || 'Media post'}
      </p>
      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ fontSize: 10, fontWeight: 700, color: s.dot, background: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
        <span className="rounded-full" style={{ width: 5, height: 5, background: s.dot }} />
        {s.label}
      </span>
    </div>
  );
}

export default function PlannerPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Planner />
    </Suspense>
  );
}
