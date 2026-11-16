'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { Bell, Check, ChevronRight, Copy, CreditCard, Link2, LogOut, Plus, Shield, Trash2, Upload, User, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiAccess } from '@/components/settings/api-keys';
import { InviteByLink } from '@/components/settings/invite-link';
import { TwoFactorRow } from '@/components/settings/two-factor';
import { Btn, Card, ConfirmDialog, FieldLabel, GradientAvatar, Modal, PageLoader, SelectMenu, TextInput, Toggle } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C, CARD_SHADOW, colorFor } from '@/lib/design';
import { useCan, useIntegrations, useMe } from '@/lib/hooks';
import { PLATFORMS, PlatformBadge } from '@/lib/platforms';
import type { Plan, Role } from '@/lib/types';
import { uploadFile } from '@/lib/upload';
import { initials } from '@/lib/utils';

const BORDER = '1px solid #EEF0F4';
const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'team', label: 'Team & Members', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'integrations', label: 'API & Integrations', icon: Link2 },
] as const;
type TabId = (typeof TABS)[number]['id'];

const h3 = { fontSize: 16, fontWeight: 700, color: C.ink } as const;
const sub = { fontSize: 13, color: C.faint } as const;

function offsetLabel(tz: string) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
    return `${tz.replace(/_/g, ' ')} — ${part?.value.replace('GMT', 'UTC') ?? ''}`;
  } catch {
    return tz;
  }
}

// ─── Profile ────────────────────────────────────────────────────────────────
function ProfileTab() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const fileRef = useRef<HTMLInputElement>(null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [tz, setTz] = useState('UTC');
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState('');

  useEffect(() => {
    if (!me) return;
    const [f, ...rest] = me.user.name.split(' ');
    setFirst(f ?? '');
    setLast(rest.join(' '));
    setJobTitle(me.user.jobTitle ?? '');
    setTz(me.user.timezone);
  }, [me]);

  const zones = useMemo(() => {
    let list: string[] = [];
    try {
      list = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
    } catch {
      list = ['UTC'];
    }
    if (!list.includes('UTC')) list.unshift('UTC');
    return list.map((z) => ({ value: z, label: offsetLabel(z) }));
  }, []);

  const save = useMutation({
    mutationFn: () => api('/users/me', { method: 'PATCH', body: { name: `${first} ${last}`.trim(), timezone: tz, jobTitle: jobTitle.trim() } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const changePw = useMutation({
    mutationFn: () => api('/users/me/password', { method: 'POST', body: { currentPassword: pw.current, newPassword: pw.next } }),
    onSuccess: () => {
      toast.success('Password updated');
      setPwOpen(false);
      setPw({ current: '', next: '', confirm: '' });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: () => api('/users/me/sessions/revoke', { method: 'POST' }),
    onSuccess: () => (window.location.href = '/login'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api('/users/me/delete', { method: 'POST', body: { password: deletePw } }),
    onSuccess: () => (window.location.href = '/signup'),
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function changePhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image');
    setUploading(true);
    try {
      const asset = await uploadFile(file);
      await api('/users/me', { method: 'PATCH', body: { avatarUrl: asset.url } });
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Photo updated');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  if (!me) return null;
  const nameOk = `${first} ${last}`.trim().length >= 2;
  const input = 'w-full rounded-xl bg-white px-4 py-2.5 outline-none transition-shadow focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.09)]';
  const inputStyle = { fontSize: 13, border: `1px solid ${C.border3}`, color: C.ink };

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6 sm:p-7">
        <h3 style={{ ...h3, marginBottom: 24 }}>Personal Information</h3>
        <div className="mb-7 flex items-center gap-5">
          <div className="relative">
            <GradientAvatar name={me.user.name} src={me.user.avatarUrl} size={72} rounded="2xl" />
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 flex items-center justify-center rounded-full bg-white"
              style={{ width: 26, height: 26, border: '2px solid #EEF0F4', boxShadow: CARD_SHADOW }}
              aria-label="Upload photo"
            >
              <Upload size={11} color={C.muted} />
            </button>
            <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { changePhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{me.user.name}</p>
            <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>
              {me.role.charAt(0) + me.role.slice(1).toLowerCase()} · {me.workspace.name}
            </p>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ fontSize: 13, fontWeight: 600, color: C.blue, marginTop: 6 }} className="transition-opacity hover:opacity-70">
              {uploading ? 'Uploading…' : 'Change photo'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel>First name</FieldLabel>
            <input value={first} onChange={(e) => setFirst(e.target.value)} className={input} style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Last name</FieldLabel>
            <input value={last} onChange={(e) => setLast(e.target.value)} className={input} style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Email address</FieldLabel>
            <input value={me.user.email} readOnly className={input} style={{ ...inputStyle, color: C.muted, background: '#FAFBFD' }} />
          </div>
          <div>
            <FieldLabel>Job title</FieldLabel>
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Marketing Manager" maxLength={80} className={input} style={inputStyle} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Timezone</FieldLabel>
            <SelectMenu value={tz} onChange={setTz} options={zones} />
          </div>
        </div>
        <div className="mt-7 flex justify-end">
          <button
            onClick={() => save.mutate()}
            disabled={!nameOk || save.isPending}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: saved ? C.green : C.blue }}
          >
            {saved ? (
              <>
                <Check size={14} /> Saved!
              </>
            ) : save.isPending ? (
              'Saving…'
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </Card>

      <div className="rounded-2xl bg-white p-6 sm:p-7" style={{ border: BORDER }}>
        <h3 style={{ ...h3, marginBottom: 4 }}>Password & Security</h3>
        <p style={{ ...sub, marginBottom: 20 }}>Manage your password and two-factor authentication</p>
        <div className="flex flex-wrap items-center justify-between gap-3 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Password</p>
            <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>
              {me.user.passwordChangedAt ? `Last changed ${formatDistanceToNowStrict(new Date(me.user.passwordChangedAt))} ago` : `Set ${formatDistanceToNowStrict(new Date(me.user.createdAt))} ago`}
            </p>
          </div>
          <Btn variant="outline" onClick={() => setPwOpen(true)}>
            Change
          </Btn>
        </div>
        <TwoFactorRow />
        <div className="flex flex-wrap items-center justify-between gap-3 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-3">
            <LogOut size={16} color={C.faint} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Active sessions</p>
              <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>Sign out of every browser and device you&apos;ve used</p>
            </div>
          </div>
          <Btn variant="outline" onClick={() => setRevokeOpen(true)}>
            Sign out everywhere
          </Btn>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.red }}>Delete account</p>
            <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>Permanently delete your account and workspaces you solely own</p>
          </div>
          <Btn variant="dangerSoft" onClick={() => setDeleteOpen(true)}>
            Delete
          </Btn>
        </div>
      </div>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} width={420}>
        <form
          style={{ padding: 24 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (pw.next !== pw.confirm) return toast.error('Passwords do not match');
            changePw.mutate();
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>Change password</h2>
          <p style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>At least 8 characters, with a letter and a number.</p>
          <div className="mt-5 flex flex-col gap-4">
            <div>
              <FieldLabel>Current password</FieldLabel>
              <TextInput type="password" autoComplete="current-password" required value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
            </div>
            <div>
              <FieldLabel>New password</FieldLabel>
              <TextInput type="password" autoComplete="new-password" minLength={8} required value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </div>
            <div>
              <FieldLabel>Confirm new password</FieldLabel>
              <TextInput type="password" autoComplete="new-password" minLength={8} required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2.5">
            <Btn type="button" variant="outline" onClick={() => setPwOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" loading={changePw.isPending}>
              Update password
            </Btn>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        onConfirm={() => revoke.mutate()}
        loading={revoke.isPending}
        icon={<LogOut size={15} color={C.muted} />}
        title="Sign out everywhere?"
        description="You'll be signed out of every device, including this one."
        confirmLabel="Sign out"
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => del.mutate()}
        loading={del.isPending}
        danger
        icon={<Trash2 size={15} color={C.red} />}
        title="Delete your account?"
        description="This cannot be undone. Enter your password to confirm."
        confirmLabel="Delete forever"
      >
        <div className="mt-4" style={{ paddingLeft: 48 }}>
          <TextInput type="password" placeholder="Password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} />
        </div>
      </ConfirmDialog>
    </div>
  );
}

// ─── Team ───────────────────────────────────────────────────────────────────
interface Members {
  members: { id: string; role: Role; user: { id: string; name: string; email: string; avatarUrl: string | null } }[];
  invitations: { id: string; email: string; role: Role; expiresAt: string }[];
}
const ROLE_OPTS: { value: Role; label: string }[] = [
  { value: 'OWNER', label: 'Owner' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Viewer' },
];

function TeamTab() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const isAdmin = useCan('ADMIN');
  const { data } = useQuery({ queryKey: ['members'], queryFn: () => api<Members>('/workspace/members') });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState<{ email: string; role: Role }>({ email: '', role: 'EDITOR' });
  const [link, setLink] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<Members['members'][number] | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['members'] });
  const onError = (e: unknown) => toast.error(errorMessage(e));

  const send = useMutation({
    mutationFn: () => api<{ inviteUrl: string }>('/workspace/invitations', { method: 'POST', body: invite }),
    onSuccess: (r) => {
      setLink(r.inviteUrl);
      refresh();
    },
    onError,
  });
  const revokeInvite = useMutation({ mutationFn: (id: string) => api(`/workspace/invitations/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError });
  const setRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api(`/workspace/members/${id}`, { method: 'PATCH', body: { role } }),
    onSuccess: () => {
      toast.success('Role updated');
      refresh();
    },
    onError: (e) => {
      onError(e);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspace/members/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      if (toRemove?.user.id === me?.user.id) window.location.href = '/login';
      else {
        toast.success('Member removed');
        setToRemove(null);
        refresh();
      }
    },
    onError,
  });

  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success('Link copied'));

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 sm:px-7">
          <div>
            <h3 style={h3}>Team Members</h3>
            <p style={{ ...sub, marginTop: 4 }}>
              {data?.members.length ?? 0} member{data?.members.length === 1 ? '' : 's'} · {me?.workspace.plan.charAt(0)}
              {me?.workspace.plan.slice(1).toLowerCase()} plan
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                setLink(null);
                setInvite({ email: '', role: 'EDITOR' });
                setInviteOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 transition-all hover:opacity-90"
              style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: C.blue }}
            >
              <Plus size={14} strokeWidth={2.5} /> Invite member
            </button>
          )}
        </div>
        <div style={{ borderTop: `1px solid ${C.line}` }}>
          {data?.members.map((m, i) => {
            const you = m.user.id === me?.user.id;
            const color = colorFor(m.user.id);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-4 px-6 py-4 transition-colors hover:bg-[#FAFBFD] sm:flex-nowrap sm:px-7" style={{ borderBottom: i < data.members.length - 1 ? `1px solid ${C.line}` : 'none' }}>
                {m.user.avatarUrl ? (
                  <img src={m.user.avatarUrl} alt="" className="flex-shrink-0 rounded-full object-cover" style={{ width: 40, height: 40 }} referrerPolicy="no-referrer" />
                ) : (
                  <div className="flex flex-shrink-0 items-center justify-center rounded-full" style={{ width: 40, height: 40, background: `${color}15` }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color }}>{initials(m.user.name)}</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
                      {m.user.name}
                    </p>
                    {you && <span style={{ fontSize: 10, fontWeight: 700, color: C.blue, background: C.blueSoft, padding: '2px 8px', borderRadius: 999 }}>You</span>}
                  </div>
                  <p className="truncate" style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>
                    {m.user.email}
                  </p>
                </div>
                <SelectMenu
                  className="w-32"
                  value={m.role}
                  disabled={!isAdmin || you}
                  onChange={(role) => setRole.mutate({ id: m.id, role })}
                  options={ROLE_OPTS.filter((o) => o.value !== 'OWNER' || me?.role === 'OWNER' || m.role === 'OWNER')}
                />
                {(isAdmin || you) && (
                  <button onClick={() => setToRemove(m)} className="flex items-center justify-center rounded-xl transition-colors hover:bg-[#FEF2F2]" style={{ width: 36, height: 36 }} title={you ? 'Leave workspace' : 'Remove member'}>
                    {you ? <LogOut size={14} color={C.red} /> : <Trash2 size={14} color={C.red} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {isAdmin && <InviteByLink />}

      <div className="rounded-2xl bg-white p-6 sm:p-7" style={{ border: BORDER }}>
        <h3 style={{ ...h3, marginBottom: 4 }}>Pending invitations</h3>
        <p style={{ ...sub, marginBottom: 20 }}>Email invitations are single-use and expire after 7 days.</p>
        {!data?.invitations.length ? (
          <p style={{ fontSize: 13, color: C.ghost }}>No pending invitations.</p>
        ) : (
          data.invitations.map((inv, i) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3" style={{ borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{inv.email}</p>
                <p style={{ fontSize: 12.5, color: C.faint, marginTop: 2 }}>
                  {inv.role.charAt(0) + inv.role.slice(1).toLowerCase()} · expires {format(new Date(inv.expiresAt), 'MMM d')}
                </p>
              </div>
              {isAdmin && (
                <button onClick={() => revokeInvite.mutate(inv.id)} style={{ fontSize: 13, fontWeight: 600, color: C.red }} className="transition-opacity hover:opacity-70">
                  Revoke
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} width={440}>
        <div style={{ padding: 24 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>Invite a team member</h2>
          <p style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>They&apos;ll get a secure link to join {me?.workspace.name}.</p>
          {link ? (
            <div className="mt-5">
              <p style={{ fontSize: 13, color: C.body }}>
                Share this link with <b>{invite.email}</b>. It&apos;s shown only once.
              </p>
              <div className="mt-3 flex gap-2">
                <input readOnly value={link} onFocus={(e) => e.target.select()} className="flex-1 rounded-xl bg-white px-4 py-2.5" style={{ fontSize: 13, border: `1px solid ${C.border3}`, color: C.muted }} />
                <button onClick={() => copy(link)} className="rounded-xl px-4 py-2.5 transition-all hover:bg-[#EFF6FF]" style={{ fontSize: 13, fontWeight: 600, color: C.blue, border: `1px solid ${C.blueBorder}`, background: '#fff' }}>
                  Copy link
                </button>
              </div>
              <div className="mt-6 flex justify-end">
                <Btn onClick={() => setInviteOpen(false)}>Done</Btn>
              </div>
            </div>
          ) : (
            <form
              className="mt-5 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <div>
                <FieldLabel>Email</FieldLabel>
                <TextInput type="email" required placeholder="teammate@company.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Role</FieldLabel>
                <SelectMenu value={invite.role} onChange={(role) => setInvite({ ...invite, role })} options={ROLE_OPTS.filter((o) => o.value !== 'OWNER' || me?.role === 'OWNER')} />
              </div>
              <div className="mt-2 flex justify-end gap-2.5">
                <Btn type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Btn>
                <Btn type="submit" loading={send.isPending} disabled={!invite.email}>
                  Create invite link
                </Btn>
              </div>
            </form>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={!!toRemove}
        onClose={() => setToRemove(null)}
        onConfirm={() => toRemove && remove.mutate(toRemove.id)}
        loading={remove.isPending}
        danger
        icon={<Trash2 size={15} color={C.red} />}
        title={toRemove?.user.id === me?.user.id ? 'Leave workspace?' : `Remove ${toRemove?.user.name}?`}
        description="They will immediately lose access to this workspace."
        confirmLabel={toRemove?.user.id === me?.user.id ? 'Leave' : 'Remove'}
      />
    </div>
  );
}

// ─── Notifications ──────────────────────────────────────────────────────────
const NOTIFS = [
  { id: 'publishSuccess', label: 'Post published', description: 'When a scheduled post goes live' },
  { id: 'publishFailure', label: 'Post failed', description: 'When a post fails to publish' },
  { id: 'newMessages', label: 'New inbox message', description: 'Comments and DMs' },
  { id: 'accountIssues', label: 'Token expiring', description: '7 days before token expires, and when it expires' },
  { id: 'teamActivity', label: 'Team activity', description: 'New member joins workspace' },
  { id: 'weeklyReport', label: 'Weekly report', description: 'Analytics summary every Monday' },
] as const;
type NotifId = (typeof NOTIFS)[number]['id'];
type Channel = 'email' | 'push';
interface NotifPrefs {
  prefs: Record<NotifId, Record<Channel, boolean>>;
  emailEnabled: boolean;
}

function NotificationsTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['notification-prefs'], queryFn: () => api<NotifPrefs>('/users/me/notifications') });
  const [desktop, setDesktop] = useState<NotificationPermission | 'unsupported'>('default');
  useEffect(() => setDesktop(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission), []);
  const save = useMutation({
    mutationFn: (patch: Partial<Record<NotifId, Partial<Record<Channel, boolean>>>>) => api<NotifPrefs>('/users/me/notifications', { method: 'PATCH', body: { prefs: patch } }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['notification-prefs'] });
      const prev = qc.getQueryData<NotifPrefs>(['notification-prefs']);
      if (prev) {
        const next = structuredClone(prev);
        for (const [k, v] of Object.entries(patch)) Object.assign(next.prefs[k as NotifId], v);
        qc.setQueryData(['notification-prefs'], next);
      }
      return { prev };
    },
    onSuccess: (r) => qc.setQueryData(['notification-prefs'], r),
    onError: (e, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notification-prefs'], ctx.prev);
      toast.error(errorMessage(e));
    },
  });
  const enableDesktop = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setDesktop(p);
    if (p === 'granted') toast.success('Desktop notifications turned on');
    else if (p === 'denied') toast.error('Notifications are blocked in your browser settings');
  };

  if (!data) return <PageLoader />;
  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <div className="px-6 py-5 sm:px-7">
          <h3 style={h3}>Notification preferences</h3>
          <p style={{ ...sub, marginTop: 4 }}>Choose how and when you want to be notified</p>
        </div>
        <div className="grid px-6 py-3 sm:px-7" style={{ gridTemplateColumns: '1fr 80px 80px', borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}` }}>
          {['', 'Email', 'Push'].map((h, i) => (
            <span key={i} style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i ? 'center' : 'left' }}>
              {h}
            </span>
          ))}
        </div>
        {NOTIFS.map((n, i) => (
          <div key={n.id} className="grid items-center px-6 py-4 sm:px-7" style={{ gridTemplateColumns: '1fr 80px 80px', borderBottom: i < NOTIFS.length - 1 ? `1px solid ${C.line}` : 'none' }}>
            <div className="min-w-0 pr-2">
              <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{n.label}</p>
              <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>{n.description}</p>
            </div>
            {(['email', 'push'] as const).map((ch) => (
              <div key={ch} className="flex justify-center">
                <Toggle value={data.prefs[n.id][ch]} onChange={(v) => save.mutate({ [n.id]: { [ch]: v } })} />
              </div>
            ))}
          </div>
        ))}
      </Card>
      <div className="flex flex-col gap-2 px-1">
        {!data.emailEnabled && (
          <p style={{ fontSize: 12.5, color: C.amber, lineHeight: 1.55 }}>
            Email delivery isn&apos;t configured on this server yet (SMTP settings missing), so email notifications are saved but not sent.
          </p>
        )}
        <p style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.55 }}>
          Push notifications appear in the bell menu{desktop === 'granted' ? ' and as desktop alerts while Postly is open.' : '.'}{' '}
          {desktop === 'default' && (
            <button onClick={enableDesktop} style={{ color: C.blue, fontWeight: 600 }} className="transition-opacity hover:opacity-70">
              Also show desktop alerts
            </button>
          )}
          {desktop === 'denied' && <span>Desktop alerts are blocked in your browser settings.</span>}
        </p>
      </div>
    </div>
  );
}

// ─── Billing ────────────────────────────────────────────────────────────────
interface BillingSummary {
  plan: Plan;
  status: string | null;
  currentPeriodEnd: string | null;
  hasCustomer: boolean;
  billingEnabled: boolean;
  limits: { accounts: number; members: number; scheduledPostsPerMonth: number; priceMonthly: number; name: string };
  usage: { accounts: number; members: number; postsThisMonth: number };
  plans: { key: Plan; name: string; priceMonthly: number; features: string[] }[];
}
interface BillingDetails {
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  invoices: { id: string; date: string; amount: number; currency: string; status: string | null; pdf: string | null; url: string | null }[];
}

function BillingTab() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const isOwner = useCan('OWNER');
  const { data } = useQuery({ queryKey: ['billing'], queryFn: () => api<BillingSummary>('/billing') });
  const { data: details } = useQuery({ queryKey: ['billing', 'details'], queryFn: () => api<BillingDetails>('/billing/details'), enabled: !!data?.hasCustomer });

  useEffect(() => {
    const c = params.get('checkout');
    if (c === 'success') {
      toast.success('Subscription updated. Thank you!');
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['billing'] });
    }
    if (c === 'cancelled') toast.message('Checkout cancelled');
  }, [params, qc]);

  const go = useMutation({
    mutationFn: ({ path, plan }: { path: string; plan?: Plan }) => api<{ url: string }>(path, { method: 'POST', body: plan ? { plan } : undefined }),
    onSuccess: (r) => (window.location.href = r.url),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!data) return <PageLoader />;
  const current = data.plans.find((p) => p.key === data.plan)!;
  const active = !data.status || ['active', 'trialing'].includes(data.status);
  const money = (cents: number, cur: string) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur.toUpperCase() }).format(cents / 100);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl p-6 sm:p-7" style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', boxShadow: CARD_SHADOW }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#60A5FA', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Current Plan</span>
            <h3 style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginTop: 8 }}>{current.name} Workspace</h3>
            <p style={{ fontSize: 13, color: C.faint, marginTop: 6 }}>
              {current.priceMonthly ? `$${current.priceMonthly}/mo · Billed monthly` : 'Free forever'}
              {data.currentPeriodEnd && ` · ${data.status === 'canceled' ? 'Ends' : 'Renews'} ${format(new Date(data.currentPeriodEnd), 'MMM d, yyyy')}`}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ fontSize: 12, fontWeight: 700, color: active ? '#34D399' : '#FBBF24', background: active ? 'rgba(52,211,153,0.1)' : 'rgba(251,191,36,0.1)' }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? '#34D399' : '#FBBF24' }} /> {data.status ? data.status.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Active'}
          </span>
        </div>
        <div className="mt-7 grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {[
            [`${data.usage.members} / ${data.limits.members}`, 'Team members'],
            [`${data.usage.accounts} / ${data.limits.accounts}`, 'Connected accounts'],
            [data.limits.scheduledPostsPerMonth < 0 ? 'Unlimited' : `${data.usage.postsThisMonth} / ${data.limits.scheduledPostsPerMonth}`, 'Scheduled posts this month'],
          ].map(([v, l]) => (
            <div key={l}>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{v}</p>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {data.plans.map((p) => {
          const isCurrent = p.key === data.plan;
          return (
            <div key={p.key} className="flex flex-col rounded-2xl bg-white p-6" style={{ border: isCurrent ? `1.5px solid ${C.blueBorder}` : BORDER, boxShadow: CARD_SHADOW }}>
              <div className="flex items-center justify-between">
                <p style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{p.name}</p>
                {isCurrent && <span style={{ fontSize: 10, fontWeight: 700, color: C.blue, background: C.blueSoft, padding: '2px 8px', borderRadius: 999 }}>Current</span>}
              </div>
              <p className="mt-2">
                <span style={{ fontSize: 26, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>${p.priceMonthly}</span>
                <span style={{ fontSize: 13, color: C.faint }}> / month</span>
              </p>
              <ul className="mt-4 flex flex-1 flex-col gap-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2" style={{ fontSize: 13, color: C.body }}>
                    <Check size={14} className="mt-0.5 flex-shrink-0" color={C.green} /> {f}
                  </li>
                ))}
              </ul>
              {!isCurrent && p.key !== 'FREE' && (
                <button
                  disabled={!isOwner || !data.billingEnabled || go.isPending}
                  onClick={() => go.mutate(data.plan !== 'FREE' && data.hasCustomer ? { path: '/billing/portal' } : { path: '/billing/checkout', plan: p.key })}
                  className="mt-5 w-full rounded-xl py-2.5 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: C.blue }}
                >
                  {data.plan === 'FREE' ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {(!data.billingEnabled || !isOwner) && (
        <p style={{ fontSize: 12, color: C.faint }}>{!data.billingEnabled ? 'Billing is not configured on this server yet (Stripe keys missing).' : 'Only workspace owners can change the plan.'}</p>
      )}

      <div className="rounded-2xl bg-white p-6 sm:p-7" style={{ border: BORDER }}>
        <h3 style={{ ...h3, marginBottom: 20 }}>Payment method</h3>
        <div className="flex flex-wrap items-center gap-4 rounded-xl p-5" style={{ border: BORDER, background: '#FAFBFD' }}>
          <div className="flex items-center justify-center rounded-lg" style={{ width: 44, height: 30, background: '#1a1f5e' }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{details?.paymentMethod ? details.paymentMethod.brand.toUpperCase().slice(0, 4) : 'CARD'}</span>
          </div>
          <div className="flex-1">
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
              {details?.paymentMethod ? `${details.paymentMethod.brand.charAt(0).toUpperCase() + details.paymentMethod.brand.slice(1)} ending in ${details.paymentMethod.last4}` : 'No card on file'}
            </p>
            <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>
              {details?.paymentMethod ? `Expires ${String(details.paymentMethod.expMonth).padStart(2, '0')}/${String(details.paymentMethod.expYear).slice(-2)}` : 'Added when you upgrade'}
            </p>
          </div>
          {data.hasCustomer && isOwner && (
            <button onClick={() => go.mutate({ path: '/billing/portal' })} style={{ fontSize: 13, fontWeight: 600, color: C.blue }} className="transition-opacity hover:opacity-70">
              Update
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 sm:p-7" style={{ border: BORDER }}>
        <h3 style={{ ...h3, marginBottom: 16 }}>Billing history</h3>
        {!details?.invoices.length ? (
          <p style={{ fontSize: 13, color: C.ghost }}>No invoices yet.</p>
        ) : (
          details.invoices.map((inv, i) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-4" style={{ borderBottom: i < details.invoices.length - 1 ? `1px solid ${C.line}` : 'none' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
                  {current.name} Workspace · {format(new Date(inv.date), 'MMM d, yyyy')}
                </p>
                <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>{money(inv.amount, inv.currency)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
                  style={{ fontSize: 11, fontWeight: 700, color: inv.status === 'paid' ? C.green : C.amber, background: inv.status === 'paid' ? C.greenSoft : C.amberSoft }}
                >
                  {inv.status === 'paid' && <Check size={9} strokeWidth={3} />} {inv.status ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1) : '—'}
                </span>
                {(inv.pdf || inv.url) && (
                  <a href={(inv.pdf ?? inv.url)!} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: C.muted }} className="transition-opacity hover:opacity-70">
                    Download
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── API & Integrations ─────────────────────────────────────────────────────
function IntegrationsTab() {
  const router = useRouter();
  const isAdmin = useCan('ADMIN');
  const { data: integrations } = useIntegrations();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast.success('Copied'));
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <div className="px-6 py-5 sm:px-7">
          <h3 style={h3}>Connected platforms</h3>
          <p style={{ ...sub, marginTop: 4 }}>Manage your social media connections</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-6 py-5 sm:px-7" style={{ borderTop: `1px solid ${C.line}` }}>
          <button onClick={() => router.push('/connect')} className="flex items-center gap-2 rounded-xl px-4 py-2.5 transition-all hover:opacity-90" style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: C.blue }}>
            <Link2 size={14} /> Manage connected accounts
          </button>
          <ChevronRight size={14} color={C.faint} />
          <div className="flex items-center gap-1.5">
            {integrations?.map((i) => (
              <span key={i.key} title={`${PLATFORMS[i.key].label}: ${i.configured ? 'enabled' : 'not configured'}`} style={{ opacity: i.configured ? 1 : 0.35 }}>
                <PlatformBadge provider={i.key} size="sm" />
              </span>
            ))}
          </div>
        </div>
      </Card>
      {isAdmin && <ApiAccess />}
      {isAdmin && (
        <div className="rounded-2xl bg-white p-6 sm:p-7" style={{ border: BORDER }}>
          <h3 style={{ ...h3, marginBottom: 4 }}>Developer app settings</h3>
          <p style={{ ...sub, marginBottom: 20 }}>Use these URLs when creating your Meta, X, LinkedIn and Google developer apps.</p>
          <div className="flex flex-col gap-3">
            {integrations?.map((i) => (
              <div key={i.key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="flex w-40 flex-shrink-0 items-center gap-2" style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                  <PlatformBadge provider={i.key} size="sm" /> {PLATFORMS[i.key].short}
                </span>
                <input readOnly value={i.callbackUrl} className="min-w-0 flex-1 rounded-xl bg-white px-4 py-2.5 font-mono" style={{ fontSize: 12, border: `1px solid ${C.border3}`, color: C.muted }} />
                <button onClick={() => copy(i.callbackUrl)} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5" style={{ fontSize: 13, fontWeight: 600, color: C.blue, border: `1px solid ${C.blueBorder}`, background: C.blueSoft }}>
                  <Copy size={12} /> Copy
                </button>
              </div>
            ))}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="w-40 flex-shrink-0" style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                Meta webhooks
              </span>
              <input readOnly value={`${origin}/api/webhooks/meta`} className="min-w-0 flex-1 rounded-xl bg-white px-4 py-2.5 font-mono" style={{ fontSize: 12, border: `1px solid ${C.border3}`, color: C.muted }} />
              <button onClick={() => copy(`${origin}/api/webhooks/meta`)} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5" style={{ fontSize: 13, fontWeight: 600, color: C.blue, border: `1px solid ${C.blueBorder}`, background: C.blueSoft }}>
                <Copy size={12} /> Copy
              </button>
            </div>
          </div>
          <p style={{ fontSize: 12, color: C.faint, marginTop: 16 }}>Full setup steps for each platform are in docs/SOCIAL_PLATFORMS.md.</p>
        </div>
      )}
    </div>
  );
}

function SettingsView() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'profile') as TabId;
  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8" style={{ background: C.page }}>
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-8">
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>Settings</h1>
          <p style={{ fontSize: 14, color: C.faint, marginTop: 4 }}>Manage your account, team, and workspace preferences</p>
        </div>
        <div className="flex flex-col items-start gap-6 lg:flex-row">
          <div className="w-full flex-shrink-0 lg:w-60">
            <div className="scrollbar-thin flex gap-1 overflow-x-auto rounded-2xl bg-white p-2 lg:flex-col" style={{ boxShadow: CARD_SHADOW }}>
              {TABS.map(({ id, label, icon: Icon }) => {
                const on = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => router.replace(`/settings?tab=${id}`, { scroll: false })}
                    className="flex flex-shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 transition-all hover:bg-[#FAFBFD] lg:w-full"
                    style={{ background: on ? C.page : undefined }}
                  >
                    <Icon size={15} color={on ? C.blue : C.faint} />
                    <span style={{ fontSize: 13, fontWeight: on ? 700 : 500, color: on ? C.ink : C.muted, whiteSpace: 'nowrap' }}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="w-full min-w-0 flex-1">
            {tab === 'profile' && <ProfileTab />}
            {tab === 'team' && <TeamTab />}
            {tab === 'notifications' && <NotificationsTab />}
            {tab === 'billing' && <BillingTab />}
            {tab === 'integrations' && <IntegrationsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <SettingsView />
    </Suspense>
  );
}
