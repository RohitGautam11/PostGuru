import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center" style={{ background: '#F4F6F8' }}>
      <p style={{ fontSize: 56, fontWeight: 800, color: '#2563EB', letterSpacing: '-0.04em' }}>404</p>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginTop: 8 }}>Page not found</h1>
      <p style={{ fontSize: 14, color: '#94A3B8', marginTop: 6 }}>The page you&apos;re looking for doesn&apos;t exist or was moved.</p>
      <Link href="/dashboard" className="mt-6 rounded-xl px-5 py-2.5" style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: '#2563EB' }}>
        Back to Dashboard
      </Link>
    </div>
  );
}
