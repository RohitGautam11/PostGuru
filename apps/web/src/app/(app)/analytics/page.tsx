'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toPng } from 'html-to-image';
import { ArrowUpRight, BarChart3, CalendarClock, ChevronDown, Eye, FileText, Heart, ImageDown, Printer, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ScheduleReportDialog } from '@/components/analytics/schedule-report';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Dropdown, EmptyNote, MenuDivider, MenuItem, MenuLabel, PageLoader } from '@/components/ui';
import { api } from '@/lib/api';
import { C, TOOLTIP_STYLE } from '@/lib/design';
import { useAccounts } from '@/lib/hooks';
import { PLATFORMS, PROVIDER_ORDER, PlatformBadge } from '@/lib/platforms';
import type { AccountRef, Provider } from '@/lib/types';
import { compact, kfmt } from '@/lib/utils';

interface Overview {
  range: { days: number; maxDays: number };
  totals: {
    followers: number;
    followersChange: number;
    followersChangePct: number | null;
    reach: number;
    reachChange: number | null;
    impressions: number;
    impressionsChange: number | null;
    engagement: number;
    engagementChange: number | null;
    engagementRate: number | null;
  };
  series: { date: string; reach: number; impressions: number; engagement: number }[];
  seriesByProvider: ({ date: string } & Partial<Record<Provider, number>>)[];
  topPosts: {
    targetId: string;
    postId: string;
    content: string;
    account: AccountRef;
    impressions: number;
    engagement: number;
  }[];
}

const RANGES = ['7', '30', '90'] as const;
type Range = (typeof RANGES)[number];

/** Buckets daily rows the way the design labels them: days (7d), weeks (30d), months (90d). */
function bucket<T extends { date: string }>(rows: T[], range: Range, sum: (acc: Record<string, number>, r: T) => void) {
  const groups = new Map<string, Record<string, number>>();
  rows.forEach((r, i) => {
    const d = new Date(r.date);
    const key = range === '7' ? format(d, 'EEE') : range === '30' ? `Wk ${Math.floor(i / 7) + 1}` : format(d, 'MMM');
    const acc = groups.get(key) ?? {};
    sum(acc, r);
    groups.set(key, acc);
  });
  return [...groups.entries()].map(([label, v]) => ({ label, ...v }));
}

function Kpi({ title, value, change, icon, color, bg }: { title: string; value: string; change: number | null; icon: React.ReactNode; color: string; bg: string }) {
  const up = (change ?? 0) >= 0;
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: bg, color }}>
          {icon}
        </div>
        {change !== null && (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ fontSize: 11, fontWeight: 700, color: up ? C.green : C.red, background: up ? C.greenSoft : C.redSoft }}>
            {up ? <TrendingUp size={10} strokeWidth={2.5} /> : <TrendingDown size={10} strokeWidth={2.5} />}
            {up ? '+' : ''}
            {change}%
          </span>
        )}
      </div>
      <p style={{ fontSize: 28, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em', lineHeight: 1, marginTop: 16 }}>{value}</p>
      <p style={{ fontSize: 13, color: C.faint, marginTop: 6 }}>{title}</p>
    </Card>
  );
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { data: accounts } = useAccounts();
  const [range, setRange] = useState<Range>('7');
  const available = useMemo(() => PROVIDER_ORDER.filter((p) => accounts?.some((a) => a.provider === p)), [accounts]);
  const [hidden, setHidden] = useState<Provider[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const shown = available.filter((p) => !hidden.includes(p));

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'page', range, shown.join(',')],
    queryFn: () => api<Overview>('/analytics/overview', { query: { days: range, providers: hidden.length ? shown.join(',') : undefined } }),
    placeholderData: keepPreviousData,
  });

  const toggle = (p: Provider) => setHidden((h) => (h.includes(p) ? h.filter((x) => x !== p) : shown.length > 1 ? [...h, p] : h));

  const engagementBars = useMemo(
    () =>
      data
        ? bucket(data.seriesByProvider, range, (acc, r) => {
            for (const p of PROVIDER_ORDER) acc[p] = (acc[p] ?? 0) + (r[p] ?? 0);
          })
        : [],
    [data, range],
  );
  const reachLine = useMemo(
    () => (data ? bucket(data.series, range, (acc, r) => (acc.value = (acc.value ?? 0) + (r.reach || r.impressions))) : []),
    [data, range],
  );

  function exportCsv() {
    if (!data) return;
    downloadCsv(`analytics-${range}d-${format(new Date(), 'yyyy-MM-dd')}.csv`, [
      ['Date', 'Reach', 'Impressions', 'Engagement', ...PROVIDER_ORDER.map((p) => `${PLATFORMS[p].short} engagement`)],
      ...data.series.map((s, i) => [s.date, s.reach, s.impressions, s.engagement, ...PROVIDER_ORDER.map((p) => data.seriesByProvider[i]?.[p] ?? 0)]),
      [],
      ['Top posts'],
      ['Post', 'Platform', 'Account', 'Impressions', 'Engagements'],
      ...data.topPosts.map((t) => [t.content, PLATFORMS[t.account.provider].short, t.account.name, t.impressions, t.engagement]),
    ]);
  }

  async function exportPng() {
    if (!reportRef.current || !data) return;
    setExporting(true);
    try {
      const url = await toPng(reportRef.current, {
        backgroundColor: C.page,
        pixelRatio: 2,
        // Leave the filter / export controls out of the image.
        filter: (node) => !(node instanceof HTMLElement && node.dataset.exportHide !== undefined),
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${range}d-${format(new Date(), 'yyyy-MM-dd')}.png`;
      a.click();
    } catch {
      toast.error('Could not create the image. Try Export as PDF instead.');
    } finally {
      setExporting(false);
    }
  }

  const tick = { fontSize: 11, fill: C.ghost };
  const t = data?.totals;

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8" style={{ background: C.page }}>
      <div ref={reportRef} className="mx-auto max-w-[1400px]">
        <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>Analytics</h1>
            <p style={{ fontSize: 14, color: C.faint, marginTop: 4 }}>Performance overview across all connected accounts</p>
          </div>
          <div data-export-hide className="flex flex-wrap items-center gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-1.5">
              {available.map((p) => {
                const on = !hidden.includes(p);
                const col = PLATFORMS[p].color;
                return (
                  <button
                    key={p}
                    onClick={() => toggle(p)}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-all"
                    style={{ fontSize: 12, fontWeight: 600, color: on ? col : C.faint, background: on ? `${col}10` : '#fff', border: `1px solid ${on ? col + '30' : C.border3}` }}
                  >
                    <PlatformBadge provider={p} size="sm" />
                    {PLATFORMS[p].short}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-0.5 rounded-xl p-1" style={{ background: '#fff', border: `1px solid ${C.border3}` }}>
              {RANGES.map((r) => (
                <button key={r} onClick={() => setRange(r)} className="rounded-lg px-3 py-1.5 transition-all" style={{ fontSize: 12, fontWeight: range === r ? 700 : 500, color: range === r ? C.ink : C.faint, background: range === r ? C.page : 'transparent' }}>
                  {r}d
                </button>
              ))}
            </div>
            <Dropdown
              align="right"
              width={200}
              trigger={
                <button className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 transition-colors hover:bg-[#F8FAFC]" style={{ fontSize: 13, fontWeight: 600, color: C.slate2, border: `1px solid ${C.border3}` }}>
                  {exporting ? 'Exporting…' : 'Export'} <ChevronDown size={13} color={C.faint2} />
                </button>
              }
            >
              <div style={{ padding: '4px 0' }}>
                <MenuLabel>Export report</MenuLabel>
                <MenuItem icon={<FileText size={13} strokeWidth={1.8} />} onClick={exportCsv}>
                  Export as CSV
                </MenuItem>
                <MenuItem icon={<Printer size={13} strokeWidth={1.8} />} onClick={() => window.print()}>
                  Export as PDF
                </MenuItem>
                <MenuItem icon={<ImageDown size={13} strokeWidth={1.8} />} onClick={exportPng}>
                  Export as PNG
                </MenuItem>
                <MenuDivider />
                <MenuItem icon={<CalendarClock size={13} strokeWidth={1.8} />} onClick={() => setScheduleOpen(true)}>
                  Schedule report
                </MenuItem>
              </div>
            </Dropdown>
          </div>
        </div>

        {data && data.range.days < Number(range) && (
          <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <span style={{ fontSize: 13, color: C.body }}>Your plan includes {data.range.maxDays} days of analytics history.</span>
            <button onClick={() => router.push('/settings?tab=billing')} className="rounded-xl px-4 py-2" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: C.blue }}>
              Upgrade
            </button>
          </Card>
        )}

        {isLoading || !t ? (
          <PageLoader />
        ) : !accounts?.length ? (
          <Card className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-4 flex items-center justify-center rounded-2xl" style={{ width: 52, height: 52, background: C.blueSoft }}>
              <BarChart3 size={24} color={C.blue} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>No analytics yet</p>
            <p style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>Connect an account and publish posts to see performance here.</p>
            <button onClick={() => router.push('/connect')} className="mt-5 rounded-xl px-4 py-2.5" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: C.blue }}>
              Connect accounts
            </button>
          </Card>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi title="Total Reach" value={compact(t.reach)} change={t.reachChange} icon={<Eye size={18} />} color={C.blue} bg={C.blueSoft} />
              <Kpi title="Impressions" value={compact(t.impressions)} change={t.impressionsChange} icon={<Users size={18} />} color={C.blue} bg={C.blueSoft} />
              <Kpi title="Engagements" value={compact(t.engagement)} change={t.engagementChange} icon={<Heart size={18} />} color={C.green} bg={C.greenSoft} />
              <Kpi
                title="New Followers"
                value={`${t.followersChange >= 0 ? '+' : ''}${compact(t.followersChange)}`}
                change={t.followersChangePct}
                icon={<TrendingUp size={18} />}
                color={C.orange}
                bg={C.orangeSoft}
              />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card className="p-6 sm:p-7">
                <div className="mb-5">
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Engagement by Platform</h3>
                  <p style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>Likes, comments and shares across all content</p>
                </div>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={engagementBars} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                      <YAxis tick={{ ...tick, fontSize: 10 }} axisLine={false} tickLine={false} tickCount={4} allowDecimals={false} tickFormatter={kfmt} />
                      <Tooltip contentStyle={{ ...TOOLTIP_STYLE, borderRadius: 12 }} labelStyle={{ color: C.faint, marginBottom: 4 }} itemStyle={{ color: '#fff' }} cursor={{ fill: '#F8FAFC' }} />
                      {shown.map((p) => (
                        <Bar key={p} dataKey={p} name={PLATFORMS[p].short} fill={p === 'INSTAGRAM' ? '#E1306C' : PLATFORMS[p].accent} radius={[6, 6, 0, 0]} maxBarSize={24} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-6 sm:p-7">
                <div className="mb-5">
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Reach Over Time</h3>
                  <p style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>Total audience reached across all posts</p>
                </div>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={reachLine} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
                      <YAxis tick={{ ...tick, fontSize: 10 }} axisLine={false} tickLine={false} tickCount={4} allowDecimals={false} tickFormatter={kfmt} />
                      <Tooltip contentStyle={{ ...TOOLTIP_STYLE, borderRadius: 12 }} labelStyle={{ color: C.faint, marginBottom: 4 }} itemStyle={{ color: '#fff' }} cursor={{ stroke: C.border2 }} />
                      <Line type="monotone" dataKey="value" name="Reach" stroke={C.blue} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: C.blue, stroke: '#fff', strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 sm:px-7">
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Top Performing Posts</h3>
                  <p style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>Ranked by engagement in the selected period</p>
                </div>
                <button onClick={() => router.push('/planner?view=list')} className="flex items-center gap-1.5 transition-opacity hover:opacity-70 print:hidden" style={{ fontSize: 13, fontWeight: 600, color: C.blue }}>
                  View all <ArrowUpRight size={13} strokeWidth={2.5} />
                </button>
              </div>
              <div className="scrollbar-thin overflow-x-auto">
                <div style={{ minWidth: 560 }}>
                  <div className="grid px-6 py-3 sm:px-7" style={{ gridTemplateColumns: '1fr 80px 100px 110px 70px', borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
                    {['Post', 'Platform', 'Reach', 'Engagements', 'Rate'].map((h) => (
                      <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                        {h}
                      </span>
                    ))}
                  </div>
                  {!data.topPosts.length && <EmptyNote>Publish posts to see how they perform</EmptyNote>}
                  {data.topPosts.map((p, i) => {
                    const rate = p.impressions ? Math.round((p.engagement / p.impressions) * 1000) / 10 : null;
                    const good = rate !== null && rate >= (t.engagementRate ?? 0);
                    return (
                      <div
                        key={p.targetId}
                        className="grid cursor-pointer items-center px-6 py-4 transition-colors hover:bg-[#FAFBFD] sm:px-7"
                        style={{ gridTemplateColumns: '1fr 80px 100px 110px 70px', borderBottom: i < data.topPosts.length - 1 ? `1px solid ${C.line}` : 'none' }}
                        onClick={() => router.push(`/posts/${p.postId}`)}
                      >
                        <p className="truncate pr-6" style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>
                          {p.content || 'Media post'}
                        </p>
                        <div>
                          <PlatformBadge provider={p.account.provider} size="sm" />
                        </div>
                        <span style={{ fontSize: 13, color: C.slate, fontWeight: 600 }}>{compact(p.impressions)}</span>
                        <span style={{ fontSize: 13, color: C.slate, fontWeight: 600 }}>{compact(p.engagement)}</span>
                        <span
                          className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5"
                          style={{ fontSize: 11, fontWeight: 700, color: rate === null ? C.muted : good ? C.green : C.red, background: rate === null ? '#F1F5F9' : good ? C.greenSoft : C.redSoft }}
                        >
                          {rate !== null && (good ? <TrendingUp size={10} strokeWidth={2.5} /> : <TrendingDown size={10} strokeWidth={2.5} />)}
                          {rate !== null ? `${rate}%` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
      <ScheduleReportDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </div>
  );
}
