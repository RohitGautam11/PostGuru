import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SiteShell } from '@/components/public/site-shell';
import { getPublicConfig } from '@/lib/public-config';
import { RoadmapBoard } from './board';

export const metadata: Metadata = { title: 'Roadmap', description: 'Vote for the features you want next and see what we are building.' };

export default async function RoadmapPage() {
  const config = await getPublicConfig();
  const signedIn = cookies().has('sh_rt');
  return (
    <SiteShell config={config} signedIn={signedIn}>
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Roadmap</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600">
          What we are building next, shaped by your votes. Upvote ideas you want, or suggest one with the Feedback button inside the app.
        </p>
        <RoadmapBoard signedIn={signedIn} />
      </section>
    </SiteShell>
  );
}
