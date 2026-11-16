'use client';

import { ArrowRight, BarChart3, CalendarDays, Check, CircleAlert, CircleCheckBig, Eye, EyeOff, MessageSquare, Users } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { AuthShell, GoogleIcon, MARKETING, Quote, authBlur, authError, authFocus, authInputStyle, authLabel, useGoogleEnabled } from '@/components/auth/auth-shell';
import { APP_NAME } from '@/components/logo';
import { api } from '@/lib/api';
import { C } from '@/lib/design';

const FEATURES = [
  { icon: CalendarDays, label: 'Schedule posts', sub: 'Plan and auto-publish across every channel.' },
  { icon: MessageSquare, label: 'Unified inbox', sub: 'Comments, DMs, and mentions in one place.' },
  { icon: BarChart3, label: 'Analytics', sub: 'Track reach, engagement, and growth.' },
  { icon: Users, label: 'Team collaboration', sub: 'Roles, assignments and shared inbox for your team.' },
];

function strength(pw: string) {
  if (!pw) return { score: 0, label: '', color: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return (
    [
      { score: 1, label: 'Weak', color: C.red },
      { score: 2, label: 'Fair', color: C.amber },
      { score: 3, label: 'Good', color: C.green },
      { score: 4, label: 'Strong', color: C.green },
    ][s - 1] ?? { score: 0, label: '', color: '' }
  );
}

function SignupLeft() {
  return (
    <>
      <div className="mb-12">
        <h2 style={{ fontSize: 30, fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.25 }}>
          Your social media,
          <br />
          finally under control.
        </h2>
        <p style={{ fontSize: 15, color: C.muted, marginTop: 14, lineHeight: 1.65 }}>Schedule, engage, and analyse — all in one calm, focused workspace built for teams.</p>
      </div>
      <div className="mb-auto flex flex-col gap-5">
        {FEATURES.map((f) => (
          <div key={f.label} className="flex items-start gap-4">
            <div className="mt-0.5 flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <f.icon size={15} color="#60A5FA" strokeWidth={1.8} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#E2E8F0', lineHeight: 1.3 }}>{f.label}</p>
              <p style={{ fontSize: 12.5, color: C.body, marginTop: 3, lineHeight: 1.5 }}>{f.sub}</p>
            </div>
          </div>
        ))}
      </div>
      <Quote q={MARKETING.signupQuote} />
    </>
  );
}

function Field({ label, error, children }: { label: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={authLabel}>{label}</label>
      {children}
      {error && <p style={authError}>{error}</p>}
    </div>
  );
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const invite = params.get('invite') ?? undefined;
  const googleEnabled = useGoogleEnabled();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'success'>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const meter = strength(password);

  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = 'Full name is required.';
  else if (name.trim().length < 2) errors.name = 'Please enter your full name.';
  if (!email.trim()) errors.email = 'Work email is required.';
  else if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) errors.email = 'Please enter a valid email address.';
  if (!password) errors.password = 'Password is required.';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Use at least one letter and one number.';
  if (!confirm) errors.confirm = 'Please confirm your password.';
  else if (confirm !== password) errors.confirm = 'Passwords do not match.';
  const err = (f: string) => ((touched[f] || submitted) ? errors[f] : undefined);
  const blur = (f: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    setTouched((t) => ({ ...t, [f]: true }));
    authBlur(e, errors[f]);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    if (Object.keys(errors).length) return;
    setState('loading');
    try {
      await api('/auth/register', {
        method: 'POST',
        body: { name, email, password, workspaceName: company || undefined, inviteToken: invite },
        noRefresh: true,
      });
      setState('success');
    } catch (error) {
      setServerError((error as Error).message);
      setState('idle');
    }
  }

  if (state === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: '#F4F6F8' }}>
        <div className="text-center" style={{ maxWidth: 440 }}>
          <div className="mx-auto mb-6 flex items-center justify-center rounded-full" style={{ width: 72, height: 72, background: C.greenSoft, border: `2px solid ${C.greenBorder}` }}>
            <CircleCheckBig size={32} color={C.green} />
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: '-0.03em' }}>Account created!</h2>
          <p style={{ fontSize: 15, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
            Welcome to {APP_NAME}
            {name ? `, ${name.split(' ')[0]}` : ''}. {invite ? 'You have joined your team’s workspace.' : 'Connect your first social account to get started.'}
          </p>
          <button
            onClick={() => {
              router.replace(invite ? '/dashboard' : '/connect');
              router.refresh();
            }}
            className="mx-auto mt-8 flex items-center justify-center gap-2 rounded-xl px-6 py-3 transition-all hover:opacity-90"
            style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: C.blue }}
          >
            {invite ? 'Go to dashboard' : 'Connect accounts'} <ArrowRight size={15} strokeWidth={2.5} />
          </button>
          {!invite && (
            <button onClick={() => router.replace('/dashboard')} className="mx-auto mt-4 block transition-opacity hover:opacity-70" style={{ fontSize: 13, color: C.faint }}>
              Skip to dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  const loading = state === 'loading';
  const input = (f: string, extra?: React.CSSProperties) => ({ ...authInputStyle(err(f)), padding: '11px 14px', ...extra });
  const terms = process.env.NEXT_PUBLIC_TERMS_URL;
  const privacy = process.env.NEXT_PUBLIC_PRIVACY_URL;

  return (
    <AuthShell left={<SignupLeft />}>
      <div className="w-full rounded-2xl bg-white" style={{ maxWidth: 488, boxShadow: '0 2px 16px rgba(15,23,42,0.07), 0 1px 4px rgba(15,23,42,0.04)', padding: 'clamp(28px, 5vw, 40px) clamp(22px, 5vw, 44px)' }}>
        <div className="mb-8">
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.2 }}>Create your account</h1>
          <p style={{ fontSize: 13.5, color: C.muted, marginTop: 7, lineHeight: 1.55 }}>
            {invite ? 'Join your team’s workspace.' : 'Start on the free plan. No credit card required.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!googleEnabled) return toast.error('Google sign-in is not configured on the server.');
            window.location.href = '/api/auth/google?next=/connect';
          }}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl transition-all hover:bg-[#F8FAFC] active:scale-[0.99]"
          style={{ fontSize: 13.5, fontWeight: 500, color: C.slate, border: `1px solid ${C.border}`, background: '#fff', padding: '11px 16px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}
        >
          <GoogleIcon /> Continue with Google
        </button>
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: C.line2 }} />
          <span style={{ fontSize: 12, color: C.faint2, fontWeight: 500 }}>or sign up with email</span>
          <div className="h-px flex-1" style={{ background: C.line2 }} />
        </div>

        {serverError && (
          <div className="mb-5 flex items-start gap-3 rounded-xl" style={{ padding: '12px 14px', background: C.redSoft, border: `1px solid ${C.redBorder}` }}>
            <CircleAlert size={15} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
            <p className="whitespace-pre-line" style={{ fontSize: 13, fontWeight: 600, color: C.red }}>
              {serverError}
            </p>
          </div>
        )}

        <form onSubmit={submit} noValidate>
          <div className="flex flex-col gap-4">
            <Field label="Full name" error={err('name')}>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => authFocus(e, err('name'))} onBlur={blur('name')} placeholder="Jamie Wilson" style={input('name')} autoComplete="name" />
            </Field>
            <Field label="Work email" error={err('email')}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onFocus={(e) => authFocus(e, err('email'))} onBlur={blur('email')} placeholder="jamie@acmecorp.com" style={input('email')} autoComplete="email" />
            </Field>
            {!invite && (
              <Field
                label={
                  <span>
                    Company <span style={{ color: C.faint2, fontWeight: 400 }}>— optional</span>
                  </span>
                }
              >
                <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} onFocus={(e) => authFocus(e)} onBlur={(e) => authBlur(e)} placeholder="Acme Corp" style={input('company')} autoComplete="organization" maxLength={80} />
              </Field>
            )}
            <Field label="Password" error={err('password')}>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} onFocus={(e) => authFocus(e, err('password'))} onBlur={blur('password')} placeholder="Min. 8 characters" style={input('password', { paddingRight: 44 })} autoComplete="new-password" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70" style={{ color: C.faint2 }} aria-label="Toggle password visibility">
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2.5">
                  <div className="mb-1.5 flex items-center gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="flex-1 rounded-full transition-all duration-300" style={{ height: 3, background: n <= meter.score ? meter.color : C.line2 }} />
                    ))}
                  </div>
                  {meter.label && <p style={{ fontSize: 11.5, color: meter.color, fontWeight: 500 }}>{meter.label} password</p>}
                </div>
              )}
            </Field>
            <Field label="Confirm password" error={err('confirm')}>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onFocus={(e) => authFocus(e, err('confirm'))}
                  onBlur={blur('confirm')}
                  placeholder="Re-enter password"
                  style={input('confirm', { paddingRight: confirm && confirm === password ? 72 : 44 })}
                  autoComplete="new-password"
                />
                {confirm && confirm === password && (
                  <div className="absolute right-10 top-1/2 -translate-y-1/2" style={{ color: C.green }}>
                    <Check size={14} strokeWidth={2.5} />
                  </div>
                )}
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70" style={{ color: C.faint2 }} aria-label="Toggle password visibility">
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </Field>
            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl transition-all hover:opacity-90 active:scale-[0.99]"
              style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: C.blue, padding: '13px 16px', opacity: loading ? 0.75 : 1, boxShadow: '0 1px 3px rgba(37,99,235,0.25)' }}
            >
              {loading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <>Create account <ArrowRight size={15} strokeWidth={2.5} /></>}
            </button>
          </div>
        </form>

        <p style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
          By creating an account you agree to our{' '}
          <a href={terms || '#'} target={terms ? '_blank' : undefined} rel="noreferrer" style={{ color: C.muted, fontWeight: 500 }} className="underline underline-offset-2 transition-opacity hover:opacity-70">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href={privacy || '#'} target={privacy ? '_blank' : undefined} rel="noreferrer" style={{ color: C.muted, fontWeight: 500 }} className="underline underline-offset-2 transition-opacity hover:opacity-70">
            Privacy Policy
          </a>
          .
        </p>
        <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${C.page}` }}>
          <p style={{ fontSize: 13.5, color: C.faint, textAlign: 'center' }}>
            Already have an account?{' '}
            <button onClick={() => router.push(invite ? `/login?invite=${encodeURIComponent(invite)}` : '/login')} style={{ color: C.blue, fontWeight: 600 }} className="transition-opacity hover:opacity-70">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
