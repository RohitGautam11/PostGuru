'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Clock, FlaskConical } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Btn, Card, FieldLabel, PageLoader, TextInput } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';

interface BetaTester {
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
}

const FIELDS: { key: keyof Omit<BetaTester, 'status' | 'notes'>; label: string; placeholder: string; why: string }[] = [
  { key: 'facebook', label: 'Facebook profile URL', placeholder: 'https://facebook.com/your.profile', why: 'Facebook, Instagram (via Page) and Threads: added under Meta App Roles → Testers.' },
  { key: 'instagram', label: 'Instagram username', placeholder: '@yourhandle', why: 'Instagram creator login: added as an Instagram tester.' },
  { key: 'gmail', label: 'Google account (Gmail) for YouTube', placeholder: 'you@gmail.com', why: 'YouTube: added to the OAuth consent screen test users (max 100).' },
  { key: 'linkedin', label: 'LinkedIn profile URL', placeholder: 'https://linkedin.com/in/you', why: 'Personal posting works for everyone; Company Pages need you to be a Page admin.' },
  { key: 'x', label: 'X (Twitter) handle', placeholder: '@you', why: 'Works without approval on our developer tier.' },
  { key: 'threads', label: 'Threads username', placeholder: '@you', why: 'Added as a Threads Tester in the Meta app.' },
  { key: 'tiktok', label: 'TikTok username', placeholder: '@you', why: 'Added as a sandbox target user (max 5 during the beta).' },
  { key: 'pinterest', label: 'Pinterest username', placeholder: 'you', why: 'Added to the Pinterest trial-access users (max 10).' },
];

const STATUS: Record<string, { label: string; text: string; icon: typeof Clock; color: string; bg: string }> = {
  REQUESTED: { label: 'Requested', text: 'We will add you as a tester and email you, usually within a day.', icon: Clock, color: C.amber, bg: C.amberSoft },
  ADDED: { label: 'Added', text: 'You are set up. Accept the tester invitations (see below), then connect your accounts.', icon: CircleCheck, color: C.green, bg: C.greenSoft },
};

export default function BetaPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['beta-tester'], queryFn: () => api<BetaTester | null>('/beta-tester') });
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setForm(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : ''])));
  }, [data]);
  const save = useMutation({
    mutationFn: () => api<BetaTester>('/beta-tester', { method: 'PUT', body: Object.fromEntries([...FIELDS.map((f) => f.key), 'notes'].map((k) => [k, form[k] ?? ''])) }),
    onSuccess: () => {
      toast.success('Saved. We will add you as a tester and let you know.');
      qc.invalidateQueries({ queryKey: ['beta-tester'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (isLoading) return <PageLoader />;
  const st = data ? (STATUS[data.status] ?? STATUS.REQUESTED) : null;

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8" style={{ background: C.page }}>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-start gap-3">
          <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 42, height: 42, background: C.purpleSoft }}>
            <FlaskConical size={20} color={C.purple} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em' }}>Beta Program</h1>
            <p style={{ fontSize: 13.5, color: C.muted, marginTop: 4, lineHeight: 1.6 }}>
              Thanks for testing! While our apps wait for Meta, Google and TikTok review, those platforms only let people we add as testers connect their accounts. Tell us
              which accounts you want to connect and we will add you.
            </p>
          </div>
        </div>

        {st && (
          <div className="flex items-start gap-3 rounded-2xl p-4" style={{ background: st.bg }}>
            <st.icon size={18} color={st.color} className="mt-0.5 flex-shrink-0" />
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>Status: {st.label}</p>
              <p style={{ fontSize: 12.5, color: C.slate, marginTop: 2 }}>{st.text}</p>
            </div>
          </div>
        )}

        <Card className="p-6">
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            {FIELDS.map((f) => (
              <div key={f.key}>
                <FieldLabel>{f.label}</FieldLabel>
                <TextInput value={form[f.key] ?? ''} onChange={(e) => setForm((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.placeholder} maxLength={200} />
                <p style={{ fontSize: 11.5, color: C.faint, marginTop: 5 }}>{f.why}</p>
              </div>
            ))}
            <div>
              <FieldLabel>Anything else?</FieldLabel>
              <TextInput value={form.notes ?? ''} onChange={(e) => setForm((x) => ({ ...x, notes: e.target.value }))} placeholder="e.g. I manage a brand page and a personal creator profile" maxLength={1000} />
            </div>
            <div>
              <Btn type="submit" loading={save.isPending}>
                {data ? 'Update my tester details' : 'Request tester access'}
              </Btn>
            </div>
          </form>
        </Card>

        <Card className="p-6">
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>After we add you</h2>
          <ul className="mt-3 flex flex-col gap-2.5" style={{ fontSize: 13, color: C.body, lineHeight: 1.6 }}>
            <li>
              <b>Facebook / Instagram / Threads:</b> accept the invite at <b>developers.facebook.com → Requests</b> (Facebook) or Instagram <b>Settings → Website permissions → Tester invites</b>.
            </li>
            <li>
              <b>YouTube:</b> nothing to accept; Google may show an &quot;unverified app&quot; screen. Click <b>Advanced → Continue</b>.
            </li>
            <li>
              <b>TikTok:</b> during testing, posts are published as private (&quot;Only me&quot;) until TikTok approves the app.
            </li>
            <li>
              <b>LinkedIn and X:</b> work right away, no invitation needed.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
