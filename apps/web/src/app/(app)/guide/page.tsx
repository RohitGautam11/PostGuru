'use client';

import { BarChart3, CalendarDays, Inbox, Link2, Repeat, Sparkles, SquarePen, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import { GettingStarted } from '@/components/growth/getting-started';
import { Card } from '@/components/ui';
import { C } from '@/lib/design';

const SECTIONS = [
  {
    icon: Link2,
    title: '1. Connect your accounts',
    href: '/connect',
    steps: [
      'Open Connect Account and click Connect on a platform.',
      'Log in on the platform\'s own page and approve access. PostGuru never sees your password.',
      'Instagram must be a Business/Creator account linked to a Facebook Page. Pinterest shows one entry per board.',
      'If an account shows "Reconnect needed", click it and log in again.',
    ],
  },
  {
    icon: SquarePen,
    title: '2. Create a post in the Composer',
    href: '/composer',
    steps: [
      'Choose which accounts to post to (you can pick several platforms at once).',
      'Write the caption, add images or a video, and check the live preview for each platform.',
      'PostGuru blocks mistakes before publishing: too many characters, a missing video for TikTok/YouTube, etc.',
      'For YouTube, add a title and tags; for Pinterest, the first line becomes the Pin title.',
    ],
  },
  {
    icon: TrendingUp,
    title: '3. Boost reach with the Growth Assistant',
    href: '/composer',
    steps: [
      'Score: as you type, every platform gets a 0–100 score with fixes ("hook too long", "add a call to action", "video should be 9:16").',
      'Hashtags: click suggestions to add them: green = your proven top performers, blue = popular in your niche, purple = long-tail keywords.',
      'AI Writer: write captions, "make it viral", 8 hook ideas, AI hashtags, YouTube SEO (titles, description, tags) and content ideas.',
      'Aim for a score of 80+ on each platform before you publish.',
    ],
  },
  {
    icon: CalendarDays,
    title: '4. Plan your calendar',
    href: '/planner',
    steps: [
      'Pick Schedule in the composer and use the "Best time" suggestion.',
      'In the Planner, drag posts to another day to reschedule. Switch to list view to search.',
      'PostGuru publishes automatically, retries on temporary errors and notifies you if something fails.',
    ],
  },
  {
    icon: Inbox,
    title: '5. Reply to everyone from the Inbox',
    href: '/inbox',
    steps: [
      'DMs and comments from all platforms arrive in one list. Filter by unread, comments, DMs or mentions.',
      'Reply, hide or delete comments; negative comments are labelled so you can act fast.',
      'Assign a conversation to a teammate, add internal notes, and mark it resolved.',
      'Replying within the first hour after posting boosts reach on most platforms.',
    ],
  },
  {
    icon: BarChart3,
    title: '6. Measure and improve',
    href: '/growth',
    steps: [
      'Analytics: followers, engagement, reach, top posts and the best-time heatmap. Export CSV/PDF/PNG for clients.',
      'Growth Hub: your personal growth plan, best format, best caption length, best hashtags and posting consistency per platform.',
      'Turn on the weekly email report in Analytics.',
    ],
  },
  {
    icon: Users,
    title: '7. Work as a team',
    href: '/settings?tab=team',
    steps: [
      'Invite people by email or link. Roles: Owner, Admin, Editor (creates & publishes), Viewer (read-only, ideal for clients).',
      'Agencies: create one workspace per client and switch from the sidebar. Data never mixes.',
    ],
  },
];

const ROUTINE = [
  { when: 'Every day (15 min)', items: ['Inbox: reply to new comments and DMs (unread filter).', 'Check notifications for failed posts or accounts to reconnect.', 'Engage: reply to the first comments on today\'s posts within an hour.'] },
  { when: 'Every week (45 min)', items: ['Growth Hub: read your growth plan and top format.', 'AI idea generator: pick 5–10 ideas for next week.', 'Composer: write them, get every score to 80+, schedule at the best times.', 'Planner: check every platform hits its recommended cadence.'] },
  { when: 'Every month', items: ['Analytics: export the PDF report for your team or client.', 'Repeat what worked (top posts), drop formats that do not perform.', 'Refresh your hashtag set using the green "top performer" suggestions.'] },
];

export default function GuidePage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.03em' }}>Guide</h1>
          <p style={{ fontSize: 13, color: C.faint }}>How to use PostGuru and a simple routine to grow every account.</p>
        </div>

        <GettingStarted />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {SECTIONS.map((s) => (
            <Card key={s.title} className="p-6">
              <div className="mb-3 flex items-center gap-2">
                <s.icon size={16} color={C.blue} />
                <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{s.title}</span>
              </div>
              <ol className="flex list-decimal flex-col gap-1.5 pl-5">
                {s.steps.map((t) => (
                  <li key={t} style={{ fontSize: 13, color: C.body, lineHeight: 1.55 }}>{t}</li>
                ))}
              </ol>
              <Link href={s.href} className="mt-3 inline-block" style={{ fontSize: 12.5, fontWeight: 700, color: C.blue }}>
                Open →
              </Link>
            </Card>
          ))}
        </div>

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Repeat size={16} color={C.violet} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>The growth routine</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {ROUTINE.map((r) => (
              <div key={r.when} className="rounded-xl p-4" style={{ background: '#F8FAFC', border: `1px solid ${C.border2}` }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{r.when}</p>
                <ul className="flex list-disc flex-col gap-1 pl-4">
                  {r.items.map((i) => (
                    <li key={i} style={{ fontSize: 12.5, color: C.body }}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={16} color={C.violet} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>What makes content perform</span>
          </div>
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {[
              'Hook in the first line (or first second of video): a number, a question or a bold claim.',
              'One idea per post, written for one specific audience.',
              'Native video and vertical 9:16 Reels/Shorts/TikToks get the most new reach.',
              'Use the right number of hashtags per platform; specific beats generic.',
              'End with one clear call to action: comment, save, share or follow.',
              'Post consistently at your best times. Consistency beats volume.',
              'Reply to comments quickly; conversation signals boost distribution.',
              'Repurpose winners: turn a top post into a carousel, a Reel and a thread.',
            ].map((t) => (
              <li key={t} className="rounded-xl px-3 py-2" style={{ fontSize: 13, color: C.slate, background: '#F8FAFC' }}>✓ {t}</li>
            ))}
          </ul>
          <p className="mt-3" style={{ fontSize: 11.5, color: C.faint }}>No tool can guarantee virality. These practices raise your odds, and the Growth Score checks them for you.</p>
        </Card>
      </div>
    </div>
  );
}
