'use client';

import { useEffect, useState } from 'react';

interface Status {
  confirmationCode: string;
  status: string;
  requestedAt: string;
  completedAt: string | null;
  details: string | null;
}

export function DeletionStatus({ code }: { code: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/compliance/data-deletion/status?code=${encodeURIComponent(code)}`)
      .then(async (r) => (r.ok ? setStatus(await r.json()) : setError('We could not find a request with this confirmation code.')))
      .catch(() => setError('Could not load the status. Please try again later.'));
  }, [code]);
  return (
    <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-[13px] font-semibold text-slate-500">Deletion request {code}</p>
      {error && <p className="mt-1 text-[14px] text-red-600">{error}</p>}
      {status && (
        <>
          <p className="mt-1 text-[18px] font-bold text-slate-900">{status.status === 'COMPLETED' ? 'Completed' : status.status === 'PENDING' ? 'Received, in progress' : status.status}</p>
          <p className="mt-1 text-[13px] text-slate-600">
            Requested {new Date(status.requestedAt).toLocaleString()}
            {status.completedAt ? ` · completed ${new Date(status.completedAt).toLocaleString()}` : ''}
          </p>
          {status.details && <p className="mt-1 text-[13px] text-slate-600">{status.details}</p>}
        </>
      )}
    </div>
  );
}

export function DeletionForm() {
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [code, setCode] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    try {
      const r = await fetch('/api/compliance/data-deletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, details: details || undefined }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      setCode(data.confirmationCode);
      setState('done');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-5 text-[14px] text-green-900">
        Request received. Your confirmation code is <b>{code}</b>. Keep it to check the status on this page: <a href={`/data-deletion?code=${code}`}>view status</a>.
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <label className="text-[13px] font-semibold text-slate-700" htmlFor="dd-email">
        Email address
      </label>
      <input
        id="dd-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] outline-none focus:border-blue-500"
        placeholder="you@example.com"
      />
      <label className="text-[13px] font-semibold text-slate-700" htmlFor="dd-details">
        Details (optional)
      </label>
      <textarea
        id="dd-details"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={2000}
        rows={4}
        className="resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] outline-none focus:border-blue-500"
        placeholder="Which account or social profile is this about?"
      />
      {state === 'error' && <p className="text-[13px] text-red-600">Something went wrong. Please try again or email us.</p>}
      <button type="submit" disabled={state === 'sending'} className="self-start rounded-xl bg-slate-900 px-5 py-2.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
        {state === 'sending' ? 'Sending…' : 'Request deletion'}
      </button>
    </form>
  );
}
