'use client';

import { ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface Item {
  id: string;
  kind: string;
  title: string;
  message: string;
  status: string;
  votes: number;
  voted: boolean;
  adminNote: string | null;
  createdAt: string;
}

const COLUMNS = [
  { key: 'UNDER_REVIEW', label: 'Under review', statuses: ['NEW', 'UNDER_REVIEW'], color: 'bg-slate-400' },
  { key: 'PLANNED', label: 'Planned', statuses: ['PLANNED'], color: 'bg-blue-500' },
  { key: 'IN_PROGRESS', label: 'In progress', statuses: ['IN_PROGRESS'], color: 'bg-amber-500' },
  { key: 'DONE', label: 'Shipped', statuses: ['DONE'], color: 'bg-green-500' },
];

export function RoadmapBoard({ signedIn }: { signedIn: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      let r = await fetch(signedIn ? '/api/roadmap/me' : '/api/roadmap', { credentials: 'include' });
      if (r.status === 401 && signedIn) {
        // Access token expired: refresh the session once, then fall back to the public list.
        const refreshed = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
        r = await fetch(refreshed.ok ? '/api/roadmap/me' : '/api/roadmap', { credentials: 'include' });
      }
      if (!r.ok) throw new Error();
      setItems(await r.json());
    } catch {
      setError(true);
    }
  }, [signedIn]);

  useEffect(() => {
    load();
  }, [load]);

  async function vote(id: string) {
    if (!signedIn) {
      window.location.href = `/login?next=${encodeURIComponent('/roadmap')}`;
      return;
    }
    setItems((xs) => xs?.map((x) => (x.id === id ? { ...x, voted: !x.voted, votes: x.votes + (x.voted ? -1 : 1) } : x)) ?? null);
    const r = await fetch(`/api/roadmap/${id}/vote`, { method: 'POST', credentials: 'include' });
    if (!r.ok) load();
  }

  if (error) return <p className="mt-10 text-[14px] text-slate-500">The roadmap could not be loaded. Please try again later.</p>;
  if (!items) return <p className="mt-10 text-[14px] text-slate-400">Loading…</p>;

  return (
    <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      {COLUMNS.map((col) => {
        const list = items.filter((i) => col.statuses.includes(i.status));
        return (
          <div key={col.key}>
            <div className="mb-3 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${col.color}`} />
              <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-500">{col.label}</h2>
              <span className="text-[12px] text-slate-400">{list.length}</span>
            </div>
            <div className="flex flex-col gap-3">
              {!list.length && <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-[13px] text-slate-400">Nothing here yet.</p>}
              {list.map((i) => (
                <div key={i.id} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                  <button
                    onClick={() => vote(i.id)}
                    aria-pressed={i.voted}
                    aria-label={`${i.voted ? 'Remove vote for' : 'Upvote'} ${i.title}`}
                    className={`flex h-14 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl border text-[13px] font-bold transition-colors ${
                      i.voted ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ChevronUp size={16} />
                    {i.votes}
                  </button>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold leading-snug text-slate-900">{i.title}</p>
                    <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-slate-500">{i.message}</p>
                    {i.adminNote && <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-600">Team: {i.adminNote}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!signedIn && (
        <p className="text-[13px] text-slate-500 md:col-span-2 lg:col-span-4">
          <Link href="/login?next=/roadmap" className="font-semibold text-blue-600 hover:underline">
            Log in
          </Link>{' '}
          to vote or suggest a feature.
        </p>
      )}
    </div>
  );
}
