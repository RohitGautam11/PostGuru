'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Btn, ConfirmDialog, SelectMenu } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';
import { useMe } from '@/lib/hooks';
import type { Role } from '@/lib/types';

interface InviteLink {
  url: string | null;
  role: Role;
}

const BORDER = '1px solid #EEF0F4';

/** Settings → Team → "Invite by link": a reusable join link admins can share, rotate or turn off. */
export function InviteByLink() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data, isLoading } = useQuery({ queryKey: ['invite-link'], queryFn: () => api<InviteLink>('/workspace/invite-link') });
  const [role, setRole] = useState<Role | null>(null);
  const [confirm, setConfirm] = useState<'rotate' | 'disable' | null>(null);
  const current = role ?? data?.role ?? 'EDITOR';
  const set = (r: InviteLink) => {
    qc.setQueryData(['invite-link'], r);
    setRole(null);
    setConfirm(null);
  };
  const create = useMutation({
    mutationFn: (nextRole: Role) => api<InviteLink>('/workspace/invite-link', { method: 'POST', body: { role: nextRole } }),
    onSuccess: (r, nextRole) => {
      set(r);
      toast.success(confirm === 'rotate' ? 'New link created — the old link no longer works' : `Anyone with the link joins as ${nextRole.toLowerCase()}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const disable = useMutation({
    mutationFn: () => api<InviteLink>('/workspace/invite-link', { method: 'DELETE' }),
    onSuccess: (r) => {
      set(r);
      toast.success('Invite link turned off');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const copy = () => data?.url && navigator.clipboard.writeText(data.url).then(() => toast.success('Link copied'));
  const roles: { value: Role; label: string }[] = [
    ...(me?.role === 'OWNER' ? [{ value: 'ADMIN' as Role, label: 'Admin' }] : []),
    { value: 'EDITOR', label: 'Editor' },
    { value: 'VIEWER', label: 'Viewer' },
  ];

  return (
    <div className="rounded-2xl bg-white p-6 sm:p-7" style={{ border: BORDER }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 4 }}>Invite by link</h3>
      <p style={{ fontSize: 13, color: C.faint, marginBottom: 20 }}>Share this link to invite teammates to your workspace.</p>
      {isLoading ? (
        <div className="h-11 animate-pulse rounded-xl" style={{ background: C.line }} />
      ) : data?.url ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input readOnly value={data.url} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-xl bg-white px-4 py-2.5" style={{ fontSize: 13, border: `1px solid ${C.border3}`, color: C.muted }} />
            <button onClick={copy} className="rounded-xl px-4 py-2.5 transition-all hover:bg-[#EFF6FF]" style={{ fontSize: 13, fontWeight: 600, color: C.blue, border: `1px solid ${C.blueBorder}`, background: '#fff' }}>
              Copy link
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span style={{ fontSize: 12.5, color: C.muted }}>People who join get</span>
              <SelectMenu className="w-32" value={current} options={roles} disabled={create.isPending} onChange={(r) => r !== data.role && create.mutate(r)} />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setConfirm('rotate')} className="flex items-center gap-1.5 transition-opacity hover:opacity-70" style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>
                <RefreshCw size={12} /> Reset link
              </button>
              <button onClick={() => setConfirm('disable')} className="transition-opacity hover:opacity-70" style={{ fontSize: 13, fontWeight: 600, color: C.red }}>
                Turn off
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center" style={{ background: '#FAFBFD', border: `1px solid ${C.line2}` }}>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Link2 size={15} color={C.faint} />
            <span style={{ fontSize: 13, color: C.muted }}>Invite link is off. Create one to let teammates join as</span>
            <SelectMenu className="w-28" value={current} options={roles} onChange={setRole} />
          </div>
          <Btn onClick={() => create.mutate(current)} loading={create.isPending}>
            Create link
          </Btn>
        </div>
      )}
      <ConfirmDialog
        open={confirm === 'rotate'}
        onClose={() => setConfirm(null)}
        onConfirm={() => create.mutate(data?.role ?? 'EDITOR')}
        loading={create.isPending}
        icon={<RefreshCw size={15} color={C.muted} />}
        title="Reset invite link?"
        description="The current link will stop working immediately. Anyone who hasn't joined yet will need the new link."
        confirmLabel="Reset link"
      />
      <ConfirmDialog
        open={confirm === 'disable'}
        onClose={() => setConfirm(null)}
        onConfirm={() => disable.mutate()}
        loading={disable.isPending}
        danger
        icon={<Link2 size={15} color={C.red} />}
        title="Turn off invite link?"
        description="Nobody will be able to join with the link. You can still invite people by email."
        confirmLabel="Turn off"
      />
    </div>
  );
}
