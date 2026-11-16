'use client';

import { Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { APP_NAME, Logo } from '@/components/logo';
import { Btn, Card } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';

export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = encodeURIComponent(params.token);
  const preview = useQuery({
    queryKey: ['invite', params.token],
    queryFn: () => api<{ workspaceName: string; role: string; email: string | null }>(`/auth/invite/${token}`, { noRefresh: true }),
    retry: false,
  });
  const roleLabel = preview.data ? preview.data.role.charAt(0) + preview.data.role.slice(1).toLowerCase() : '';

  async function acceptSignedIn() {
    setLoading(true);
    setError(null);
    try {
      await api('/auth/accept-invite', { method: 'POST', body: { token: params.token }, noRefresh: true });
      router.replace('/dashboard');
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-5" style={{ background: '#F4F6F8' }}>
      <Card className="w-full text-center" style={{ maxWidth: 440, padding: '40px 36px' }}>
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="mx-auto mt-8 flex items-center justify-center rounded-2xl" style={{ width: 56, height: 56, background: C.blueSoft }}>
          <Users size={26} color={C.blue} />
        </div>
        <h1 className="mt-5" style={{ fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>
          {preview.isError ? 'Invitation unavailable' : preview.data ? `Join ${preview.data.workspaceName}` : 'You’ve been invited'}
        </h1>
        <p style={{ fontSize: 13.5, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
          {preview.isError
            ? errorMessage(preview.error)
            : preview.data
              ? `You’ve been invited to collaborate as ${roleLabel === 'Admin' ? 'an' : 'a'} ${roleLabel.toLowerCase()} on posts, inbox and analytics.`
              : `Join your team’s ${APP_NAME} workspace to collaborate on posts, inbox and analytics.`}
        </p>
        {preview.data?.email && (
          <p className="mt-2" style={{ fontSize: 12.5, color: C.faint }}>
            Sent to <span style={{ color: C.slate2, fontWeight: 600 }}>{preview.data.email}</span>
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl px-3 py-2" style={{ fontSize: 13, color: C.red, background: C.redSoft }}>
            {error}
          </p>
        )}
        {!preview.isError && (
          <div className="mt-6 grid gap-2">
            <Btn onClick={() => router.push(`/signup?invite=${token}`)}>Create an account</Btn>
            <Btn variant="outline" onClick={() => router.push(`/login?invite=${token}`)}>
              I already have an account
            </Btn>
            <button onClick={acceptSignedIn} disabled={loading} className="mt-2 transition-opacity hover:opacity-70" style={{ fontSize: 12, color: C.faint }}>
              {loading ? 'Accepting…' : 'Already signed in? Accept now'}
            </button>
          </div>
        )}
        {preview.isError && (
          <div className="mt-6">
            <Btn variant="outline" onClick={() => router.push('/login')}>
              Go to sign in
            </Btn>
          </div>
        )}
      </Card>
    </div>
  );
}
