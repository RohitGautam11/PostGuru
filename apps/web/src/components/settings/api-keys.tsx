'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Btn, ConfirmDialog, FieldLabel, Modal, TextInput } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { C } from '@/lib/design';

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

const BORDER = '1px solid #EEF0F4';

/** Settings → API & Integrations → "API Access": workspace API keys for the PostGuru REST API. */
export function ApiAccess() {
  const qc = useQueryClient();
  const { data: keys, isLoading } = useQuery({ queryKey: ['api-keys'], queryFn: () => api<ApiKey[]>('/workspace/api-keys') });
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<ApiKey | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const copy = (v: string, what = 'Copied') => navigator.clipboard.writeText(v).then(() => toast.success(what));

  const create = useMutation({
    mutationFn: () => api<ApiKey & { key: string }>('/workspace/api-keys', { method: 'POST', body: { name } }),
    onSuccess: (r) => {
      setCreated(r.key);
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/workspace/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('API key revoked');
      setToRevoke(null);
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const closeCreate = () => {
    setCreateOpen(false);
    setCreated(null);
    setName('');
  };

  return (
    <div className="rounded-2xl bg-white p-6 sm:p-7" style={{ border: BORDER }}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 4 }}>API Access</h3>
          <p style={{ fontSize: 13, color: C.faint }}>Use the PostGuru API to build custom integrations.</p>
        </div>
        <Btn variant="soft" onClick={() => setCreateOpen(true)}>
          <Plus size={13} strokeWidth={2.5} /> New API key
        </Btn>
      </div>

      {isLoading ? (
        <div className="h-11 animate-pulse rounded-xl" style={{ background: C.line }} />
      ) : !keys?.length ? (
        <div className="flex items-center gap-2.5 rounded-xl p-4" style={{ background: '#FAFBFD', border: `1px solid ${C.line2}` }}>
          <KeyRound size={15} color={C.faint} />
          <span style={{ fontSize: 13, color: C.muted }}>No API keys yet. Create one to call the API from your own tools.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {keys.map((k) => (
            <div key={k.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-white px-4 py-2.5" style={{ border: `1px solid ${C.border3}` }}>
                <span className="font-mono truncate" style={{ fontSize: 13, color: C.muted }}>
                  {k.prefix}…
                </span>
                <span className="ml-auto flex-shrink-0 truncate" style={{ fontSize: 12, color: C.faint }}>
                  {k.name} · {k.lastUsedAt ? `used ${formatDistanceToNowStrict(new Date(k.lastUsedAt))} ago` : 'never used'}
                </span>
              </div>
              <button
                onClick={() => setToRevoke(k)}
                className="flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 transition-colors hover:bg-[#FEF2F2]"
                style={{ fontSize: 13, fontWeight: 600, color: C.red, border: `1px solid ${C.redBorder}`, background: '#fff' }}
              >
                <Trash2 size={12} /> Revoke
              </button>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: C.faint, marginTop: 16, lineHeight: 1.6 }}>
        Keep your API key secret. Do not share it in public repos or client-side code. Send it as <code style={{ color: C.muted }}>Authorization: Bearer &lt;key&gt;</code> to{' '}
        <code style={{ color: C.muted }}>{origin}/api</code>. Keys act with the role of the member who created them.
      </p>

      <Modal open={createOpen} onClose={closeCreate} width={460} closable={!created}>
        <div style={{ padding: 24 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>{created ? 'Copy your API key' : 'Create API key'}</h2>
          {created ? (
            <>
              <p style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.55 }}>This is the only time the full key is shown. Store it in a secret manager.</p>
              <div className="mt-4 flex gap-2">
                <input readOnly value={created} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-xl bg-white px-4 py-2.5 font-mono" style={{ fontSize: 12.5, border: `1px solid ${C.border3}`, color: C.ink }} />
                <button onClick={() => copy(created, 'API key copied')} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5" style={{ fontSize: 13, fontWeight: 600, color: C.blue, border: `1px solid ${C.blueBorder}`, background: C.blueSoft }}>
                  <Copy size={12} /> Copy
                </button>
              </div>
              <div className="mt-6 flex justify-end">
                <Btn onClick={closeCreate}>Done</Btn>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim().length >= 2) create.mutate();
              }}
            >
              <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Name the key after the tool that will use it.</p>
              <div className="mt-4">
                <FieldLabel>Key name</FieldLabel>
                <TextInput autoFocus placeholder="e.g. Zapier, Internal dashboard" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="mt-6 flex justify-end gap-2.5">
                <Btn type="button" variant="outline" onClick={closeCreate}>
                  Cancel
                </Btn>
                <Btn type="submit" loading={create.isPending} disabled={name.trim().length < 2}>
                  Create key
                </Btn>
              </div>
            </form>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={!!toRevoke}
        onClose={() => setToRevoke(null)}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke.id)}
        loading={revoke.isPending}
        danger
        icon={<Trash2 size={15} color={C.red} />}
        title={`Revoke “${toRevoke?.name}”?`}
        description="Anything using this key will stop working immediately. This cannot be undone."
        confirmLabel="Revoke key"
      />
    </div>
  );
}
