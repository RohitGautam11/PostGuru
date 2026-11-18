'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Clock, Hash, Lightbulb, Sparkles, Target, TrendingUp, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Btn, Card, EmptyNote, PageLoader, SectionTitle } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';
import { useGrowthStatus } from '@/lib/growth';
import { PLATFORMS, PlatformBadge } from '@/lib/platforms';
import type { Provider } from '@/lib/types';

interface Insights {
  totals: { posts: number; engagement: number };
  platforms: { provider: Provider; label: string; posts: number; avgEngagement: number; engagementRate: number | null; postsLast30: number; recommendedCadence: string }[];
  lengths: { label: string; posts: number; avgEngagement: number }[];
  formats: { label: string; posts: number; avgEngagement: number }[];
  bestTimes: { day: number; hour: number }[];
  hashtags: { tag: string; posts: number; avg: number }[];
  recommendations: string[];
}
interface Format {
  provider: Provider;
  label: string;
  ratios: string[];
  video: { ideal: [number, number]; max: number } | null;
  hashtags: [number, number];
  idealLength: [number, number];
  foldAt: number;
  cadence: string;
  tips: string[];
}
type Idea = { title: string; format: string; platforms: string[]; hook: string; outline: string; why: string };

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dur = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);

function Bars({ rows }: { rows: { label: string; posts: number; avgEngagement: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.avgEngagement));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between" style={{ fontSize: 12 }}>
            <span style={{ color: C.slate, fontWeight: 600 }}>{r.label}</span>
            <span style={{ color: C.faint }}>{r.posts ? `avg ${r.avgEngagement} · ${r.posts} posts` : 'no posts yet'}</span>
          </div>
          <div className="h-2 rounded-full" style={{ background: '#F1F5F9' }}>
            <div className="h-2 rounded-full" style={{ width: `${(r.avgEngagement / max) * 100}%`, background: C.blue }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GrowthPage() {
  const router = useRouter();
  const { data: insights, isLoading } = useQuery({ queryKey: ['growth-insights'], queryFn: () => api<Insights>('/growth/insights') });
  const { data: formats } = useQuery({ queryKey: ['growth-formats'], queryFn: () => api<Format[]>('/growth/formats'), staleTime: Infinity });
  const { data: status } = useGrowthStatus();
  const [topic, setTopic] = useState('');
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const providers = (insights?.platforms.map((p) => p.provider) ?? []) as Provider[];
  const gen = useMutation({
    mutationFn: () =>
      api<{ result: { ideas: Idea[] } }>('/growth/assist', { method: 'POST', body: { task: 'ideas', topic, providers: providers.length ? providers : ['INSTAGRAM', 'LINKEDIN'] } }),
    onSuccess: (r) => setIdeas(r.result.ideas),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !insights) return <PageLoader />;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>Growth Hub</h1>
          <p style={{ fontSize: 13, color: C.faint }}>What works for your audience, what to post next, and each platform&apos;s formats. Based on your last 90 days.</p>
        </div>

        {/* Recommendations */}
        <Card className="p-6" style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #FAF5FF 100%)' }}>
          <div className="mb-3 flex items-center gap-2">
            <Target size={16} color={C.violet} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Your growth plan</span>
          </div>
          <ul className="flex flex-col gap-2">
            {insights.recommendations.map((r) => (
              <li key={r} className="flex items-start gap-2" style={{ fontSize: 13.5, color: C.slate }}>
                <TrendingUp size={14} color={C.blue} className="mt-0.5 flex-shrink-0" /> {r}
              </li>
            ))}
          </ul>
        </Card>

        {/* Platform performance */}
        <Card className="p-6">
          <SectionTitle title="Platform performance & posting consistency" subtitle="Posting consistently is the #1 driver of growth on every platform." />
          {!insights.platforms.length ? (
            <EmptyNote>Connect an account to see platform performance.</EmptyNote>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px]" style={{ fontSize: 13 }}>
                <thead>
                  <tr style={{ color: C.faint, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    <th className="py-2 text-left">Platform</th>
                    <th className="py-2 text-right">Posts (90d)</th>
                    <th className="py-2 text-right">Avg engagement</th>
                    <th className="py-2 text-right">Eng. rate</th>
                    <th className="py-2 text-right">Last 30 days</th>
                    <th className="py-2 text-left pl-6">Recommended</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.platforms.map((p) => (
                    <tr key={p.provider} style={{ borderTop: `1px solid ${C.line}` }}>
                      <td className="py-3"><span className="flex items-center gap-2"><PlatformBadge provider={p.provider} size="sm" /> {p.label}</span></td>
                      <td className="py-3 text-right">{p.posts}</td>
                      <td className="py-3 text-right">{p.avgEngagement}</td>
                      <td className="py-3 text-right">{p.engagementRate === null ? '—' : `${p.engagementRate}%`}</td>
                      <td className="py-3 text-right" style={{ color: p.postsLast30 < 4 ? C.amber : C.green, fontWeight: 700 }}>{p.postsLast30}</td>
                      <td className="py-3 pl-6" style={{ color: C.muted }}>{p.recommendedCadence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="p-6">
            <SectionTitle title="Best content format" subtitle="Average engagement per post" />
            <div className="mt-4"><Bars rows={insights.formats} /></div>
          </Card>
          <Card className="p-6">
            <SectionTitle title="Best caption length" subtitle="Average engagement per post" />
            <div className="mt-4"><Bars rows={insights.lengths} /></div>
          </Card>
          <Card className="p-6">
            <SectionTitle title="Best times & hashtags" subtitle="From your own results" />
            <div className="mt-4 flex flex-col gap-2">
              {insights.bestTimes.length ? (
                insights.bestTimes.map((b) => {
                  const d = new Date(Date.UTC(2024, 0, 7 + b.day, b.hour));
                  return (
                    <p key={`${b.day}-${b.hour}`} className="flex items-center gap-2" style={{ fontSize: 13, color: C.slate }}>
                      <Clock size={13} color={C.blue} /> {DAYS[d.getDay()]} · {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  );
                })
              ) : (
                <p style={{ fontSize: 12, color: C.faint }}>Publish a few posts to discover your best times.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {insights.hashtags.map((h) => (
                  <span key={h.tag} title={`avg ${h.avg} engagements · ${h.posts} posts`} className="rounded-full px-2.5 py-1" style={{ fontSize: 12, fontWeight: 600, color: C.green, background: C.greenSoft, border: `1px solid ${C.greenBorder}` }}>
                    #{h.tag}
                  </span>
                ))}
                {!insights.hashtags.length && <span className="flex items-center gap-1" style={{ fontSize: 12, color: C.faint }}><Hash size={12} /> Your top hashtags will appear here.</span>}
              </div>
            </div>
          </Card>
        </div>

        {/* AI ideas */}
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle title="Content idea generator" subtitle="Get post ideas with hooks and formats that suit your niche" />
          </div>
          {!status?.ai ? (
            <p className="mt-3" style={{ fontSize: 12.5, color: C.muted }}>The AI Writer is not switched on yet. An admin can enable it on the server (ANTHROPIC_API_KEY).</p>
          ) : (
            <>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  maxLength={300}
                  placeholder="Your niche or topic, e.g. 'home bakery in Pune' or 'B2B SaaS for HR teams'"
                  className="flex-1 rounded-xl px-3 py-2.5 outline-none focus:border-[#2563EB]"
                  style={{ fontSize: 13, border: `1px solid ${C.border2}`, background: '#F8FAFC' }}
                />
                <Btn loading={gen.isPending} disabled={!topic.trim()} onClick={() => gen.mutate()}>
                  <Sparkles size={14} /> Generate ideas
                </Btn>
              </div>
              {ideas && (
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {ideas.map((i) => (
                    <div key={i.title} className="rounded-xl p-4" style={{ background: '#F8FAFC', border: `1px solid ${C.border2}` }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{i.title}</p>
                      <p style={{ fontSize: 11.5, fontWeight: 600, color: C.violet }}>{i.format} · {i.platforms.join(', ')}</p>
                      <p className="mt-2" style={{ fontSize: 13, color: C.slate }}>“{i.hook}”</p>
                      <p className="mt-1 whitespace-pre-wrap" style={{ fontSize: 12, color: C.body }}>{i.outline}</p>
                      <p className="mt-2 flex items-start gap-1.5" style={{ fontSize: 11.5, color: C.faint }}><Lightbulb size={12} className="mt-0.5" /> {i.why}</p>
                      <button
                        onClick={() => {
                          try {
                            sessionStorage.setItem('composer-draft', `${i.hook}\n\n${i.outline}`);
                          } catch {
                            /* ignore */
                          }
                          router.push('/composer?draft=1');
                        }}
                        className="mt-3"
                        style={{ fontSize: 12, fontWeight: 700, color: C.blue }}
                      >
                        Create post from this idea →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>

        {/* Formats */}
        <Card className="p-6">
          <SectionTitle title="Formats & best practices by platform" subtitle="Sizes, video lengths, hashtag counts and how often to post" />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(formats ?? []).map((f) => (
              <div key={f.provider} className="rounded-xl p-4" style={{ border: `1px solid ${PLATFORMS[f.provider].border}`, background: PLATFORMS[f.provider].bg }}>
                <div className="mb-2 flex items-center gap-2">
                  <PlatformBadge provider={f.provider} size="sm" />
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{f.label}</span>
                </div>
                <p style={{ fontSize: 12, color: C.slate }}><b>Sizes:</b> {f.ratios.join(', ')}</p>
                {f.video && (
                  <p className="flex items-center gap-1" style={{ fontSize: 12, color: C.slate }}>
                    <Video size={11} /> <b>Video:</b> best {dur(f.video.ideal[0])}–{dur(f.video.ideal[1])}, max {dur(f.video.max)}
                  </p>
                )}
                <p style={{ fontSize: 12, color: C.slate }}><b>Caption:</b> {f.idealLength[0]}–{f.idealLength[1]} chars · hook in first {f.foldAt}</p>
                <p style={{ fontSize: 12, color: C.slate }}><b>Hashtags:</b> {f.hashtags[0]}–{f.hashtags[1]}</p>
                <p style={{ fontSize: 12, color: C.slate }}><b>Post:</b> {f.cadence}</p>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
                  {f.tips.slice(0, 3).map((t) => (
                    <li key={t} style={{ fontSize: 11.5, color: C.body }}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
