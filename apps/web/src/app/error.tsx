'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A' }}>Something went wrong</h1>
      <p style={{ fontSize: 14, color: '#94A3B8', marginTop: 6, maxWidth: 420 }}>{error.message || 'An unexpected error occurred.'}</p>
      <button onClick={reset} className="mt-6 rounded-xl px-5 py-2.5" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: '#2563EB' }}>
        Try again
      </button>
    </div>
  );
}
