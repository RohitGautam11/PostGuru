'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, CircleX, ExternalLink, Loader, Plus, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { APP_NAME } from '@/components/logo';
import { ConfirmDialog, Dropdown, MenuItem, Modal, PageLoader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C, GRADIENT } from '@/lib/design';
import { useAccounts, useCan, useDashboard, useIntegrations, useMe } from '@/lib/hooks';
import { PLATFORMS, PROVIDER_ORDER, PlatformBadge } from '@/lib/platforms';
import type { Provider, SocialAccount } from '@/lib/types';
import { compact, initials, timeAgo } from '@/lib/utils';

const HEALTH = {
  active: { label: 'Active', icon: CircleCheck, color: C.green, bg: C.greenSoft },
  expiring: { label: 'Expiring', icon: TriangleAlert, color: C.amber, bg: C.amberSoft },
  expired: { label: 'Reconnect', icon: CircleX, color: C.red, bg: C.redSoft },
};
const card = { boxShadow: '0 1px 3px rgba(15,23,42,0.04),0 1px 2px rgba(15,23,42,0.03)' };

type ModalState = { provider: Provider; state: 'connecting' | 'success' | 'error'; message?: string; count?: number } | null;

function ConnectView() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const canConnect = useCan('ADMIN');
  const { data: me } = useMe();
  const { data: accounts, isLoading } = useAccounts();
  const { data: dash } = useDashboard();
  const { data: integrations } = useIntegrations();
  const [modal, setModal] = useState<ModalState>(null);
  const [toRemove, setToRemove] = useState<SocialAccount | null>(null);
  const handled = useRef(false);

  // Result of the OAuth round-trip (?connected=… or ?error=…).
  useEffect(() => {
    if (handled.current) return;
    const connected = params.get('connected');
    const error = params.get('error');
    if (!connected && !error) return;
    handled.current = true;
    const provider = (connected ?? sessionStorage.getItem('connecting') ?? 'FACEBOOK').toUpperCase() as Provider;
    sessionStorage.removeItem('connecting');
    if (connected) {
      setModal({ provider, state: 'success', count: Number(params.get('count') ?? 1) });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    } else {
      setModal({ provider: PLATFORMS[provider] ? provider : 'FACEBOOK', state: 'error', message: error ?? undefined });
    }
    router.replace('/connect');
  }, [params, qc, router]);

  async function connect(provider: Provider) {
    if (!canConnect) return toast.error('Only workspace owners and admins can connect accounts.');
    setModal({ provider, state: 'connecting' });
    try {
      const { url } = await api<{ url: string }>(`/integrations/${provider.toLowerCase()}/connect`);
      sessionStorage.setItem('connecting', provider);
      setTimeout(() => (window.location.href = url), 600);
    } catch (e) {
      setModal({ provider, state: 'error', message: errorMessage(e) });
    }
  }

  const sync = useMutation({
    mutationFn: (id: string) => api<{ errors: string[]; newMessages: number; newComments: number }>(`/accounts/${id}/sync`, { method: 'POST' }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      if (r.errors.length) toast.warning(`Synced with issues: ${r.errors[0]}`);
      else toast.success(`Synced · ${r.newMessages} new messages, ${r.newComments} new comments`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Account disconnected');
      setToRemove(null);
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <PageLoader />;
  const health = (id: string) => dash?.accounts.find((a) => a.id === id);
  const healthyCount = (accounts ?? []).filter((a) => (health(a.id)?.health ?? (a.status === 'CONNECTED' ? 'active' : 'expired')) === 'active').length;

  return (
    <>
      <div className="min-h-full p-4 sm:p-6 lg:p-8" style={{ background: C.page }}>
        <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="flex items-center justify-center rounded-xl bg-white transition-colors hover:bg-[#F8FAFC]" style={{ width: 38, height: 38, border: `1px solid ${C.border3}` }} aria-label="Back">
              <ArrowLeft size={16} color={C.muted} />
            </button>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em' }}>Connect Accounts</h1>
              <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>
                {accounts?.length ?? 0} connected · {healthyCount} healthy
              </p>
            </div>
          </div>

          <section className="flex flex-col gap-4">
            <div className="px-1">
              <h2 style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>Connected accounts</h2>
              <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>Manage your linked social media profiles</p>
            </div>
            {!accounts?.length ? (
              <div className="rounded-2xl bg-white px-6 py-10 text-center" style={card}>
                <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>No accounts connected yet</p>
                <p style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>Pick a platform below to link your first profile.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {accounts.map((a) => {
                  const h = health(a.id);
                  const state = h?.health ?? (a.status === 'CONNECTED' ? 'active' : 'expired');
                  const s = HEALTH[state];
                  return (
                    <div key={a.id} className="flex flex-wrap items-center gap-4 rounded-2xl bg-white p-5 transition-all hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] sm:flex-nowrap sm:p-6" style={card}>
                      <div className="relative flex-shrink-0">
                        {a.avatarUrl ? (
                          <img src={a.avatarUrl} alt="" referrerPolicy="no-referrer" className="rounded-xl object-cover" style={{ width: 48, height: 48 }} />
                        ) : (
                          <div className="flex items-center justify-center rounded-xl" style={{ width: 48, height: 48, background: C.page }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: C.body }}>{initials(a.name)}</span>
                          </div>
                        )}
                        <div className="absolute -bottom-1 -right-1">
                          <PlatformBadge provider={a.provider} size="sm" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate" style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
                            {a.username ? (a.username.startsWith('@') || a.username.includes('@') ? a.username : `@${a.username}`) : a.name}
                          </p>
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ fontSize: 11, fontWeight: 500, color: s.color, background: s.bg }}>
                            <s.icon size={10} strokeWidth={2.5} />
                            {state === 'expiring' && h?.daysUntilExpiry ? `${h.daysUntilExpiry}d left` : s.label}
                          </span>
                        </div>
                        <p className="truncate" style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
                          {a.name} · {compact(a.followers)} followers · synced {timeAgo(a.lastSyncedAt)}
                        </p>
                        {state !== 'active' && a.statusMessage && (
                          <p className="truncate" style={{ fontSize: 11.5, color: C.amber, marginTop: 2 }} title={a.statusMessage}>
                            {a.statusMessage}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {state !== 'active' ? (
                          <button onClick={() => connect(a.provider)} className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-all hover:opacity-80" style={{ fontSize: 12, fontWeight: 500, color: s.color, background: s.bg }}>
                            <RefreshCw size={11} strokeWidth={2.5} /> Reconnect
                          </button>
                        ) : (
                          <Dropdown
                            align="right"
                            width={190}
                            trigger={
                              <button className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 transition-colors hover:bg-[#F8FAFC]" style={{ fontSize: 12, fontWeight: 500, color: C.muted, border: `1px solid ${C.border3}` }}>
                                <ExternalLink size={11} /> Manage
                              </button>
                            }
                          >
                            <div style={{ padding: '4px 0' }}>
                              <MenuItem icon={<RefreshCw size={13} />} onClick={() => sync.mutate(a.id)}>
                                Sync now
                              </MenuItem>
                              {canConnect && (
                                <MenuItem icon={<Loader size={13} />} onClick={() => connect(a.provider)}>
                                  Refresh permissions
                                </MenuItem>
                              )}
                            </div>
                          </Dropdown>
                        )}
                        {canConnect && (
                          <button onClick={() => setToRemove(a)} className="flex items-center justify-center rounded-xl bg-white transition-colors hover:bg-[#FEF2F2]" style={{ width: 34, height: 34, border: `1px solid ${C.border3}` }} title="Disconnect">
                            <X size={13} color={C.faint} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <div className="px-1">
              <h2 style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>Add another account</h2>
              <p style={{ fontSize: 13, color: C.faint, marginTop: 2 }}>Connect additional social profiles to your workspace</p>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {PROVIDER_ORDER.map((p) => {
                const s = PLATFORMS[p];
                const configured = integrations?.find((i) => i.key === p)?.configured !== false;
                return (
                  <div key={p} className="flex items-center gap-4 rounded-2xl bg-white p-5 transition-all hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] sm:p-6" style={card}>
                    <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 48, height: 48, background: s.bg }}>
                      <PlatformBadge provider={p} size="md" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{s.label}</p>
                      <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.4, marginTop: 2 }}>{configured ? s.description : 'Not configured on the server yet — add the API keys to enable it.'}</p>
                    </div>
                    <button
                      onClick={() => connect(p)}
                      disabled={!configured || !canConnect}
                      className="flex flex-shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 transition-all hover:opacity-90 disabled:cursor-not-allowed"
                      style={{ fontSize: 13, fontWeight: 500, color: '#fff', background: configured && canConnect ? C.blue : '#CBD5E1' }}
                    >
                      <Plus size={13} strokeWidth={2.5} /> Connect
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex items-center gap-2 px-1">
              <TriangleAlert size={13} color={C.faint} className="flex-shrink-0" />
              <p style={{ fontSize: 12, color: C.faint }}>Connecting accounts requires Owner or Admin permissions. You&apos;ll be redirected to each platform to authorize {APP_NAME}.</p>
            </div>
          </section>
        </div>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} width={400} closable={modal?.state !== 'connecting'}>
        {modal && (
          <div className="flex flex-col items-center p-8 text-center">
            {modal.state === 'connecting' && (
              <>
                <div className="mb-5 flex items-center justify-center rounded-full" style={{ width: 64, height: 64, background: C.blueSoft }}>
                  <Loader size={28} color={C.blue} className="animate-spin" />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>Connecting to {PLATFORMS[modal.provider].label}</h3>
                <p style={{ fontSize: 14, color: C.faint, marginTop: 8 }}>
                  Redirecting to {PLATFORMS[modal.provider].label} for authentication. Please authorize {APP_NAME} to manage your account.
                </p>
                <div className="mt-6 h-2 w-full overflow-hidden rounded-full" style={{ background: '#F1F5F9' }}>
                  <div className="h-full animate-pulse rounded-full" style={{ width: '65%', background: GRADIENT }} />
                </div>
              </>
            )}
            {modal.state === 'success' && (
              <>
                <div className="mb-5 flex items-center justify-center rounded-full" style={{ width: 64, height: 64, background: C.greenSoft, border: `2px solid ${C.greenBorder}` }}>
                  <CircleCheck size={28} color={C.green} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>Successfully connected!</h3>
                <p style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>
                  {modal.count && modal.count > 1 ? `${modal.count} ${PLATFORMS[modal.provider].label} accounts have` : `Your ${PLATFORMS[modal.provider].label} account has`} been linked to the {me?.workspace.name} workspace.
                </p>
                <button onClick={() => setModal(null)} className="mt-6 w-full rounded-xl py-3 transition-all hover:opacity-90" style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: GRADIENT }}>
                  Done
                </button>
              </>
            )}
            {modal.state === 'error' && (
              <>
                <div className="mb-5 flex items-center justify-center rounded-full" style={{ width: 64, height: 64, background: C.redSoft, border: `2px solid ${C.redBorder}` }}>
                  <CircleX size={28} color={C.red} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>Connection failed</h3>
                <p style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>{modal.message ?? `We couldn't connect your ${PLATFORMS[modal.provider].label} account. Please try again.`}</p>
                <button onClick={() => connect(modal.provider)} className="mt-6 w-full rounded-xl py-3 transition-all hover:opacity-90" style={{ fontSize: 14, fontWeight: 700, color: '#fff', background: C.red }}>
                  Try again
                </button>
              </>
            )}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={!!toRemove}
        onClose={() => setToRemove(null)}
        onConfirm={() => toRemove && remove.mutate(toRemove.id)}
        loading={remove.isPending}
        danger
        icon={<X size={15} color={C.red} />}
        title={`Disconnect ${toRemove?.name}?`}
        description="Scheduled posts for this account are removed from its queue and its synced messages and comments are deleted from your workspace. Nothing is deleted on the platform."
        confirmLabel="Disconnect"
      />
    </>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ConnectView />
    </Suspense>
  );
}
