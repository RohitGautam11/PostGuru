'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, Modal, Toggle } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';

interface Prefs {
  prefs: Record<string, { email: boolean; push: boolean }>;
  emailEnabled: boolean;
}

/** Analytics → Export → Schedule report: the Monday summary email, plus an on-demand copy. */
export function ScheduleReportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notification-prefs'], queryFn: () => api<Prefs>('/users/me/notifications'), enabled: open });
  const weekly = data?.prefs.weeklyReport;
  const save = useMutation({
    mutationFn: (email: boolean) => api<Prefs>('/users/me/notifications', { method: 'PATCH', body: { prefs: { weeklyReport: { email } } } }),
    onSuccess: (r, email) => {
      qc.setQueryData(['notification-prefs'], r);
      toast.success(email ? 'Weekly report scheduled for Monday mornings' : 'Weekly report email turned off');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const sendNow = useMutation({
    mutationFn: () => api<{ sent: boolean; email: string; emailEnabled: boolean }>('/analytics/weekly-report/send', { method: 'POST' }),
    onSuccess: (r) => (r.sent ? toast.success(`Report sent to ${r.email}`) : toast.warning(r.emailEnabled ? 'The email could not be sent. Try again later.' : 'Email delivery is not configured on this server yet.')),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal open={open} onClose={onClose} width={440}>
      <div style={{ padding: 24 }}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: C.blueSoft }}>
            <CalendarClock size={16} color={C.blue} />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>Schedule report</h2>
            <p style={{ fontSize: 12.5, color: C.faint, marginTop: 2 }}>Get a performance summary in your inbox.</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl px-4 py-3.5" style={{ background: '#FAFBFD', border: `1px solid ${C.line2}` }}>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>Weekly report email</p>
            <p style={{ fontSize: 12.5, color: C.faint, marginTop: 2 }}>Every Monday · last 7 days · all platforms</p>
          </div>
          <Toggle value={!!weekly?.email} disabled={!data || save.isPending} onChange={(v) => save.mutate(v)} />
        </div>
        {data && !data.emailEnabled && (
          <p style={{ fontSize: 12.5, color: C.amber, marginTop: 10, lineHeight: 1.5 }}>Email delivery isn&apos;t configured on this server yet, so reports are saved but not sent.</p>
        )}
        <p style={{ fontSize: 12.5, color: C.faint, marginTop: 12, lineHeight: 1.55 }}>
          Includes posts published, impressions, interactions, follower growth, inbox volume and failed posts. Manage all alerts in Settings → Notifications.
        </p>
        <div className="mt-6 flex flex-wrap justify-between gap-2.5">
          <Btn variant="outline" onClick={() => sendNow.mutate()} loading={sendNow.isPending}>
            <Mail size={13} /> Email me this week&apos;s report
          </Btn>
          <Btn onClick={onClose}>Done</Btn>
        </div>
      </div>
    </Modal>
  );
}
