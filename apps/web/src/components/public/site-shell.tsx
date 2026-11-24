import Link from 'next/link';
import { Logo } from '@/components/logo';
import type { PublicConfig } from '@/lib/public-config';

/** Header + footer for public pages. The footer shows the legal entity details required by platform reviews. */
export function SiteShell({ config, children, signedIn }: { config: PublicConfig; children: React.ReactNode; signedIn?: boolean }) {
  const c = config.company;
  const year = new Date().getFullYear();
  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#F8FAFC', color: '#0F172A' }}>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label={`${config.appName} home`}>
            <Logo size={30} textSize={17} />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link href="/#pricing" className="hidden rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100 sm:inline-block">
              Pricing
            </Link>
            <Link href="/roadmap" className="hidden rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100 sm:inline-block">
              Roadmap
            </Link>
            {signedIn ? (
              <Link href="/dashboard" className="rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90">
                Open app
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-100">
                  Log in
                </Link>
                <Link href="/signup" className="rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white hover:opacity-90">
                  Start free
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
          <div>
            <Logo size={26} textSize={15} />
            <p className="mt-3 text-[13px] leading-relaxed text-slate-500">Schedule, publish and engage across every social channel from one calm workspace.</p>
          </div>
          <div className="text-[13px] leading-relaxed text-slate-600">
            <p className="font-semibold text-slate-900">{c.legalName}</p>
            {c.address && <p>{c.address}</p>}
            {c.state && <p>{c.state}, India</p>}
            {c.gstin && <p>GSTIN: {c.gstin}</p>}
            {c.supportEmail && (
              <p>
                Support:{' '}
                <a className="text-blue-600 hover:underline" href={`mailto:${c.supportEmail}`}>
                  {c.supportEmail}
                </a>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 text-[13px]">
            <Link className="text-slate-600 hover:text-slate-900" href="/privacy">
              Privacy Policy
            </Link>
            <Link className="text-slate-600 hover:text-slate-900" href="/terms">
              Terms of Service
            </Link>
            <Link className="text-slate-600 hover:text-slate-900" href="/data-deletion">
              Data Deletion
            </Link>
            <Link className="text-slate-600 hover:text-slate-900" href="/roadmap">
              Roadmap
            </Link>
          </div>
        </div>
        <p className="border-t border-slate-100 py-4 text-center text-[12px] text-slate-400">
          © {year} {c.legalName}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

/** Readable typography for long legal text. */
export function Prose({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-2 text-[13px] text-slate-500">Last updated: {updated}</p>
      <div className="legal mt-8 text-[15px] leading-7 text-slate-700 [&_a]:text-blue-600 [&_a:hover]:underline [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6">
        {children}
      </div>
    </article>
  );
}
