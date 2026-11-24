'use client';

import { useQuery } from '@tanstack/react-query';
import { Logo } from '@/components/logo';
import { api } from '@/lib/api';
import { C } from '@/lib/design';
import { PlatformGlyph } from '@/lib/platforms';
import type { Provider } from '@/lib/types';

/**
 * Marketing copy shown on the auth screens (from the Figma design).
 * Replace these with your own verified numbers and testimonials before launch.
 */
export const MARKETING = {
  stats: [
    { value: '5,000+', label: 'teams' },
    { value: '2.4M+', label: 'posts published' },
    { value: '4.9 ★', label: 'on G2' },
  ],
  loginQuote: {
    text: '"PostGuru is the only tool our whole social team actually agrees on. Scheduling, inbox, reporting — it just works."',
    name: 'Rohit Gautam',
    role: 'Founder · techSquad',
    initials: 'RG',
    color: '#2563EB',
    tint: '#60A5FA',
  },
  signupQuote: {
    text: `"PostGuru cut our weekly content workflow from 12 hours to under 3. It's the only tool our whole team actually wants to use."`,
    name: 'Homesh',
    role: 'Co-founder · techSquad',
    initials: 'HO',
    color: '#7C3AED',
    tint: '#A78BFA',
  },
  trust: [
    { icon: '🔒', text: 'SOC 2 compliant' },
    { icon: '🛡️', text: 'GDPR ready' },
    { icon: '⭐', text: '4.9 on G2' },
  ],
};

export const CHANNEL_TILES: { provider: Provider; name: string; color: string }[] = [
  { provider: 'INSTAGRAM', name: 'Instagram', color: '#E1306C' },
  { provider: 'LINKEDIN', name: 'LinkedIn', color: '#0A66C2' },
  { provider: 'FACEBOOK', name: 'Facebook', color: '#1877F2' },
  { provider: 'X', name: 'X', color: '#FFFFFF' },
];

export function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function useGoogleEnabled() {
  const { data } = useQuery({ queryKey: ['auth-providers'], queryFn: () => api<{ google: boolean }>('/auth/providers', { noRefresh: true }), staleTime: 5 * 60_000 });
  return data?.google ?? false;
}

export function Quote({ q }: { q: typeof MARKETING.loginQuote }) {
  return (
    <div className="mt-12 rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p style={{ fontSize: 13.5, color: C.faint, lineHeight: 1.65, fontStyle: 'italic' }}>{q.text}</p>
      <div className="mt-4 flex items-center gap-3">
        <div className="flex flex-shrink-0 items-center justify-center rounded-full" style={{ width: 30, height: 30, background: `${q.color}25`, border: `1px solid ${q.color}40` }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: q.tint }}>{q.initials}</span>
        </div>
        <div>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: '#CBD5E1' }}>{q.name}</p>
          <p style={{ fontSize: 11.5, color: C.body }}>{q.role}</p>
        </div>
      </div>
    </div>
  );
}

/** Two-column auth layout: dark marketing panel (desktop) + form column. */
export function AuthShell({ left, children }: { left: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-shrink-0 flex-col lg:flex" style={{ width: 440, background: '#0F172A', padding: '48px 48px' }}>
        <div className="mb-16">
          <Logo size={36} textSize={19} dark />
        </div>
        {left}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center p-6 lg:p-12" style={{ background: '#F4F6F8', overflowY: 'auto' }}>
        <div className="mb-8 lg:hidden">
          <Logo size={34} textSize={18} />
        </div>
        {children}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
          {MARKETING.trust.map((t) => (
            <div key={t.text} className="flex items-center gap-2">
              <span style={{ fontSize: 13 }}>{t.icon}</span>
              <span style={{ fontSize: 12, color: C.faint }}>{t.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChannelGlyph({ provider, color }: { provider: Provider; color: string }) {
  return <PlatformGlyph provider={provider} size={provider === 'X' ? 14 : 16} color={color} />;
}

/** Shared input style with error state (from the design). */
export function authInputStyle(error?: string | null): React.CSSProperties {
  return {
    fontSize: 14,
    background: '#fff',
    border: `1px solid ${error ? '#FCA5A5' : C.border}`,
    borderRadius: 12,
    color: C.ink,
    width: '100%',
    padding: '12px 14px',
    outline: 'none',
    boxShadow: error ? '0 0 0 3px rgba(220,38,38,0.07)' : '0 1px 2px rgba(15,23,42,0.04)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
}

export const authFocus = (e: React.FocusEvent<HTMLInputElement>, error?: string | null) => {
  e.target.style.borderColor = error ? '#EF4444' : C.blue;
  e.target.style.boxShadow = error ? '0 0 0 3px rgba(220,38,38,0.10)' : '0 0 0 3px rgba(37,99,235,0.09)';
};
export const authBlur = (e: React.FocusEvent<HTMLInputElement>, error?: string | null) => {
  e.target.style.borderColor = error ? '#FCA5A5' : C.border;
  e.target.style.boxShadow = error ? '0 0 0 3px rgba(220,38,38,0.07)' : '0 1px 2px rgba(15,23,42,0.04)';
};

export const authLabel: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: C.slate2, display: 'block', marginBottom: 6 };
export const authError: React.CSSProperties = { fontSize: 12, color: C.red, marginTop: 5 };
