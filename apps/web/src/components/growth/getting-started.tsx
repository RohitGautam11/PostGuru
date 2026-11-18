'use client';

import { useQuery } from '@tanstack/react-query';
import { CircleCheck, Circle, Rocket, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { C } from '@/lib/design';
import { useDashboard } from '@/lib/hooks';

const KEY = 'postly-getting-started-dismissed';

/** Onboarding checklist computed from real workspace data. */
export function GettingStarted({ dismissible = false }: { dismissible?: boolean }) {
  const { data: dash } = useDashboard();
  const { data: team } = useQuery({ queryKey: ['members'], queryFn: () => api<{ members: unknown[]; invitations: unknown[] }>('/workspace/members'), staleTime: 60_000 });
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(dismissible && localStorage.getItem(KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, [dismissible]);

  if (!dash || hidden) return null;
  const steps = [
    { done: dash.stats.accounts > 0, title: 'Connect your first social account', text: 'Facebook, Instagram, X, LinkedIn, YouTube, Threads, TikTok or Pinterest.', href: '/connect', cta: 'Connect' },
    { done: dash.postCounts.all > 0, title: 'Create your first post', text: 'Write once, tailor per platform and check the Growth Score.', href: '/composer', cta: 'Create post' },
    { done: dash.postCounts.scheduled + dash.postCounts.published > 0, title: 'Schedule or publish a post', text: 'Use "Best time" to publish when your audience is online.', href: '/planner', cta: 'Open planner' },
    { done: (team?.members.length ?? 1) + (team?.invitations.length ?? 0) > 1, title: 'Invite your team', text: 'Editors create posts, viewers (clients) can only watch.', href: '/settings?tab=team', cta: 'Invite' },
    { done: dash.postCounts.published > 0, title: 'Review your Growth Hub', text: 'See what works and get a personal growth plan.', href: '/growth', cta: 'Open' },
  ];
  const done = steps.filter((s) => s.done).length;
  if (dismissible && done === steps.length) return null;

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: C.purpleSoft }}>
          <Rocket size={17} color={C.violet} />
        </div>
        <div className="flex-1">
          <p style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Get started with Postly</p>
          <p style={{ fontSize: 12, color: C.faint }}>{done} of {steps.length} done · about 10 minutes</p>
          <div className="mt-2 h-1.5 rounded-full" style={{ background: '#F1F5F9' }}>
            <div className="h-1.5 rounded-full" style={{ width: `${(done / steps.length) * 100}%`, background: C.violet }} />
          </div>
        </div>
        {dismissible && (
          <button
            aria-label="Hide checklist"
            onClick={() => {
              setHidden(true);
              try {
                localStorage.setItem(KEY, '1');
              } catch {
                /* ignore */
              }
            }}
            className="rounded-lg p-1 hover:bg-[#F8FAFC]"
          >
            <X size={14} color={C.faint} />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {steps.map((s) => (
          <div key={s.title} className="flex items-center gap-3 rounded-xl px-2 py-2">
            {s.done ? <CircleCheck size={17} color={C.green} /> : <Circle size={17} color={C.ghost} />}
            <div className="min-w-0 flex-1">
              <p style={{ fontSize: 13, fontWeight: 600, color: s.done ? C.faint : C.ink, textDecoration: s.done ? 'line-through' : 'none' }}>{s.title}</p>
              {!s.done && <p style={{ fontSize: 12, color: C.faint }}>{s.text}</p>}
            </div>
            {!s.done && (
              <Link href={s.href} className="rounded-lg px-3 py-1.5" style={{ fontSize: 12, fontWeight: 600, color: C.blue, border: `1px solid ${C.blueBorder}` }}>
                {s.cta}
              </Link>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
