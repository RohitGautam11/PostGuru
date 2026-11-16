'use client';

import { ArrowLeft, ArrowRight, CircleAlert, MailCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell, authBlur, authError, authFocus, authInputStyle, authLabel } from '@/components/auth/auth-shell';
import { RecoveryLeft } from '@/components/auth/recovery-left';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';

const card = { maxWidth: 448, boxShadow: '0 2px 16px rgba(15,23,42,0.07), 0 1px 4px rgba(15,23,42,0.04)', padding: 'clamp(28px, 5vw, 40px) clamp(22px, 5vw, 44px)' };
const validEmail = (v: string) => /^[^@]+@[^@]+\.[^@]+$/.test(v);

function ForgotForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const fieldError = !email.trim() ? 'Email address is required.' : !validEmail(email) ? 'Please enter a valid email address.' : undefined;
  const err = touched ? fieldError : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setFailure(null);
    if (fieldError) return;
    setLoading(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email }, noRefresh: true });
      setSent(true);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell left={<RecoveryLeft />}>
      <div className="w-full rounded-2xl bg-white" style={card}>
        {sent ? (
          <div className="text-center">
            <div className="mx-auto mb-6 flex items-center justify-center rounded-full" style={{ width: 56, height: 56, background: C.greenSoft, border: `1.5px solid ${C.greenBorder}` }}>
              <MailCheck size={24} color={C.green} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.025em' }}>Check your email</h1>
            <p style={{ fontSize: 13.5, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
              If an account exists for <span style={{ color: C.slate2, fontWeight: 600 }}>{email}</span>, you&apos;ll receive a link to reset your password. The link expires in 1 hour.
            </p>
            <p style={{ fontSize: 12.5, color: C.faint, marginTop: 14, lineHeight: 1.55 }}>Didn&apos;t get it? Check your spam folder, or try again in a few minutes.</p>
            <div className="mt-7 grid gap-2">
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="flex w-full items-center justify-center gap-2 rounded-xl transition-all hover:opacity-90"
                style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: C.blue, padding: '13px 16px' }}
              >
                Back to sign in
              </button>
              <button type="button" onClick={() => setSent(false)} className="transition-opacity hover:opacity-70" style={{ fontSize: 13, color: C.muted, fontWeight: 500, padding: 8 }}>
                Use a different email
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, letterSpacing: '-0.025em', lineHeight: 1.2 }}>Reset your password</h1>
              <p style={{ fontSize: 13.5, color: C.muted, marginTop: 7, lineHeight: 1.55 }}>Enter the email you use for your workspace and we&apos;ll send you a reset link.</p>
            </div>
            {failure && (
              <div className="mb-5 flex items-start gap-3 rounded-xl" style={{ padding: '12px 14px', background: C.redSoft, border: `1px solid ${C.redBorder}` }}>
                <CircleAlert size={15} style={{ color: C.red, flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: C.red }}>{failure}</p>
              </div>
            )}
            <form onSubmit={submit} noValidate className="flex flex-col gap-4">
              <div>
                <label style={authLabel}>Work email</label>
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={(e) => authFocus(e, err)}
                  onBlur={(e) => {
                    setTouched(true);
                    authBlur(e, fieldError);
                  }}
                  placeholder="you@company.com"
                  autoComplete="email"
                  style={authInputStyle(err)}
                  disabled={loading}
                />
                {err && <p style={authError}>{err}</p>}
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl transition-all hover:opacity-90 active:scale-[0.99]"
                style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: C.blue, padding: '13px 16px', opacity: loading ? 0.75 : 1, boxShadow: '0 1px 3px rgba(37,99,235,0.25)' }}
              >
                {loading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <>Send reset link <ArrowRight size={15} strokeWidth={2.5} /></>}
              </button>
            </form>
            <div className="mt-6 pt-5" style={{ borderTop: `1px solid ${C.page}` }}>
              <button type="button" onClick={() => router.push('/login')} className="mx-auto flex items-center gap-1.5 transition-opacity hover:opacity-70" style={{ fontSize: 13.5, color: C.blue, fontWeight: 600 }}>
                <ArrowLeft size={14} /> Back to sign in
              </button>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotForm />
    </Suspense>
  );
}
