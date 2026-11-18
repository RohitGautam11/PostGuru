'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Copy, Hash, Info, Lightbulb, Sparkles, TrendingUp, Wand2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';
import { AiTask, CheckLevel, HashtagResult, MediaMeta, ScoreResult, scoreColor, useDebounced, useGrowthStatus } from '@/lib/growth';
import { PLATFORMS, PlatformGlyph } from '@/lib/platforms';
import type { Provider } from '@/lib/types';

interface Props {
  content: string;
  providers: Provider[];
  media: MediaMeta[];
  link?: string;
  title?: string;
  tags?: string[];
  scheduledAt?: string;
  disabled?: boolean;
  onAddHashtags: (tags: string[]) => void;
  onReplaceContent: (text: string) => void;
  onReplaceHook: (hook: string) => void;
  onYoutube: (v: { title?: string; description?: string; tags?: string[] }) => void;
}

const LEVEL: Record<CheckLevel, { icon: typeof CircleCheck; color: string }> = {
  good: { icon: CircleCheck, color: C.green },
  warn: { icon: CircleAlert, color: C.amber },
  bad: { icon: XCircle, color: C.red },
  info: { icon: Info, color: C.blue },
};

type AiResult =
  | { task: 'caption' | 'improve'; result: { variants: { provider: string; text: string; why: string }[] } }
  | { task: 'hashtags'; result: { hashtags: { tag: string; reach: string; reason: string }[] } }
  | { task: 'hooks'; result: { hooks: { text: string; style: string }[] } }
  | { task: 'youtube_seo'; result: { titles: string[]; description: string; tags: string[]; thumbnailText: string[] } }
  | { task: 'ideas'; result: { ideas: { title: string; format: string; platforms: string[]; hook: string; outline: string; why: string }[] } };

export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <div className="relative flex flex-shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F1F5F9" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(circ * score) / 100} ${circ}`} />
      </svg>
      <span className="absolute" style={{ fontSize: size > 50 ? 16 : 12, fontWeight: 800, color }}>
        {score}
      </span>
    </div>
  );
}

export function GrowthAssistant(p: Props) {
  const [tab, setTab] = useState<'score' | 'hashtags' | 'ai'>('score');
  const [focus, setFocus] = useState<Provider | null>(null);
  const [topic, setTopic] = useState('');
  const [ai, setAi] = useState<AiResult | null>(null);
  const { data: status } = useGrowthStatus();

  const scoreInput = useDebounced(
    JSON.stringify({ content: p.content, providers: p.providers, media: p.media, link: p.link || undefined, title: p.title || undefined, tags: p.tags, scheduledAt: p.scheduledAt }),
    700,
  );
  const ready = p.providers.length > 0 && (p.content.trim().length > 0 || p.media.length > 0);
  const { data: score, isFetching: scoring } = useQuery({
    queryKey: ['growth-score', scoreInput],
    queryFn: () => api<ScoreResult>('/growth/score', { method: 'POST', body: JSON.parse(scoreInput) }),
    enabled: ready,
    placeholderData: (prev) => prev,
  });
  const tagInput = useDebounced(JSON.stringify({ content: p.content, providers: p.providers }), 900);
  const { data: tags, isFetching: loadingTags } = useQuery({
    queryKey: ['growth-hashtags', tagInput],
    queryFn: () => api<HashtagResult>('/growth/hashtags', { method: 'POST', body: JSON.parse(tagInput) }),
    enabled: tab === 'hashtags' && p.providers.length > 0,
    placeholderData: (prev) => prev,
  });

  const assist = useMutation({
    mutationFn: (task: AiTask) =>
      api<AiResult>('/growth/assist', { method: 'POST', body: { task, content: p.content || undefined, topic: topic || undefined, providers: p.providers } }),
    onSuccess: setAi,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const platform = score?.platforms.find((x) => x.provider === focus) ?? score?.platforms[0];
  const tabBtn = (k: typeof tab, label: string, Icon: typeof Hash) => (
    <button
      onClick={() => setTab(k)}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 transition-all"
      style={{ fontSize: 12, fontWeight: 600, color: tab === k ? C.blue : C.muted, background: tab === k ? '#fff' : 'transparent', boxShadow: tab === k ? '0 1px 2px rgba(15,23,42,0.08)' : 'none' }}
    >
      <Icon size={12} /> {label}
    </button>
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
        <TrendingUp size={15} color={C.violet} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Growth Assistant</span>
        {scoring && <Spinner size={12} />}
      </div>
      <div className="px-4 pt-3">
        <div className="flex gap-1 rounded-xl p-1" style={{ background: '#F1F5F9' }}>
          {tabBtn('score', 'Score', TrendingUp)}
          {tabBtn('hashtags', 'Hashtags', Hash)}
          {tabBtn('ai', 'AI Writer', Sparkles)}
        </div>
      </div>

      {tab === 'score' && (
        <div className="p-4">
          {!ready ? (
            <p style={{ fontSize: 12, color: C.faint }}>Select a platform and start writing. Postly scores your post for reach and engagement as you type.</p>
          ) : !score ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <ScoreRing score={score.overall} />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{score.grade}</p>
                  <p style={{ fontSize: 11.5, color: C.faint }}>Reach & engagement score across {score.platforms.length} platform{score.platforms.length > 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {score.platforms.map((x) => (
                  <button
                    key={x.provider}
                    onClick={() => setFocus(x.provider)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1"
                    style={{ fontSize: 11.5, fontWeight: 700, color: platform?.provider === x.provider ? PLATFORMS[x.provider].color : C.muted, background: platform?.provider === x.provider ? PLATFORMS[x.provider].bg : '#F8FAFC', border: `1px solid ${platform?.provider === x.provider ? PLATFORMS[x.provider].border : C.border2}` }}
                  >
                    <PlatformGlyph provider={x.provider} size={11} /> <span style={{ color: scoreColor(x.score) }}>{x.score}</span>
                  </button>
                ))}
              </div>
              {platform && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {platform.checks.map((c, i) => {
                    const L = LEVEL[c.level];
                    return (
                      <p key={i} className="flex items-start gap-2" style={{ fontSize: 12, color: C.slate, lineHeight: 1.45 }}>
                        <L.icon size={13} color={L.color} className="mt-0.5 flex-shrink-0" /> {c.text}
                      </p>
                    );
                  })}
                  <details className="mt-2">
                    <summary className="cursor-pointer" style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>
                      {platform.label} growth tips
                    </summary>
                    <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
                      {platform.tips.map((t) => (
                        <li key={t} style={{ fontSize: 12, color: C.body }}>{t}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'hashtags' && (
        <div className="p-4">
          {!p.providers.length ? (
            <p style={{ fontSize: 12, color: C.faint }}>Select a platform first.</p>
          ) : !tags ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : (
            <>
              <p style={{ fontSize: 11.5, color: C.faint, marginBottom: 8 }}>
                {tags.limits.map((l) => `${l.label}: ${l.min}–${l.max}`).join(' · ')}
                {tags.niche.length ? ` · Niche: ${tags.niche.join(', ')}` : ''}
                {loadingTags ? ' · updating…' : ''}
              </p>
              {!tags.suggestions.length && <p style={{ fontSize: 12, color: C.faint }}>Write a few words about your post to get suggestions.</p>}
              <div className="flex flex-wrap gap-1.5">
                {tags.suggestions.map((s) => (
                  <button
                    key={s.tag}
                    disabled={p.disabled}
                    title={s.note}
                    onClick={() => p.onAddHashtags([s.tag])}
                    className="rounded-full px-2.5 py-1 transition-all hover:opacity-80 disabled:opacity-50"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: s.source === 'yours' ? C.green : s.source === 'niche' ? C.blue : C.violet,
                      background: s.source === 'yours' ? C.greenSoft : s.source === 'niche' ? C.blueSoft : C.purpleSoft,
                      border: `1px solid ${s.source === 'yours' ? C.greenBorder : s.source === 'niche' ? C.blueBorder : '#E9D5FF'}`,
                    }}
                  >
                    #{s.tag}
                  </button>
                ))}
              </div>
              <p className="mt-3 flex flex-wrap gap-3" style={{ fontSize: 11, color: C.faint }}>
                <span><b style={{ color: C.green }}>●</b> Your top performers</span>
                <span><b style={{ color: C.blue }}>●</b> Popular in your niche</span>
                <span><b style={{ color: C.violet }}>●</b> Long-tail keywords</span>
              </p>
            </>
          )}
        </div>
      )}

      {tab === 'ai' && (
        <div className="p-4">
          {!status?.ai ? (
            <div className="rounded-xl p-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberBorder}` }}>
              <p style={{ fontSize: 12, color: '#92400E' }}>
                The AI Writer is not switched on for this workspace yet. An admin can enable it by adding an AI key on the server (see the setup guide).
              </p>
            </div>
          ) : (
            <>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={300}
                placeholder="Optional: topic, offer or audience (e.g. 'new protein shake for runners')"
                className="mb-3 w-full rounded-xl px-3 py-2 outline-none focus:border-[#2563EB]"
                style={{ fontSize: 12, border: `1px solid ${C.border2}`, background: '#F8FAFC', color: C.ink }}
              />
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ['caption', 'Write captions', Wand2],
                    ['improve', 'Make it viral', TrendingUp],
                    ['hooks', 'Hook ideas', Lightbulb],
                    ['hashtags', 'AI hashtags', Hash],
                    ...(p.providers.includes('YOUTUBE') ? ([['youtube_seo', 'YouTube SEO', Sparkles]] as const) : []),
                    ['ideas', 'Content ideas', Sparkles],
                  ] as const
                ).map(([task, label, Icon]) => (
                  <button
                    key={task}
                    disabled={assist.isPending || p.disabled || !p.providers.length}
                    onClick={() => assist.mutate(task)}
                    className="flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ fontSize: 12, fontWeight: 600, color: C.violet, background: C.purpleSoft, border: '1px solid #E9D5FF' }}
                  >
                    {assist.isPending && assist.variables === task ? <Spinner size={12} color={C.violet} /> : <Icon size={12} />} {label}
                  </button>
                ))}
              </div>
              {ai && <AiResults ai={ai} {...p} />}
              <p className="mt-3" style={{ fontSize: 10.5, color: C.faint }}>AI suggestions can be wrong. Review facts before posting.</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function AiResults({ ai, ...p }: { ai: AiResult } & Props) {
  const box = { background: '#F8FAFC', border: `1px solid ${C.border2}` };
  const use = (label: string, fn: () => void) => (
    <button onClick={fn} disabled={p.disabled} className="rounded-lg px-2 py-0.5 hover:bg-white disabled:opacity-50" style={{ fontSize: 11, fontWeight: 700, color: C.blue, border: `1px solid ${C.blueBorder}` }}>
      {label}
    </button>
  );
  const copy = (t: string) => (
    <button onClick={() => navigator.clipboard.writeText(t).then(() => toast.success('Copied'))} aria-label="Copy" className="rounded-lg p-1 hover:bg-white">
      <Copy size={11} color={C.faint} />
    </button>
  );

  return (
    <div className="mt-3 flex max-h-[420px] flex-col gap-2 overflow-y-auto">
      {(ai.task === 'caption' || ai.task === 'improve') &&
        ai.result.variants.map((v, i) => (
          <div key={i} className="rounded-xl p-3" style={box}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{PLATFORMS[v.provider as Provider]?.label ?? v.provider}</span>
              <span className="flex items-center gap-1">{copy(v.text)}{use('Use this', () => p.onReplaceContent(v.text))}</span>
            </div>
            <p className="whitespace-pre-wrap" style={{ fontSize: 12, color: C.ink, lineHeight: 1.5 }}>{v.text}</p>
            <p className="mt-1" style={{ fontSize: 11, color: C.faint }}>💡 {v.why}</p>
          </div>
        ))}
      {ai.task === 'hooks' &&
        ai.result.hooks.map((h, i) => (
          <div key={i} className="flex items-start justify-between gap-2 rounded-xl p-2.5" style={box}>
            <div>
              <p style={{ fontSize: 12, color: C.ink }}>{h.text}</p>
              <p style={{ fontSize: 10.5, color: C.faint }}>{h.style}</p>
            </div>
            {use('Use', () => p.onReplaceHook(h.text))}
          </div>
        ))}
      {ai.task === 'hashtags' && (
        <div className="rounded-xl p-3" style={box}>
          <div className="mb-2 flex justify-end">{use('Add all', () => p.onAddHashtags(ai.result.hashtags.map((h) => h.tag)))}</div>
          <div className="flex flex-wrap gap-1.5">
            {ai.result.hashtags.map((h) => (
              <button key={h.tag} title={`${h.reach} reach · ${h.reason}`} onClick={() => p.onAddHashtags([h.tag])} className="rounded-full px-2.5 py-1 hover:opacity-80" style={{ fontSize: 12, fontWeight: 600, color: C.violet, background: C.purpleSoft, border: '1px solid #E9D5FF' }}>
                #{h.tag.replace(/^#/, '')}
              </button>
            ))}
          </div>
        </div>
      )}
      {ai.task === 'youtube_seo' && (
        <>
          <div className="rounded-xl p-3" style={box}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 4 }}>Title options</p>
            {ai.result.titles.map((t) => (
              <div key={t} className="flex items-center justify-between gap-2 py-1">
                <span style={{ fontSize: 12, color: C.ink }}>{t} <span style={{ color: C.faint }}>({t.length})</span></span>
                {use('Use', () => p.onYoutube({ title: t }))}
              </div>
            ))}
          </div>
          <div className="rounded-xl p-3" style={box}>
            <div className="mb-1 flex items-center justify-between">
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Description</span>
              <span className="flex items-center gap-1">{copy(ai.result.description)}{use('Use', () => p.onYoutube({ description: ai.result.description }))}</span>
            </div>
            <p className="whitespace-pre-wrap" style={{ fontSize: 12, color: C.ink }}>{ai.result.description}</p>
          </div>
          <div className="rounded-xl p-3" style={box}>
            <div className="mb-1 flex items-center justify-between">
              <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Tags</span>
              {use('Add all', () => p.onYoutube({ tags: ai.result.tags }))}
            </div>
            <p style={{ fontSize: 12, color: C.body }}>{ai.result.tags.join(', ')}</p>
            <p className="mt-2" style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>Thumbnail text ideas</p>
            <p style={{ fontSize: 12, color: C.body }}>{ai.result.thumbnailText.join(' · ')}</p>
          </div>
        </>
      )}
      {ai.task === 'ideas' &&
        ai.result.ideas.map((idea, i) => (
          <div key={i} className="rounded-xl p-3" style={box}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{idea.title}</span>
              {use('Use', () => p.onReplaceContent(`${idea.hook}\n\n${idea.outline}`))}
            </div>
            <p style={{ fontSize: 11, color: C.violet, fontWeight: 600 }}>{idea.format} · {idea.platforms.join(', ')}</p>
            <p className="mt-1" style={{ fontSize: 12, color: C.body }}>{idea.hook}</p>
            <p className="mt-1" style={{ fontSize: 11, color: C.faint }}>💡 {idea.why}</p>
          </div>
        ))}
    </div>
  );
}
