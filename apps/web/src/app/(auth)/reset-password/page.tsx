'use client';

import { ArrowRight, CircleAlert, CircleCheck, Eye, EyeOff } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell, authBlur, authError, authFocus, authInputStyle, authLabel } from '@/components/auth/auth-shell';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';
import { RecoveryLeft } from '@/components/auth/recovery-left';

const card = { maxWidth: 448, boxShadow: '0 2px 16px rgba(15,23,42,0.07), 0 1px 4px rgba(15,23,42,0.04)', padding: 'clamp(28px, 5vw, 40px) clamp(22px, 5vw, 44px)' };

const RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Contains a letter', test: (p: string) => /[A-Za-z]/.test(p) },
  { label: 'Contains a number', test: (p: string) => /\d/.test(p) },
];

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(token ? null : 'This reset link is incomplete. Open the link from your email again, or request a new one.');

  const pwError = submitted && !RULES.every((r) => r.test(password)) ? 'Password does not meet the requirements below.' : undefined;
  const confirmError = submitted && confirm !== password ? 'Passwords do not match.' : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setFailure(null);
    if (!token || !RULES.every((r) => r.test(password)) || confirm !== password) return;
    setLoading(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password }, noRefresh: true });
      setDone(true);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell left={<RecoveryLeft />}>
      <div className="w-full rounded-2xl bg-white" style={card}>
        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-6 flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: C.greenSoft, border: `1.5px solid ${C.greenBorder}` }}>
              <CircleCheck size={24} color={C.green} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.025em' }}>Password updated</h1>
            <p style={{ fontSize: 13.5, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
              Your password has been changed and you&apos;ve been signed out of other devices. Sign in with your new password.
            </p>
            <button
              type="button"
              onClick={() => router.replace('/login')}
              className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl transition-all hover:opacity-90"
              style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: C.blue, padding: '13px 16px' }}
            >
              Sign in <ArrowRight size={15} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.2 }}>Choose a new password</h1>
              <p style={{ fontSize: 13.5, color: C.muted, marginTop: 7, lineHeight: 1.55 }}>Pick something you haven&apos;t used before.</p>
            </div>
            {failure && (
              <div className="mb-5 flex items-start gap-3 rounded-xl" style={{ padding: '12px 14px', background: C.redSoft, border: `1px solid ${C.redBorder}` }}>
                <CircleAlert size={15} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.red }}>{failure}</p>
                  <button type="button" onClick={() => router.push('/forgot-password')} style={{ fontSize: 12, color: C.red, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 2, marginTop: 2 }} className="transition-opacity hover:opacity-70">
                    Request a new link
                  </button>
                </div>
              </div>
            )}
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <div>
                <label style={authLabel}>New password</label>
                <div className="relative">
                  <input
                    type={show ? 'text' : 'password'}
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={(e) => authFocus(e, pwError)}
                    onBlur={(e) => authBlur(e, pwError)}
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                    style={{ ...authInputStyle(pwError), paddingRight: 44 }}
                    disabled={loading || !token}
                  />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-70" style={{ color: C.faint2 }} tabIndex={-1} aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {pwError && <p style={authError}>{pwError}</p>}
                <ul className="mt-2.5 flex flex-col gap-1">
                  {RULES.map((r) => {
                    const met = r.test(password);
                    return (
                      <li key={r.label} className="flex items-center gap-2" style={{ fontSize: 12, color: met ? C.green : C.faint }}>
                        <CircleCheck size={12} color={met ? C.green : '#CBD5E1'} /> {r.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <label style={authLabel}>Confirm new password</label>
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onFocus={(e) => authFocus(e, confirmError)}
                  onBlur={(e) => authBlur(e, confirmError)}
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
                  style={authInputStyle(confirmError)}
                  disabled={loading || !token}
                />
                {confirmError && <p style={authError}>{confirmError}</p>}
              </div>
              <button
                type="submit"
                disabled={loading || !token}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl transition-all hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed"
                style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: token ? C.blue : '#CBD5E1', padding: '13px 16px', opacity: loading ? 0.75 : 1 }}
              >
                {loading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <>Update password <ArrowRight size={15} strokeWidth={2.5} /></>}
              </button>
            </form>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
