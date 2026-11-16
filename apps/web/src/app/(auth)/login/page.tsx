'use client';

import { ArrowLeft, ArrowRight, CircleAlert, CircleCheckBig, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import {
  AuthShell,
  CHANNEL_TILES,
  ChannelGlyph,
  GoogleIcon,
  MARKETING,
  Quote,
  authBlur,
  authError,
  authFocus,
  authInputStyle,
  authLabel,
  useGoogleEnabled,
} from '@/components/auth/auth-shell';
import { APP_NAME } from '@/components/logo';
import { api, ApiError } from '@/lib/api';
import { C } from '@/lib/design';

function LoginLeft() {
  return (
    <>
      <div className="mb-12">
        <h2 style={{ fontSize: 30, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.25 }}>
          Good to see
          <br />
          you again.
        </h2>
        <p style={{ fontSize: 15, color: C.body, marginTop: 14, lineHeight: 1.65 }}>
          Your content is scheduled, your inbox is waiting, and your team is ready. Sign back in and pick up where you left off.
        </p>
      </div>
      <div className="mb-10">
        <p style={{ fontSize: 11, fontWeight: 600, color: C.slate, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>All your channels, one place</p>
        <div className="grid grid-cols-4 gap-2.5">
          {CHANNEL_TILES.map((t) => (
            <div key={t.name} className="flex flex-col items-center gap-2 rounded-xl py-3.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} title={t.name}>
              <ChannelGlyph provider={t.provider} color={t.provider === 'X' ? '#fff' : t.color} />
              <span style={{ fontSize: 10, color: C.body, fontWeight: 500 }}>{t.name}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mb-auto grid grid-cols-3 gap-4">
        {MARKETING.stats.map((s) => (
          <div key={s.label} className="rounded-xl px-3 py-4 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontSize: 11, color: C.body, marginTop: 5, lineHeight: 1.3 }}>{s.label}</p>
          </div>
        ))}
      </div>
      <Quote q={MARKETING.loginQuote} />
    </>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const invite = params.get('invite') ?? undefined;
  const googleEnabled = useGoogleEnabled();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(params.get('error'));
  const [badCreds, setBadCreds] = useState(false);
  // Two-step verification: set after a password (or Google) login on an account with 2FA.
  const [mfa, setMfa] = useState(params.get('mfa') === '1');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  const goNext = () => {
    const next = params.get('next');
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
    router.refresh();
  };

  const errors: Record<string, string> = {};
  if (!email.trim()) errors.email = 'Email address is required.';
  else if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) errors.email = 'Please enter a valid email address.';
  if (!password) errors.password = 'Password is required.';
  const err = (f: string) => ((touched[f] || submitted) ? errors[f] : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFailure(null);
    if (Object.keys(errors).length) return;
    setLoading(true);
    try {
      const res = await api<{ mfaRequired?: boolean }>('/auth/login', { method: 'POST', body: { email, password, inviteToken: invite }, noRefresh: true });
      if (res?.mfaRequired) {
        setMfa(true);
        setLoading(false);
        return;
      }
      goNext();
    } catch (error) {
      const wrong = error instanceof ApiError && error.status === 401;
      setBadCreds(wrong);
      setFailure(wrong ? 'Incorrect email or password' : (error as Error).message);
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setFailure(null);
    const value = code.trim();
    if (useRecovery ? value.length < 8 : !/^\d{6}$/.test(value.replace(/\s/g, ''))) {
      setFailure(useRecovery ? 'Enter one of your recovery codes, e.g. k7m2-9xqp.' : 'Enter the 6-digit code from your authenticator app.');
      return;
    }
    setLoading(true);
    try {
      await api('/auth/login/2fa', { method: 'POST', body: { code: value }, noRefresh: true });
      goNext();
    } catch (error) {
      setFailure((error as Error).message);
      setLoading(false);
      if (error instanceof ApiError && /expired|sign in again/i.test(error.message)) {
        setMfa(false);
        setCode('');
      }
    }
  }

  const forgotHref = `/forgot-password${/^[^@]+@[^@]+\.[^@]+$/.test(email) ? `?email=${encodeURIComponent(email)}` : ''}`;

  if (mfa) {
    return (
      <AuthShell left={<LoginLeft />}>
        <div className="w-full rounded-2xl bg-white" style={{ maxWidth: 448, boxShadow: '0 2px 16px rgba(15,23,42,0.07), 0 1px 4px rgba(15,23,42,0.04)', padding: 'clamp(28px, 5vw, 40px) clamp(22px, 5vw, 44px)' }}>
          <div className="mb-7 flex items-center justify-center rounded-2xl" style={{ width: 48, height: 48, background: C.blueSoft, border: `1px solid ${C.blueBorder}` }}>
            <ShieldCheck size={22} color={C.blue} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.2 }}>Two-step verification</h1>
          <p style={{ fontSize: 13.5, color: C.muted, marginTop: 7, lineHeight: 1.55 }}>
            {useRecovery ? 'Enter one of the recovery codes you saved when you turned on two-factor authentication.' : 'Enter the 6-digit code from your authenticator app to finish signing in.'}
          </p>
          {failure && (
            <div className="mt-5 flex items-start gap-3 rounded-xl" style={{ padding: '12px 14px', background: C.redSoft, border: `1px solid ${C.redBorder}` }}>
              <CircleAlert size={15} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: C.red }}>{failure}</p>
            </div>
          )}
          <form onSubmit={verify} noValidate className="mt-6 flex flex-col gap-4">
            <div>
              <label style={authLabel}>{useRecovery ? 'Recovery code' : 'Authentication code'}</label>
              <input
                autoFocus
                value={code}
                onChange={(e) => {
                  setCode(useRecovery ? e.target.value : e.target.value.replace(/[^\d]/g, '').slice(0, 6));
                  setFailure(null);
                }}
                onFocus={(e) => authFocus(e)}
                onBlur={(e) => authBlur(e)}
                placeholder={useRecovery ? 'xxxx-xxxx' : '123456'}
                inputMode={useRecovery ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                style={{ ...authInputStyle(), fontSize: useRecovery ? 15 : 20, letterSpacing: useRecovery ? '0.05em' : '0.4em', textAlign: 'center', fontWeight: 600 }}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: C.blue, padding: '13px 16px', opacity: loading ? 0.75 : 1, boxShadow: '0 1px 3px rgba(37,99,235,0.25)' }}
            >
              {loading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <>Verify and sign in <ArrowRight size={15} strokeWidth={2.5} /></>}
            </button>
          </form>
          <div className="mt-5 flex items-center justify-between">
            <button type="button" onClick={() => { setMfa(false); setCode(''); setFailure(null); }} className="flex items-center gap-1.5 transition-opacity hover:opacity-70" style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>
              <ArrowLeft size={13} /> Back to sign in
            </button>
            <button type="button" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setFailure(null); }} className="transition-opacity hover:opacity-70" style={{ fontSize: 13, color: C.blue, fontWeight: 500 }}>
              {useRecovery ? 'Use authenticator app' : 'Use a recovery code'}
            </button>
          </div>
        </div>
      </AuthShell>
    );
  }

  function google() {
    if (!googleEnabled) return toast.error('Google sign-in is not configured on the server.');
    setLoading(true);
    const next = params.get('next') ?? '/dashboard';
    window.location.href = `/api/auth/google?next=${encodeURIComponent(next)}`;
  }

  return (
    <AuthShell left={<LoginLeft />}>
      <div className="w-full rounded-2xl bg-white" style={{ maxWidth: 448, boxShadow: '0 2px 16px rgba(15,23,42,0.07), 0 1px 4px rgba(15,23,42,0.04)', padding: 'clamp(28px, 5vw, 40px) clamp(22px, 5vw, 44px)' }}>
        <div className="mb-8">
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.2 }}>Welcome back</h1>
          <p style={{ fontSize: 13.5, color: C.muted, marginTop: 7, lineHeight: 1.55 }}>
            {invite ? 'Sign in to accept your invitation.' : `Sign in to your ${APP_NAME} workspace.`}
          </p>
        </div>

        <button
          type="button"
          onClick={google}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl transition-all hover:bg-[#F8FAFC] active:scale-[0.99]"
          style={{ fontSize: 13.5, fontWeight: 500, color: C.slate, border: `1px solid ${C.border}`, background: '#fff', padding: '12px 16px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', opacity: loading ? 0.6 : 1 }}
        >
          <GoogleIcon /> Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: C.line2 }} />
          <span style={{ fontSize: 12, color: C.faint2, fontWeight: 500 }}>or sign in with email</span>
          <div className="h-px flex-1" style={{ background: C.line2 }} />
        </div>

        {failure && (
          <div className="mb-5 flex items-start gap-3 rounded-xl" style={{ padding: '12px 14px', background: C.redSoft, border: `1px solid ${C.redBorder}` }}>
            <CircleAlert size={15} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.red }}>{failure}</p>
              <p style={{ fontSize: 12, color: '#EF4444', marginTop: 2, lineHeight: 1.5 }}>
                Please check your credentials and try again.{' '}
                {badCreds && (
                  <button type="button" onClick={() => router.push(forgotHref)} style={{ color: C.red, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2 }} className="transition-opacity hover:opacity-70">
                    Reset password
                  </button>
                )}
              </p>
            </div>
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <div className="flex flex-col gap-4">
            <div>
              <label style={authLabel}>Work email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setFailure(null);
                  setBadCreds(false);
                }}
                onFocus={(e) => authFocus(e, err('email'))}
                onBlur={(e) => {
                  setTouched((t) => ({ ...t, email: true }));
                  authBlur(e, errors.email);
                }}
                placeholder="you@company.com"
                style={authInputStyle(err('email'))}
                autoComplete="email"
                disabled={loading}
              />
              {err('email') && <p style={authError}>{err('email')}</p>}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label style={{ ...authLabel, marginBottom: 0 }}>Password</label>
                <button
                  type="button"
                  onClick={() => router.push(forgotHref)}
                  className="transition-opacity hover:opacity-70"
                  style={{ fontSize: 12.5, color: C.blue, fontWeight: 500 }}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFailure(null);
                  }}
                  onFocus={(e) => authFocus(e, err('password'))}
                  onBlur={(e) => {
                    setTouched((t) => ({ ...t, password: true }));
                    authBlur(e, errors.password);
                  }}
                  placeholder="Enter your password"
                  style={{ ...authInputStyle(err('password')), paddingRight: 44 }}
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70" style={{ color: C.faint2 }} tabIndex={-1} aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {err('password') && <p style={authError}>{err('password')}</p>}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: C.blue, padding: '13px 16px', opacity: loading ? 0.75 : 1, boxShadow: '0 1px 3px rgba(37,99,235,0.25)' }}
            >
              {loading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <>Sign in <ArrowRight size={15} strokeWidth={2.5} /></>}
            </button>
          </div>
        </form>

        {invite && (
          <div className="mt-5 flex items-center gap-2.5 rounded-xl" style={{ padding: '10px 13px', background: '#F8FAFC', border: `1px solid ${C.line2}` }}>
            <CircleCheckBig size={13} style={{ color: C.faint, flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: C.faint, lineHeight: 1.45 }}>You&apos;ll join the workspace you were invited to after signing in.</p>
          </div>
        )}

        <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${C.page}` }}>
          <p style={{ fontSize: 13.5, color: C.faint, textAlign: 'center' }}>
            Don&apos;t have an account?{' '}
            <button type="button" onClick={() => router.push(invite ? `/signup?invite=${encodeURIComponent(invite)}` : '/signup')} style={{ color: C.blue, fontWeight: 600 }} className="transition-opacity hover:opacity-70">
              Create one free
            </button>
          </p>
        </div>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
