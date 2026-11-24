'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Copy, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Card, PageLoader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';

interface Overview {
  users: number;
  newUsers: number;
  workspaces: number;
  accounts: number;
  posts: number;
  published: number;
  openFeedback: number;
  pendingTesters: number;
  pendingDeletions: number;
  accountsByProvider: { provider: string; count: number }[];
}
interface Feedback {
  id: string;
  kind: string;
  title: string;
  message: string;
  page: string | null;
  status: string;
  public: boolean;
  votes: number;
  adminNote: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
}
interface Tester {
  id: string;
  name: string;
  email: string;
  facebook: string | null;
  instagram: string | null;
  gmail: string | null;
  linkedin: string | null;
  x: string | null;
  threads: string | null;
  tiktok: string | null;
  pinterest: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
}
interface Deletion {
  id: string;
  confirmationCode: string;
  source: string;
  email: string | null;
  externalUserId: string | null;
  status: string;
  details: string | null;
  createdAt: string;
}

const STATUSES = ['NEW', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DECLINED'];
const TABS = ['feedback', 'testers', 'deletions'] as const;
const select = { fontSize: 12, border: `1px solid ${C.border2}`, borderRadius: 8, padding: '4px 8px', background: '#fff', color: C.ink } as const;

export default function AdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>('feedback');
  const me = useQuery({ queryKey: ['admin', 'me'], queryFn: () => api<{ admin: boolean }>('/admin/me') });
  const isAdmin = !!me.data?.admin;
  const overview = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<Overview>('/admin/overview'), enabled: isAdmin });
  const feedback = useQuery({ queryKey: ['admin', 'feedback'], queryFn: () => api<Feedback[]>('/admin/feedback'), enabled: isAdmin && tab === 'feedback' });
  const testers = useQuery({ queryKey: ['admin', 'testers'], queryFn: () => api<Tester[]>('/admin/beta-testers'), enabled: isAdmin && tab === 'testers' });
  const deletions = useQuery({ queryKey: ['admin', 'deletions'], queryFn: () => api<Deletion[]>('/admin/deletion-requests'), enabled: isAdmin && tab === 'deletions' });

  const patch = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => api(path, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/feedback/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (me.isLoading) return <PageLoader />;
  if (!isAdmin) {
    return (
      <div className="p-8">
        <p style={{ fontSize: 14, color: C.muted }}>This page is only for the {process.env.NEXT_PUBLIC_APP_NAME || 'PostGuru'} team (ADMIN_EMAILS).</p>
      </div>
    );
  }

  const copyList = (values: (string | null)[], label: string) => {
    const list = values.filter(Boolean).join(', ');
    if (!list) return toast.message(`No ${label} yet`);
    navigator.clipboard.writeText(list).then(() => toast.success(`Copied ${label}`));
  };
  const o = overview.data;

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8" style={{ background: C.page }}>
      <div className="mx-auto flex max-w-[1300px] flex-col gap-6">
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} color={C.blue} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em' }}>Admin console</h1>
        </div>

        {o && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {[
              ['Users', o.users],
              ['New this week', o.newUsers],
              ['Workspaces', o.workspaces],
              ['Connected accounts', o.accounts],
              ['Posts', o.posts],
              ['Published', o.published],
              ['New feedback', o.openFeedback],
              ['Testers to add', o.pendingTesters],
            ].map(([l, v]) => (
              <Card key={l as string} className="p-4">
                <p style={{ fontSize: 22, fontWeight: 800, color: C.ink }}>{v}</p>
                <p style={{ fontSize: 12, color: C.faint }}>{l}</p>
              </Card>
            ))}
          </div>
        )}
        {o && o.accountsByProvider.length > 0 && (
          <p style={{ fontSize: 12.5, color: C.muted }}>Accounts by platform: {o.accountsByProvider.map((p) => `${p.provider} ${p.count}`).join(' · ')}</p>
        )}

        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="rounded-xl px-4 py-2 transition-colors"
              style={{ fontSize: 13, fontWeight: 600, color: tab === t ? '#fff' : C.muted, background: tab === t ? C.ink : '#fff', border: `1px solid ${C.border2}` }}
            >
              {t === 'feedback' ? 'Feedback' : t === 'testers' ? 'Beta testers' : `Deletion requests${o?.pendingDeletions ? ` (${o.pendingDeletions})` : ''}`}
            </button>
          ))}
        </div>

        {tab === 'feedback' && (
          <Card className="overflow-x-auto">
            {!feedback.data ? (
              <PageLoader />
            ) : !feedback.data.length ? (
              <p className="p-6" style={{ fontSize: 13, color: C.faint }}>No feedback yet.</p>
            ) : (
              feedback.data.map((f) => (
                <div key={f.id} className="flex flex-col gap-2 p-5" style={{ borderBottom: `1px solid ${C.line}` }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: C.blue, background: C.blueSoft, padding: '2px 8px', borderRadius: 999 }}>{f.kind}</span>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{f.title}</p>
                    <span style={{ fontSize: 12, color: C.faint }}>
                      · {f.votes} vote{f.votes === 1 ? '' : 's'} · {f.userName} &lt;{f.userEmail}&gt; · {format(new Date(f.createdAt), 'MMM d, HH:mm')}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: C.body, whiteSpace: 'pre-wrap' }}>{f.message}</p>
                  {f.page && <p style={{ fontSize: 11.5, color: C.faint }}>{f.page}</p>}
                  <div className="flex flex-wrap items-center gap-3">
                    <select value={f.status} onChange={(e) => patch.mutate({ path: `/admin/feedback/${f.id}`, body: { status: e.target.value } })} style={select} aria-label="Status">
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5" style={{ fontSize: 12, color: C.muted }}>
                      <input type="checkbox" checked={f.public} onChange={(e) => patch.mutate({ path: `/admin/feedback/${f.id}`, body: { public: e.target.checked } })} /> On public roadmap
                    </label>
                    <input
                      defaultValue={f.adminNote ?? ''}
                      onBlur={(e) => e.target.value !== (f.adminNote ?? '') && patch.mutate({ path: `/admin/feedback/${f.id}`, body: { adminNote: e.target.value } })}
                      placeholder="Public team note"
                      style={{ ...select, minWidth: 220 }}
                    />
                    <button onClick={() => remove.mutate(f.id)} title="Delete" className="transition-opacity hover:opacity-70">
                      <Trash2 size={14} color={C.red} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </Card>
        )}

        {tab === 'testers' && (
          <Card className="overflow-x-auto">
            <div className="flex flex-wrap gap-2 p-4" style={{ borderBottom: `1px solid ${C.line}` }}>
              {(
                [
                  ['gmail', 'Gmails (Google test users)'],
                  ['facebook', 'Facebook profiles (Meta testers)'],
                  ['instagram', 'Instagram handles'],
                  ['tiktok', 'TikTok users'],
                  ['pinterest', 'Pinterest users'],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => copyList((testers.data ?? []).filter((t) => t.status === 'REQUESTED').map((t) => t[k]), l)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors hover:bg-[#F8FAFC]"
                  style={{ fontSize: 12, fontWeight: 600, color: C.slate, border: `1px solid ${C.border2}` }}
                >
                  <Copy size={12} /> Copy new {l}
                </button>
              ))}
            </div>
            {!testers.data ? (
              <PageLoader />
            ) : (
              <table className="w-full" style={{ fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: C.faint, textAlign: 'left' }}>
                    {['Tester', 'Facebook', 'Instagram', 'Gmail', 'LinkedIn', 'X', 'Threads', 'TikTok', 'Pinterest', 'Status'].map((h) => (
                      <th key={h} className="px-3 py-2.5" style={{ fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {testers.data.map((t) => (
                    <tr key={t.id} style={{ borderTop: `1px solid ${C.line}`, color: C.body }}>
                      <td className="px-3 py-2.5">
                        <b style={{ color: C.ink }}>{t.name}</b>
                        <br />
                        {t.email}
                        {t.notes && <div style={{ color: C.faint }}>{t.notes}</div>}
                      </td>
                      {[t.facebook, t.instagram, t.gmail, t.linkedin, t.x, t.threads, t.tiktok, t.pinterest].map((v, i) => (
                        <td key={i} className="max-w-[160px] truncate px-3 py-2.5" title={v ?? ''}>
                          {v ?? '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2.5">
                        <select value={t.status} onChange={(e) => patch.mutate({ path: `/admin/beta-testers/${t.id}`, body: { status: e.target.value } })} style={select} aria-label="Tester status">
                          <option>REQUESTED</option>
                          <option>ADDED</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}

        {tab === 'deletions' && (
          <Card className="overflow-x-auto">
            {!deletions.data ? (
              <PageLoader />
            ) : !deletions.data.length ? (
              <p className="p-6" style={{ fontSize: 13, color: C.faint }}>No deletion requests.</p>
            ) : (
              deletions.data.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 p-5" style={{ borderBottom: `1px solid ${C.line}` }}>
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                      {d.confirmationCode} · {d.source === 'meta' ? `Meta user ${d.externalUserId ?? ''}` : d.email}
                    </p>
                    <p style={{ fontSize: 12, color: C.faint }}>
                      {format(new Date(d.createdAt), 'MMM d, yyyy HH:mm')} {d.details ? `· ${d.details}` : ''}
                    </p>
                  </div>
                  <select value={d.status} onChange={(e) => patch.mutate({ path: `/admin/deletion-requests/${d.id}`, body: { status: e.target.value } })} style={select} aria-label="Deletion status">
                    <option>PENDING</option>
                    <option>COMPLETED</option>
                    <option>REJECTED</option>
                  </select>
                </div>
              ))
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
