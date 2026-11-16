'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ChevronRight, CircleHelp, ExternalLink, Keyboard, LogOut, Menu, Search, Settings, User } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Dropdown, GradientAvatar, MenuDivider, MenuItem } from '@/components/ui';
import { api } from '@/lib/api';
import { C, POP_SHADOW } from '@/lib/design';
import { useMe } from '@/lib/hooks';
import type { Notification } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/composer': 'Composer',
  '/planner': 'Planner',
  '/inbox': 'Inbox',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
  '/connect': 'Connect Accounts',
};
const titleFor = (p: string) => (p.startsWith('/posts/') ? 'Post Details' : TITLES[p] ?? 'Dashboard');

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ items: Notification[]; unread: number }>('/notifications'),
    refetchInterval: 60_000,
  });
  // "Push" channel: mirror newly arrived notifications as desktop alerts when the browser allows it.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    if (!seen.current) {
      seen.current = new Set(data.items.map((n) => n.id));
      return;
    }
    const fresh = data.items.filter((n) => !n.readAt && !seen.current!.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    const Desktop = typeof window !== 'undefined' ? window.Notification : undefined;
    if (!Desktop || Desktop.permission !== 'granted') return;
    for (const n of fresh.slice(0, 3)) {
      const alert = new Desktop(n.title, { body: n.body ?? undefined, tag: n.id });
      alert.onclick = () => {
        window.focus();
        if (n.link) router.push(n.link);
        alert.close();
      };
    }
  }, [data, router]);
  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function openItem(n: Notification) {
    setOpen(false);
    if (!n.readAt) {
      await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => undefined);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }
    if (n.link) router.push(n.link);
  }

  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center rounded-xl transition-colors hover:bg-white/70"
        style={{ width: 38, height: 38 }}
        title="Notifications"
      >
        <Bell size={17} strokeWidth={2} color={C.muted} />
        {unread > 0 && (
          <span
            className="absolute right-1 top-1 flex items-center justify-center rounded-full bg-[#DC2626] text-white"
            style={{ minWidth: 16, height: 16, fontSize: 9, fontWeight: 700, padding: '0 3px' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-1.5 overflow-hidden"
          style={{ width: 'min(92vw, 360px)', background: '#fff', border: '1px solid #EEF2F6', borderRadius: 16, boxShadow: POP_SHADOW }}
        >
          <div className="flex items-center justify-between" style={{ padding: '12px 14px', borderBottom: `1px solid ${C.page}` }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Notifications</p>
            {unread > 0 && (
              <button onClick={() => readAll.mutate()} className="flex items-center gap-1 hover:opacity-70" style={{ fontSize: 12, fontWeight: 600, color: C.blue }}>
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-96 overflow-y-auto">
            {!data?.items.length && <p className="px-4 py-10 text-center" style={{ fontSize: 13, color: C.faint }}>You&apos;re all caught up.</p>}
            {data?.items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F8FAFC]"
                style={{ borderBottom: `1px solid ${C.page}`, background: n.readAt ? '#fff' : '#F8FAFF' }}
              >
                <span className="mt-1.5 flex-shrink-0 rounded-full" style={{ width: 6, height: 6, background: n.readAt ? 'transparent' : C.blue }} />
                <span className="min-w-0">
                  <span className="block" style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                    {n.title}
                  </span>
                  {n.body && (
                    <span className="line-clamp-2-safe mt-0.5 block" style={{ fontSize: 12, color: C.muted }}>
                      {n.body}
                    </span>
                  )}
                  <span className="mt-1 block" style={{ fontSize: 11, color: C.faint2 }}>
                    {timeAgo(n.createdAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Topbar({
  onMenu,
  onSignOut,
  onHelp,
  onShortcuts,
  onWhatsNew,
}: {
  onMenu: () => void;
  onSignOut: () => void;
  onHelp: () => void;
  onShortcuts: () => void;
  onWhatsNew: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');

  // ⌘K / Ctrl+K focuses search; "n" opens the composer when not typing.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (!typing && !e.metaKey && !e.ctrlKey && e.key === 'n') {
        router.push('/composer');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [router]);

  return (
    <header className="flex w-full flex-shrink-0 items-center gap-3 px-4 sm:gap-4 sm:px-6" style={{ height: 64, background: '#F4F6F8', borderBottom: `1px solid ${C.divider}` }}>
      <button onClick={onMenu} className="flex items-center justify-center rounded-xl hover:bg-white/70 lg:hidden" style={{ width: 38, height: 38 }} aria-label="Open menu">
        <Menu size={18} color={C.muted} />
      </button>
      <div className="hidden items-center gap-1.5 sm:flex">
        <button onClick={() => router.push('/dashboard')} className="max-w-[160px] truncate transition-opacity hover:opacity-70" style={{ fontSize: 13, color: C.faint, fontWeight: 500 }}>
          {me?.workspace.name ?? '…'}
        </button>
        <ChevronRight size={13} color="#CBD5E1" />
        <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{titleFor(pathname)}</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/planner?view=list&q=${encodeURIComponent(q.trim())}`);
        }}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3.5 py-2 transition-all focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/10 hover:border-[#CBD5E1] md:max-w-[280px] md:flex-none"
        style={{ width: 280, background: '#fff', border: '1px solid #E8ECF0' }}
      >
        <Search size={14} className="flex-shrink-0" color={C.faint} />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="text"
          placeholder="Search posts, accounts..."
          className="min-w-0 flex-1 bg-transparent text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
          style={{ fontSize: 13 }}
        />
        <kbd className="hidden items-center rounded sm:flex" style={{ fontSize: 10, fontWeight: 600, color: '#CBD5E1', background: '#F1F5F9', padding: '2px 5px' }}>
          ⌘K
        </kbd>
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        <button onClick={onHelp} className="hidden items-center justify-center rounded-xl transition-colors hover:bg-white/70 sm:flex" style={{ width: 38, height: 38 }} title="Help & support">
          <CircleHelp size={17} color={C.faint} />
        </button>
        <Notifications />
        <div className="mx-2 hidden h-5 w-px bg-[#EAECEF] sm:block" />
        {me && (
          <Dropdown
            align="right"
            width={220}
            trigger={
              <button className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-white/70 sm:px-2.5 sm:py-2">
                <GradientAvatar name={me.user.name} src={me.user.avatarUrl} size={30} />
                <div className="hidden text-left md:block">
                  <p className="max-w-[140px] truncate" style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>
                    {me.user.name}
                  </p>
                  <p style={{ fontSize: 11, color: C.faint, lineHeight: 1.2 }}>{me.role.charAt(0) + me.role.slice(1).toLowerCase()}</p>
                </div>
                <ChevronRight size={13} className="hidden rotate-90 md:block" color="#CBD5E1" />
              </button>
            }
          >
            <div style={{ padding: '12px 14px 8px', borderBottom: `1px solid ${C.page}` }}>
              <div className="flex items-center gap-2.5">
                <GradientAvatar name={me.user.name} src={me.user.avatarUrl} size={34} />
                <div className="min-w-0">
                  <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>
                    {me.user.name}
                  </p>
                  <p className="truncate" style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.3 }}>
                    {me.user.email}
                  </p>
                </div>
              </div>
            </div>
            <div style={{ padding: '4px 0' }}>
              <MenuItem icon={<User size={13} strokeWidth={1.8} />} onClick={() => router.push('/settings')}>
                Profile settings
              </MenuItem>
              <MenuItem icon={<Keyboard size={13} strokeWidth={1.8} />} onClick={onShortcuts}>
                Keyboard shortcuts
              </MenuItem>
              <MenuItem icon={<ExternalLink size={13} strokeWidth={1.8} />} onClick={onWhatsNew}>
                What&apos;s new
              </MenuItem>
              <MenuDivider />
              <MenuItem icon={<Settings size={13} strokeWidth={1.8} />} onClick={() => router.push('/settings?tab=team')}>
                Workspace settings
              </MenuItem>
              <MenuDivider />
              <MenuItem icon={<LogOut size={13} strokeWidth={1.8} />} danger onClick={onSignOut}>
                Sign out
              </MenuItem>
            </div>
          </Dropdown>
        )}
      </div>
    </header>
  );
}
