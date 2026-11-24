'use client';

import { ArrowRight, Building2, CircleHelp, ExternalLink, UserRound } from 'lucide-react';
import { Modal } from '@/components/ui';
import { C } from '@/lib/design';
import { PLATFORMS, PlatformBadge } from '@/lib/platforms';
import type { Integration, Provider } from '@/lib/types';

/** Providers that show the "personal / creator vs business" routing step before OAuth. */
export const WIZARD_PROVIDERS: Provider[] = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN'];

interface Option {
  key: string;
  icon: typeof UserRound;
  title: string;
  points: string[];
  cta: string;
  mode?: string;
  /** External help link instead of connecting. */
  href?: string;
  disabled?: boolean;
}

function optionsFor(provider: Provider, integration?: Integration): { title: string; intro: string; options: Option[]; help: React.ReactNode } {
  const mode = (k: string) => integration?.modes?.find((m) => m.key === k)?.configured !== false;
  if (provider === 'INSTAGRAM') {
    return {
      title: 'Connect your Instagram profile',
      intro: 'Select your account type so we use the right Instagram integration:',
      options: [
        {
          key: 'creator',
          icon: UserRound,
          title: 'Creator / Influencer',
          points: ['Direct Instagram login', 'No Facebook Page required', 'Full auto-scheduling and comments'],
          cta: 'Connect Creator Profile',
          mode: 'creator',
          disabled: !mode('creator'),
        },
        {
          key: 'business',
          icon: Building2,
          title: 'Brand / Business',
          points: ['Connects through Facebook', 'Full Page + Instagram access, DMs', 'Multi-user permissions'],
          cta: 'Connect Facebook Page',
          mode: 'business',
          disabled: !mode('business'),
        },
      ],
      help: (
        <>
          Have a personal profile? Convert it to a free Creator account in 30 seconds: Instagram → <b>Settings</b> → <b>Account type and tools</b> →{' '}
          <b>Switch to professional account</b> → <b>Creator</b>.
        </>
      ),
    };
  }
  if (provider === 'FACEBOOK') {
    return {
      title: 'Connect Facebook',
      intro: 'Facebook only allows apps to publish to Pages, not to personal timelines. Which describes you?',
      options: [
        {
          key: 'page',
          icon: Building2,
          title: 'I manage a Facebook Page',
          points: ['Publishing and scheduling', 'Comments, Messenger inbox', 'Page insights'],
          cta: 'Connect Facebook Page',
        },
        {
          key: 'personal',
          icon: UserRound,
          title: 'I only have a personal profile',
          points: ['Create a free public Page in 2 minutes', 'Pick “Creator” or “Public figure” as the category', 'Then come back and connect it'],
          cta: 'Create a free Page',
          href: 'https://www.facebook.com/pages/create',
        },
      ],
      help: <>Tip: you need to be an admin of the Page, and select it on the Facebook permission screen.</>,
    };
  }
  return {
    title: 'Connect LinkedIn',
    intro: 'Choose what you want to post as:',
    options: [
      {
        key: 'personal',
        icon: UserRound,
        title: 'My personal profile',
        points: ['For founders, creators and thought leaders', 'Text, image and video posts', 'Works for everyone right away'],
        cta: 'Connect profile',
      },
      {
        key: 'company',
        icon: Building2,
        title: 'A Company Page',
        points: ['Post as your organization', 'Page analytics and comments', 'You must be a Super Admin of the Page'],
        cta: 'Connect Company Page',
      },
    ],
    help: <>Company Pages appear automatically after you sign in, for every Page you administer (when the server has LinkedIn Community Management access).</>,
  };
}

export function AccountTypeWizard({
  provider,
  integration,
  onClose,
  onConnect,
}: {
  provider: Provider | null;
  integration?: Integration;
  onClose: () => void;
  onConnect: (provider: Provider, mode?: string) => void;
}) {
  if (!provider) return null;
  const cfg = optionsFor(provider, integration);
  return (
    <Modal open={!!provider} onClose={onClose} width={640}>
      <div className="p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <PlatformBadge provider={provider} size="md" />
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>{cfg.title}</h2>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{cfg.intro}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cfg.options.map((o) => (
            <div key={o.key} className="flex flex-col rounded-2xl p-5" style={{ border: `1px solid ${C.border2}`, background: '#FAFBFD' }}>
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center rounded-xl" style={{ width: 34, height: 34, background: PLATFORMS[provider].bg }}>
                  <o.icon size={16} color={PLATFORMS[provider].color} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{o.title}</p>
              </div>
              <ul className="mt-3 flex flex-1 flex-col gap-1.5">
                {o.points.map((p) => (
                  <li key={p} style={{ fontSize: 12.5, color: C.body, lineHeight: 1.5 }}>
                    • {p}
                  </li>
                ))}
              </ul>
              {o.href ? (
                <a
                  href={o.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 transition-all hover:bg-[#F8FAFC]"
                  style={{ fontSize: 13, fontWeight: 600, color: C.slate, border: `1px solid ${C.border2}`, background: '#fff' }}
                >
                  {o.cta} <ExternalLink size={12} />
                </a>
              ) : (
                <button
                  disabled={o.disabled}
                  onClick={() => onConnect(provider, o.mode)}
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: o.disabled ? '#CBD5E1' : C.blue }}
                  title={o.disabled ? 'Not configured on the server yet' : undefined}
                >
                  {o.disabled ? 'Not available yet' : o.cta} {!o.disabled && <ArrowRight size={13} />}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-start gap-2 rounded-xl p-3.5" style={{ background: C.blueSoft }}>
          <CircleHelp size={15} color={C.blue} className="mt-0.5 flex-shrink-0" />
          <p style={{ fontSize: 12.5, color: C.slate, lineHeight: 1.55 }}>{cfg.help}</p>
        </div>
      </div>
    </Modal>
  );
}
