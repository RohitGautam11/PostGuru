'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Copy, Download, KeyRound, Shield, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { APP_NAME } from '@/components/logo';
import { Btn, FieldLabel, Modal, Spinner, TextInput } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';

interface Status {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
}
interface Setup {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
}

const useStatus = () => useQuery({ queryKey: ['2fa'], queryFn: () => api<Status>('/users/me/2fa') });

/** "Two-factor authentication" row of Settings → Profile → Password & Security. */
export function TwoFactorRow() {
  const { data } = useStatus();
  const [open, setOpen] = useState(false);
  const enabled = !!data?.enabled;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 py-4" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-3">
          <Shield size={16} color={enabled ? C.green : C.faint} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Two-factor authentication</p>
            <p style={{ fontSize: 13, color: enabled ? C.green : C.faint, marginTop: 2 }}>
              {!data ? 'Checking…' : enabled ? 'Enabled via authenticator app' : 'Off — add a second step when signing in'}
            </p>
          </div>
        </div>
        <Btn variant="outline" onClick={() => setOpen(true)} disabled={!data}>
          {enabled ? 'Manage' : 'Enable'}
        </Btn>
      </div>
      {data && (enabled ? <ManageDialog open={open} onClose={() => setOpen(false)} status={data} /> : <SetupDialog open={open} onClose={() => setOpen(false)} />)}
    </>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const text = codes.join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${APP_NAME} recovery codes\nEach code can be used once.\n\n${text}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${APP_NAME.toLowerCase()}-recovery-codes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl p-4 font-mono" style={{ background: '#F8FAFC', border: `1px solid ${C.line2}`, fontSize: 13.5, color: C.ink }}>
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Btn variant="soft" size="sm" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('Recovery codes copied'))}>
          <Copy size={12} /> Copy
        </Btn>
        <Btn variant="outline" size="sm" onClick={download}>
          <Download size={12} /> Download
        </Btn>
      </div>
    </div>
  );
}

function SetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const setup = useQuery({
    queryKey: ['2fa', 'setup'],
    queryFn: () => api<Setup>('/users/me/2fa/setup', { method: 'POST' }),
    enabled: open && !codes,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const enable = useMutation({
    mutationFn: () => api<{ recoveryCodes: string[] }>('/users/me/2fa/enable', { method: 'POST', body: { code } }),
    onSuccess: (r) => {
      setCodes(r.recoveryCodes);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const close = () => {
    if (codes) qc.invalidateQueries({ queryKey: ['2fa'] });
    setCode('');
    setCodes(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={close} width={480} closable={!codes}>
      <div style={{ padding: 24 }}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: codes ? C.greenSoft : C.blueSoft }}>
            {codes ? <ShieldCheck size={16} color={C.green} /> : <Shield size={16} color={C.blue} />}
          </div>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>{codes ? 'Two-factor authentication is on' : 'Set up two-factor authentication'}</h2>
        </div>

        {codes ? (
          <>
            <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
              Save these recovery codes somewhere safe. If you lose your phone, each code lets you sign in once. They won&apos;t be shown again.
            </p>
            <RecoveryCodes codes={codes} />
            <div className="mt-6 flex justify-end">
              <Btn onClick={close}>I&apos;ve saved my codes</Btn>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\d{6}$/.test(code)) enable.mutate();
            }}
          >
            <ol className="flex flex-col gap-1.5" style={{ fontSize: 13.5, color: C.body, lineHeight: 1.55, paddingLeft: 18, listStyle: 'decimal' }}>
              <li>Open an authenticator app such as Google Authenticator, 1Password or Authy.</li>
              <li>Scan the QR code, or enter the setup key manually.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="mt-5 flex flex-col items-center gap-4 rounded-xl p-5 sm:flex-row sm:items-start" style={{ background: '#FAFBFD', border: `1px solid ${C.line2}` }}>
              <div className="flex flex-shrink-0 items-center justify-center rounded-xl bg-white" style={{ width: 152, height: 152, border: `1px solid ${C.line2}` }}>
                {setup.isLoading ? <Spinner /> : setup.data ? <img src={setup.data.qrDataUrl} alt="QR code for your authenticator app" width={140} height={140} /> : <span style={{ fontSize: 12, color: C.red, padding: 12, textAlign: 'center' }}>{errorMessage(setup.error)}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <FieldLabel>Setup key</FieldLabel>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2" style={{ fontSize: 12.5, color: C.ink, border: `1px solid ${C.border3}`, letterSpacing: '0.04em' }}>
                    {setup.data?.secret.replace(/(.{4})/g, '$1 ').trim() ?? '…'}
                  </code>
                  <button
                    type="button"
                    disabled={!setup.data}
                    onClick={() => setup.data && navigator.clipboard.writeText(setup.data.secret).then(() => toast.success('Setup key copied'))}
                    className="flex flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-white"
                    style={{ width: 34, height: 34, border: `1px solid ${C.border3}` }}
                    aria-label="Copy setup key"
                  >
                    <Copy size={13} color={C.muted} />
                  </button>
                </div>
                <div className="mt-4">
                  <FieldLabel>Verification code</FieldLabel>
                  <TextInput
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    style={{ letterSpacing: '0.3em', fontWeight: 600, fontSize: 15 }}
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <Btn type="button" variant="outline" onClick={close}>
                Cancel
              </Btn>
              <Btn type="submit" loading={enable.isPending} disabled={code.length !== 6 || !setup.data}>
                Verify and enable
              </Btn>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

function ManageDialog({ open, onClose, status }: { open: boolean; onClose: () => void; status: Status }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'view' | 'disable' | 'regenerate'>('view');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const reset = () => {
    setMode('view');
    setCode('');
  };
  const close = () => {
    reset();
    setCodes(null);
    onClose();
  };
  const disable = useMutation({
    mutationFn: () => api('/users/me/2fa/disable', { method: 'POST', body: { code } }),
    onSuccess: () => {
      toast.success('Two-factor authentication turned off');
      qc.invalidateQueries({ queryKey: ['2fa'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      close();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const regenerate = useMutation({
    mutationFn: () => api<{ recoveryCodes: string[] }>('/users/me/2fa/recovery-codes', { method: 'POST', body: { code } }),
    onSuccess: (r) => {
      setCodes(r.recoveryCodes);
      reset();
      qc.invalidateQueries({ queryKey: ['2fa'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal open={open} onClose={close} width={460}>
      <div style={{ padding: 24 }}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex flex-shrink-0 items-center justify-center rounded-xl" style={{ width: 36, height: 36, background: C.greenSoft }}>
            <ShieldCheck size={16} color={C.green} />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>Two-factor authentication</h2>
            {status.enabledAt && <p style={{ fontSize: 12.5, color: C.faint, marginTop: 2 }}>Enabled {format(new Date(status.enabledAt), 'MMM d, yyyy')} · authenticator app</p>}
          </div>
        </div>

        {codes ? (
          <>
            <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>Your new recovery codes are below. Your old codes no longer work.</p>
            <RecoveryCodes codes={codes} />
            <div className="mt-6 flex justify-end">
              <Btn onClick={close}>Done</Btn>
            </div>
          </>
        ) : mode === 'view' ? (
          <>
            <div className="flex items-center justify-between rounded-xl px-4 py-3.5" style={{ background: '#FAFBFD', border: `1px solid ${C.line2}` }}>
              <div className="flex items-center gap-2.5">
                <KeyRound size={14} color={C.muted} />
                <span style={{ fontSize: 13.5, color: C.body }}>Recovery codes remaining</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: status.recoveryCodesLeft <= 2 ? C.amber : C.ink }}>{status.recoveryCodesLeft} / 10</span>
            </div>
            {status.recoveryCodesLeft <= 2 && <p style={{ fontSize: 12.5, color: C.amber, marginTop: 8 }}>You&apos;re running low — generate a new set.</p>}
            <div className="mt-6 flex flex-wrap justify-between gap-2.5">
              <Btn variant="dangerSoft" onClick={() => setMode('disable')}>
                Turn off
              </Btn>
              <div className="flex gap-2.5">
                <Btn variant="outline" onClick={() => setMode('regenerate')}>
                  New recovery codes
                </Btn>
                <Btn onClick={close}>Done</Btn>
              </div>
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim().length < 6) return;
              (mode === 'disable' ? disable : regenerate).mutate();
            }}
          >
            <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6 }}>
              {mode === 'disable'
                ? 'Enter a code from your authenticator app (or a recovery code) to turn off two-factor authentication.'
                : 'Enter a code from your authenticator app to generate a new set of recovery codes.'}
            </p>
            <div className="mt-4">
              <FieldLabel>Code</FieldLabel>
              <TextInput autoFocus autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.slice(0, 20))} />
            </div>
            <div className="mt-6 flex justify-end gap-2.5">
              <Btn type="button" variant="outline" onClick={reset}>
                Back
              </Btn>
              <Btn type="submit" variant={mode === 'disable' ? 'danger' : 'primary'} loading={disable.isPending || regenerate.isPending} disabled={code.trim().length < 6}>
                {mode === 'disable' ? 'Turn off 2FA' : 'Generate codes'}
              </Btn>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
