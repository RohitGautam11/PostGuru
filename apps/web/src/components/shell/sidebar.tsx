'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  Inbox,
  LayoutDashboard,
  Link2,
  LogOut,
  Plus,
  Settings,
  SquarePen,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Logo } from '@/components/logo';
import { Btn, Dropdown, GradientAvatar, MenuDivider, MenuItem, MenuLabel, Modal, TextInput } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C, colorFor } from '@/lib/design';
import { useDashboard, useMe } from '@/lib/hooks';
import { PLATFORMS } from '@/lib/platforms';
import { cn, initials } from '@/lib/utils';

const MENU = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'composer', label: 'Composer', icon: SquarePen, path: '/composer' },
  { id: 'planner', label: 'Planner', icon: CalendarDays, path: '/planner' },
  { id: 'inbox', label: 'Inbox', icon: Inbox, path: '/inbox', badge: true },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, path: '/analytics' },
];

export function activeId(path: string) {
  if (path.startsWith('/posts')) return 'dashboard';
  return ['dashboard', 'composer', 'planner', 'inbox', 'analytics', 'settings', 'connect'].find((id) => path.startsWith(`/${id}`)) ?? '';
}

const label = { fontSize: 10, fontWeight: 700, color: '#B0B8C8', letterSpacing: '0.08em', textTransform: 'uppercase' as const };

function NavButton({
  active,
  collapsed,
  icon: Icon,
  text,
  onClick,
  trailing,
  dot,
}: {
  active: boolean;
  collapsed: boolean;
  icon: LucideIcon;
  text: string;
  onClick: () => void;
  trailing?: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <div className="group/nav relative">
      <button
        onClick={onClick}
        className={cn('flex w-full items-center transition-all', !active && 'hover:bg-white/70')}
        style={{
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : 12,
          padding: collapsed ? '6px 0' : '10px 12px',
          borderRadius: 12,
          background: active ? '#0F172A' : undefined,
          boxShadow: active ? '0 2px 10px rgba(15,23,42,0.2)' : 'none',
        }}
      >
        <div
          className="flex flex-shrink-0 items-center justify-center"
          style={{
            width: collapsed ? 36 : 30,
            height: collapsed ? 36 : 30,
            borderRadius: collapsed ? '50%' : 8,
            background: active ? (collapsed ? '#0F172A' : 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.8)',
            border: active ? 'none' : '1px solid #E8ECF0',
            boxShadow: active && collapsed ? '0 2px 10px rgba(15,23,42,0.25)' : 'none',
          }}
        >
          <Icon size={collapsed ? 16 : 15} strokeWidth={active ? 2.5 : 2} style={{ color: active ? '#fff' : C.muted }} />
        </div>
        {!collapsed && (
          <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? '#fff' : C.slate, flex: 1, textAlign: 'left', whiteSpace: 'nowrap' }}>
            {text}
          </span>
        )}
        {!collapsed && trailing}
        {collapsed && dot && (
          <span className="absolute rounded-full" style={{ width: 7, height: 7, background: C.blue, border: '1.5px solid #F4F6F8', top: 6, right: 10 }} />
        )}
      </button>
      {collapsed && (
        <div
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 opacity-0 transition-opacity group-hover/nav:opacity-100"
          style={{ background: '#0F172A', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{text}</span>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  collapsed,
  onCollapse,
  mobileOpen,
  onMobileClose,
  onSignOut,
  onHelp,
}: {
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onSignOut: () => void;
  onHelp: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: dash } = useDashboard();
  const current = activeId(pathname);
  const [createOpen, setCreateOpen] = useState(false);
  const [wsName, setWsName] = useState('');
  // On mobile the drawer always shows the expanded layout.
  const c = collapsed && !mobileOpen;
  const go = (path: string) => {
    router.push(path);
    onMobileClose();
  };

  const switchWs = useMutation({
    mutationFn: (workspaceId: string) => api('/auth/switch-workspace', { method: 'POST', body: { workspaceId } }),
    onSuccess: () => {
      qc.clear();
      window.location.href = '/dashboard';
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const createWs = useMutation({
    mutationFn: () => api<{ id: string }>('/workspace', { method: 'POST', body: { name: wsName } }),
    onSuccess: (ws) => switchWs.mutate(ws.id),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const ws = me?.workspace;
  const wsColor = colorFor(ws?.id ?? 'w');
  const unread = dash?.stats.unreadInbox ?? 0;
  const channels = dash?.accounts ?? [];

  return (
    <>
      <div
        className={cn('fixed inset-0 z-40 bg-[rgba(15,23,42,0.38)] transition-opacity lg:hidden', mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onMobileClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-screen flex-shrink-0 flex-col transition-all duration-200 lg:static lg:z-auto lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ width: c ? 68 : 248, minWidth: c ? 68 : 248, background: '#F4F6F8', borderRight: `1px solid ${C.divider}`, overflow: 'hidden' }}
      >
        {/* Brand */}
        <div
          className="flex flex-shrink-0 items-center"
          style={{ height: 64, borderBottom: `1px solid ${C.divider}`, padding: c ? 0 : '0 12px 0 20px', justifyContent: c ? 'center' : 'space-between' }}
        >
          <button onClick={() => go('/dashboard')} className="transition-opacity hover:opacity-80">
            <Logo hideText={c} />
          </button>
          {!c && (
            <button
              onClick={() => (mobileOpen ? onMobileClose() : onCollapse(true))}
              className="flex flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white/70"
              style={{ width: 26, height: 26 }}
              aria-label="Collapse sidebar"
            >
              {mobileOpen ? <X size={14} color={C.faint} /> : <ChevronsLeft size={14} color={C.faint} />}
            </button>
          )}
        </div>
        {c && (
          <div className="flex justify-center pb-1 pt-2">
            <button onClick={() => onCollapse(false)} className="flex items-center justify-center rounded-lg hover:bg-white/70" style={{ width: 30, height: 26 }} aria-label="Expand sidebar">
              <ChevronsRight size={14} color={C.faint} />
            </button>
          </div>
        )}

        {/* Workspace switcher */}
        {!c && ws && (
          <div className="px-3 pb-2 pt-4">
            <Dropdown
              width={220}
              trigger={
                <button
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 transition-all hover:bg-white/80"
                  style={{ border: `1px solid ${C.border}`, background: '#fff', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
                >
                  <div className="flex flex-shrink-0 items-center justify-center rounded-lg" style={{ width: 30, height: 30, background: `${wsColor}18` }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: wsColor }}>{initials(ws.name)}</span>
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>
                      {ws.name}
                    </p>
                    <p style={{ fontSize: 11, color: C.faint, lineHeight: 1.25 }}>{ws.plan.charAt(0) + ws.plan.slice(1).toLowerCase()} workspace</p>
                  </div>
                  <ChevronDown size={12} color={C.faint2} />
                </button>
              }
            >
              <div style={{ padding: '4px 0' }}>
                <MenuLabel>Workspaces</MenuLabel>
                {me.workspaces.map((w) => {
                  const col = colorFor(w.id);
                  return (
                    <MenuItem
                      key={w.id}
                      active={w.id === ws.id}
                      onClick={() => w.id !== ws.id && switchWs.mutate(w.id)}
                      icon={
                        <div className="flex flex-shrink-0 items-center justify-center rounded-md" style={{ width: 20, height: 20, background: `${col}18` }}>
                          <span style={{ fontSize: 8, fontWeight: 800, color: col }}>{initials(w.name)}</span>
                        </div>
                      }
                    >
                      <span style={{ display: 'block', fontSize: 13 }}>{w.name}</span>
                      <span style={{ display: 'block', fontSize: 11, color: C.faint, fontWeight: 400, marginTop: 1 }}>
                        {w.plan.charAt(0) + w.plan.slice(1).toLowerCase()} workspace
                      </span>
                    </MenuItem>
                  );
                })}
                <MenuDivider />
                <MenuItem icon={<Plus size={13} />} onClick={() => setCreateOpen(true)}>
                  Create workspace
                </MenuItem>
              </div>
            </Dropdown>
          </div>
        )}

        {!c && (
          <div className="px-5 pb-1 pt-3">
            <span style={label}>Menu</span>
          </div>
        )}
        <nav className="scrollbar-thin flex flex-1 flex-col overflow-y-auto" style={{ padding: c ? '8px 10px' : '0 12px', gap: 2 }}>
          {MENU.map((m) => (
            <NavButton
              key={m.id}
              active={current === m.id}
              collapsed={c}
              icon={m.icon}
              text={m.label}
              onClick={() => go(m.path)}
              dot={m.badge && unread > 0}
              trailing={
                m.badge && unread > 0 ? (
                  <span
                    className="flex flex-shrink-0 items-center justify-center rounded-full"
                    style={{ fontSize: 10, fontWeight: 700, minWidth: 20, height: 20, padding: '0 5px', background: current === m.id ? 'rgba(255,255,255,0.2)' : C.blue, color: '#fff' }}
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                ) : null
              }
            />
          ))}

          <div className="mt-2 pt-3" style={{ borderTop: `1px solid ${C.divider}` }}>
            {!c && (
              <div className="mb-2 flex items-center justify-between px-2">
                <span style={label}>Channels</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: C.faint }}>{channels.length} connected</span>
              </div>
            )}
            {!c && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5 px-3">
                {channels.slice(0, 6).map((a) => {
                  const p = PLATFORMS[a.provider];
                  return (
                    <div
                      key={a.id}
                      title={`${p.label} · ${a.name}`}
                      className="flex flex-shrink-0 items-center justify-center rounded-full"
                      style={{ width: 24, height: 24, background: p.bg, border: `1.5px solid ${p.color}28`, opacity: a.health === 'expired' ? 0.5 : 1 }}
                    >
                      <span style={{ fontSize: 8, fontWeight: 800, color: p.color }}>{p.initials}</span>
                    </div>
                  );
                })}
                <div
                  title="Connect more"
                  onClick={() => go('/connect')}
                  className="flex flex-shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-70"
                  style={{ width: 24, height: 24, background: '#F4F6F8', border: '1.5px dashed #CBD5E1' }}
                >
                  <Plus size={9} strokeWidth={2.5} color={C.faint} />
                </div>
              </div>
            )}
            <NavButton
              active={current === 'connect'}
              collapsed={c}
              icon={Link2}
              text="Connect Account"
              onClick={() => go('/connect')}
              trailing={
                <div
                  className="flex flex-shrink-0 items-center justify-center rounded-full"
                  style={{
                    width: 20,
                    height: 20,
                    background: current === 'connect' ? 'rgba(255,255,255,0.15)' : C.greenSoft,
                    border: `1px solid ${current === 'connect' ? 'rgba(255,255,255,0.1)' : C.greenBorder}`,
                  }}
                >
                  <Plus size={10} strokeWidth={2.5} color={current === 'connect' ? 'rgba(255,255,255,0.8)' : C.green} />
                </div>
              }
            />
          </div>

          <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.divider}` }}>
            {!c && (
              <div className="mb-1 px-2">
                <span style={label}>Account</span>
              </div>
            )}
            <NavButton active={current === 'settings'} collapsed={c} icon={Settings} text="Settings" onClick={() => go('/settings')} />
            <NavButton active={false} collapsed={c} icon={CircleHelp} text="Help & Support" onClick={onHelp} />
          </div>
        </nav>

        {/* User */}
        <div className="flex-shrink-0" style={{ borderTop: `1px solid ${C.divider}`, padding: c ? '12px 0' : 12, display: 'flex', justifyContent: c ? 'center' : 'stretch' }}>
          {me &&
            (c ? (
              <button onClick={() => go('/settings')} title={me.user.name}>
                <GradientAvatar name={me.user.name} src={me.user.avatarUrl} size={36} />
              </button>
            ) : (
              <div className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2.5" style={{ border: `1px solid ${C.border}` }}>
                <GradientAvatar name={me.user.name} src={me.user.avatarUrl} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>
                    {me.user.name}
                  </p>
                  <p style={{ fontSize: 11, color: C.faint, lineHeight: 1.25 }}>{me.role.charAt(0) + me.role.slice(1).toLowerCase()}</p>
                </div>
                <button onClick={onSignOut} className="flex flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[#FEF2F2]" style={{ width: 26, height: 26 }} title="Sign out">
                  <LogOut size={13} color={C.faint} />
                </button>
              </div>
            ))}
        </div>
      </aside>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} width={420}>
        <form
          style={{ padding: 24 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (wsName.trim().length >= 2) createWs.mutate();
          }}
        >
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>Create workspace</h2>
          <p style={{ fontSize: 13.5, color: C.muted, marginTop: 6, lineHeight: 1.55 }}>
            Workspaces keep accounts, posts and teammates separate — perfect for agencies and brands.
          </p>
          <div className="mt-5">
            <TextInput autoFocus placeholder="e.g. Acme Marketing" value={wsName} onChange={(e) => setWsName(e.target.value)} minLength={2} maxLength={80} />
          </div>
          <div className="mt-6 flex justify-end gap-2.5">
            <Btn type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Btn>
            <Btn type="submit" loading={createWs.isPending || switchWs.isPending} disabled={wsName.trim().length < 2}>
              Create & switch
            </Btn>
          </div>
        </form>
      </Modal>
    </>
  );
}
