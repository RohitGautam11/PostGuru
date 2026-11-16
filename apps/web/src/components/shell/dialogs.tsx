'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BellRing, BookOpen, CircleCheckBig, KeyRound, Link2, LogOut, Mail, ShieldCheck, SquarePen, StickyNote } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GradientAvatar, Modal } from '@/components/ui';
import { api } from '@/lib/api';
import { C } from '@/lib/design';
import { useMe } from '@/lib/hooks';

/** Sign-out confirmation ("tk" in the design). */
export function SignOutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  useEffect(() => {
    if (open) setState('idle');
  }, [open]);

  async function signOut() {
    setState('loading');
    await api('/auth/logout', { method: 'POST', noRefresh: true }).catch(() => undefined);
    setState('done');
    setTimeout(() => {
      qc.clear();
      window.location.href = '/login';
    }, 1200);
  }

  return (
    <Modal open={open} onClose={onClose} width={400} closable={state === 'idle'}>
      {state === 'done' ? (
        <div className="flex flex-col items-center text-center" style={{ padding: '48px 40px' }}>
          <div className="mb-5 flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: C.greenSoft, border: `1.5px solid ${C.greenBorder}` }}>
            <CircleCheckBig size={24} color={C.green} />
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>You&apos;ve been signed out</h2>
          <p style={{ fontSize: 13.5, color: C.faint, marginTop: 8, lineHeight: 1.55 }}>Redirecting you to the login page…</p>
          <div className="mt-8 w-full overflow-hidden rounded-full" style={{ height: 3, background: '#F1F5F9' }}>
            <div className="h-full animate-progress rounded-full" style={{ background: '#22C55E' }} />
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between" style={{ padding: '24px 24px 20px' }}>
            <div className="flex items-center gap-3">
              <GradientAvatar name={me?.user.name ?? ''} src={me?.user.avatarUrl} size={42} />
              <div className="min-w-0">
                <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>{me?.user.name}</p>
                <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.4, marginTop: 2 }}>{me?.user.email}</p>
              </div>
            </div>
          </div>
          <div style={{ height: 1, background: C.page, margin: '0 24px' }} />
          <div style={{ padding: '24px 24px 8px' }}>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: '#F8FAFC', border: `1px solid ${C.border}` }}>
                <LogOut size={15} color={C.muted} strokeWidth={1.8} />
              </div>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>Sign out?</h2>
            </div>
            <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.65, paddingLeft: 48 }}>
              You&apos;ll be signed out of your <span style={{ color: C.slate2, fontWeight: 500 }}>{me?.workspace.name}</span> workspace. You can sign back in anytime.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2.5" style={{ padding: '20px 24px 24px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={state === 'loading'}
              className="flex items-center justify-center rounded-xl transition-all hover:bg-[#F8FAFC] active:scale-[0.98]"
              style={{ fontSize: 13.5, fontWeight: 500, color: C.slate2, border: `1px solid ${C.border}`, background: '#fff', padding: '10px 20px', opacity: state === 'loading' ? 0.5 : 1 }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={signOut}
              disabled={state === 'loading'}
              className="flex items-center justify-center gap-2 rounded-xl transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', background: '#1E293B', padding: '10px 22px', boxShadow: '0 1px 3px rgba(15,23,42,0.20)', minWidth: 112 }}
            >
              {state === 'loading' ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              ) : (
                <>
                  Sign out <ArrowRight size={13} strokeWidth={2.5} />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

const SHORTCUTS = [
  ['⌘ / Ctrl + K', 'Search posts'],
  ['N', 'Create a new post'],
  ['⌘ / Ctrl + Enter', 'Send a reply in the inbox'],
  ['Esc', 'Close dialogs'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} width={420}>
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>Keyboard shortcuts</h2>
        <div className="mt-5 flex flex-col">
          {SHORTCUTS.map(([k, v], i) => (
            <div key={k} className="flex items-center justify-between py-3" style={{ borderTop: i ? `1px solid ${C.line}` : 'none' }}>
              <span style={{ fontSize: 13, color: C.slate }}>{v}</span>
              <kbd style={{ fontSize: 11, fontWeight: 600, color: C.muted, background: '#F1F5F9', border: `1px solid ${C.border2}`, borderRadius: 6, padding: '3px 8px' }}>{k}</kbd>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  const items = [
    { icon: Link2, title: 'Connect your accounts', text: 'Link Instagram, Facebook, LinkedIn, X and YouTube.', href: '/connect' },
    { icon: SquarePen, title: 'Create your first post', text: 'Write once, preview per platform, publish or schedule.', href: '/composer' },
    { icon: BookOpen, title: 'Plans & billing', text: 'Compare plans and manage your subscription.', href: '/settings?tab=billing' },
  ];
  return (
    <Modal open={open} onClose={onClose} width={440}>
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>Help & Support</h2>
        <p style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>Quick links to get the most out of your workspace.</p>
        <div className="mt-5 flex flex-col gap-2">
          {items.map((i) => (
            <Link key={i.title} href={i.href} onClick={onClose} className="flex items-start gap-3 rounded-xl p-3.5 transition-colors hover:bg-[#F8FAFC]" style={{ border: `1px solid ${C.line2}` }}>
              <div className="flex flex-shrink-0 items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: C.blueSoft }}>
                <i.icon size={15} color={C.blue} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{i.title}</p>
                <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{i.text}</p>
              </div>
            </Link>
          ))}
          {support && (
            <a href={`mailto:${support}`} className="flex items-center gap-3 rounded-xl p-3.5 transition-colors hover:bg-[#F8FAFC]" style={{ border: `1px solid ${C.line2}` }}>
              <div className="flex flex-shrink-0 items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: C.greenSoft }}>
                <Mail size={15} color={C.green} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Contact support</p>
                <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{support}</p>
              </div>
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}

const WHATS_NEW = [
  { icon: ShieldCheck, title: 'Two-factor authentication', text: 'Protect your account with an authenticator app and recovery codes.', href: '/settings' },
  { icon: Link2, title: 'Invite by link', text: 'Share one link so teammates can join your workspace with the role you choose.', href: '/settings?tab=team' },
  { icon: BellRing, title: 'Email notifications & weekly report', text: 'Pick email or push per alert, and get an analytics summary every Monday.', href: '/settings?tab=notifications' },
  { icon: KeyRound, title: 'API access', text: 'Create API keys to connect Postly to your own tools.', href: '/settings?tab=integrations' },
  { icon: StickyNote, title: 'Inbox notes & mute', text: 'Leave internal notes on conversations and mute noisy contacts.', href: '/inbox' },
];

export function WhatsNewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} width={460}>
      <div style={{ padding: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>What&apos;s new</h2>
        <p style={{ fontSize: 13, color: C.faint, marginTop: 4 }}>The latest improvements to your workspace.</p>
        <div className="mt-5 flex flex-col gap-2">
          {WHATS_NEW.map((i) => (
            <Link key={i.title} href={i.href} onClick={onClose} className="flex items-start gap-3 rounded-xl p-3.5 transition-colors hover:bg-[#F8FAFC]" style={{ border: `1px solid ${C.line2}` }}>
              <div className="flex flex-shrink-0 items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: C.blueSoft }}>
                <i.icon size={15} color={C.blue} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{i.title}</p>
                <p style={{ fontSize: 12, color: C.faint, marginTop: 2, lineHeight: 1.5 }}>{i.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Modal>
  );
}
