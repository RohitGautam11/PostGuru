import { BarChart3, CalendarClock, Check, FlaskConical, Inbox, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteShell } from '@/components/public/site-shell';
import { getPublicConfig } from '@/lib/public-config';

export const metadata: Metadata = {
  title: { absolute: 'PostGuru: schedule, publish and grow on every social network' },
  description: 'Plan, publish and reply across Instagram, Facebook, LinkedIn, X, YouTube, Threads, TikTok and Pinterest from one workspace.',
};

const FEATURES = [
  { icon: CalendarClock, title: 'Write once, publish everywhere', text: 'One composer for 8 networks with per-platform previews, X threads, first-comment hashtags and smart scheduling.' },
  { icon: Inbox, title: 'Unified inbox', text: 'Comments, mentions and DMs in one queue, with assignment, internal notes and live “who is replying” indicators.' },
  { icon: Sparkles, title: 'AI Growth Assistant', text: 'Captions, hooks, hashtags, YouTube SEO and one-click reply suggestions tuned to your brand voice.' },
  { icon: BarChart3, title: 'Analytics that explain', text: 'Reach, engagement and best posting times per account, plus a weekly summary in your inbox.' },
  { icon: UsersRound, title: 'Creators and teams', text: 'Connect personal creator profiles or business pages. Invite teammates with roles when you grow.' },
  { icon: ShieldCheck, title: 'Secure by design', text: 'OAuth only (we never see your passwords), AES-256 encrypted tokens and two-factor sign-in.' },
];

const NETWORKS = ['Instagram', 'Facebook', 'LinkedIn', 'X', 'YouTube', 'Threads', 'TikTok', 'Pinterest'];

export default async function Home() {
  if (cookies().has('sh_rt')) redirect('/dashboard');
  const config = await getPublicConfig();
  const plans = config.plans;

  return (
    <SiteShell config={config}>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 text-center sm:px-6 sm:pt-20">
        {config.beta && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[12px] font-semibold text-violet-700">
            <FlaskConical size={13} /> Open beta: every feature free while we test
          </span>
        )}
        <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
          Your social media, <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">managed like a guru</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-[16px] leading-relaxed text-slate-600 sm:text-lg">
          Plan, publish and reply across every network from one calm workspace, built for creators, brands and agencies.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="rounded-xl bg-slate-900 px-6 py-3 text-[14px] font-semibold text-white shadow-lg shadow-slate-900/20 hover:opacity-90">
            {config.beta ? 'Join the beta, free' : `Start ${config.trialDays}-day free trial`}
          </Link>
          <Link href="/login" className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-[14px] font-semibold text-slate-700 hover:bg-slate-50">
            Log in
          </Link>
        </div>
        <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-2">
          {NETWORKS.map((n) => (
            <span key={n} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600">
              {n}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <f.icon size={18} className="text-blue-600" />
            </div>
            <h3 className="mt-4 text-[15px] font-bold text-slate-900">{f.title}</h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">{f.text}</p>
          </div>
        ))}
      </section>

      {plans.length > 0 && (
        <section id="pricing" className="border-t border-slate-200 bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-extrabold tracking-tight text-slate-900">Simple pricing</h2>
            <p className="mt-2 text-center text-[14px] text-slate-500">
              {config.beta ? 'Free during the beta. ' : ''}Prices in INR (+18% GST) with UPI AutoPay, or USD for international cards.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => (
                <div key={p.key} className={`flex flex-col rounded-2xl border bg-white p-6 ${p.key === 'PRO' ? 'border-blue-300 shadow-lg shadow-blue-600/10' : 'border-slate-200'}`}>
                  <p className="text-[15px] font-bold text-slate-900">{p.name}</p>
                  <p className="mt-0.5 text-[12px] text-slate-500">{p.tagline}</p>
                  <p className="mt-4">
                    <span className="text-3xl font-extrabold tracking-tight text-slate-900">₹{p.priceMonthlyInr.toLocaleString('en-IN')}</span>
                    <span className="text-[13px] text-slate-500"> /mo</span>
                  </p>
                  <p className="text-[12px] text-slate-400">or ${p.priceMonthly}/mo internationally</p>
                  <ul className="mt-5 flex flex-1 flex-col gap-2">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-[13px] text-slate-600">
                        <Check size={14} className="mt-0.5 flex-shrink-0 text-green-600" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={`mt-6 rounded-xl px-4 py-2.5 text-center text-[13px] font-semibold ${p.key === 'PRO' ? 'bg-blue-600 text-white hover:opacity-90' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                  >
                    {p.key === 'FREE' ? 'Start free' : `Choose ${p.name}`}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Help shape what we build next</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          Every beta tester can send feedback from inside the app and upvote features on our public roadmap.
        </p>
        <Link href="/roadmap" className="mt-6 inline-block rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
          View the roadmap
        </Link>
      </section>
    </SiteShell>
  );
}
