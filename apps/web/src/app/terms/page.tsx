import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose, SiteShell } from '@/components/public/site-shell';
import { getPublicConfig } from '@/lib/public-config';

export const metadata: Metadata = { title: 'Terms of Service' };

export default async function TermsPage() {
  const config = await getPublicConfig();
  const { appName } = config;
  const c = config.company;

  return (
    <SiteShell config={config}>
      <Prose title="Terms of Service" updated="24 November 2026">
        <p>
          These terms govern your use of {appName}, operated by {c.legalName}
          {c.address ? `, ${c.address}` : ''}. By creating an account you agree to them. If you use the Service for an organisation, you confirm you may accept these terms
          on its behalf.
        </p>

        <h2>1. The Service</h2>
        <p>
          {appName} lets you connect social media accounts, create and schedule posts, manage comments and messages, view analytics and use AI writing assistance. Features
          depend on what each social platform&apos;s API allows and may change when platforms change their rules.
        </p>

        <h2>2. Beta</h2>
        <p>
          {config.beta
            ? 'The Service is currently in beta. It is provided free of charge, may contain bugs, and may change or be interrupted without notice. Please keep your own copies of important content.'
            : 'Features marked as beta are provided as-is and may change.'}
        </p>

        <h2>3. Your account</h2>
        <ul>
          <li>Keep your login details secure; enable two-factor authentication where possible. You are responsible for activity in your workspace.</li>
          <li>Workspace owners control members, roles and connected accounts.</li>
          <li>You must be at least 18 years old.</li>
        </ul>

        <h2>4. Acceptable use</h2>
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>publish unlawful, infringing, hateful, harassing, deceptive or sexually explicit content, or spam;</li>
          <li>violate the terms, community guidelines or developer policies of any connected platform;</li>
          <li>connect accounts you are not authorised to manage;</li>
          <li>scrape, reverse engineer, overload or interfere with the Service or platform APIs, or circumvent plan limits or rate limits;</li>
          <li>use AI features to generate misleading claims or impersonate others.</li>
        </ul>

        <h2>5. Platform APIs and rate limits</h2>
        <p>
          Publishing depends on third-party APIs (Meta, LinkedIn, X, Google, TikTok, Pinterest). They impose rate limits and may reject, delay or remove content. We retry
          temporary failures and notify you of permanent ones, but we cannot guarantee that a platform will accept or keep a post. Access tokens may expire or be revoked by
          the platform; you may need to reconnect accounts.
        </p>

        <h2>6. Your content</h2>
        <p>
          You own your content. You grant us a limited licence to store, process and transmit it only to provide the Service (for example, to publish it to the platforms you
          choose). You are responsible for having the rights to everything you publish.
        </p>

        <h2>7. Plans, billing and cancellation</h2>
        <ul>
          <li>Paid plans renew monthly until cancelled. Indian customers are billed in INR plus 18% GST through Razorpay; international customers in USD through Stripe.</li>
          <li>You can cancel at any time in Settings → Billing; access continues until the end of the paid period. Fees already paid are non-refundable except where required by law.</li>
          <li>New workspaces get a free trial of Business features; afterwards the Free Starter limits apply unless you choose a plan.</li>
          <li>We will give at least 30 days&apos; notice of price changes.</li>
        </ul>

        <h2>8. Service levels</h2>
        <p>
          We aim for high availability and schedule maintenance outside Indian business hours where possible, but during the beta the Service is provided without an
          uptime commitment. Paid plans target 99.5% monthly availability of the web application, excluding third-party platform outages.
        </p>

        <h2>9. Suspension and termination</h2>
        <p>
          You may delete your account at any time. We may suspend or terminate accounts that breach these terms, harm other users, or put our platform access at risk,
          and will notify you where reasonable. After termination we delete your data as described in the <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>10. Liability</h2>
        <p>
          The Service is provided &quot;as is&quot;. To the extent permitted by law, we are not liable for indirect or consequential losses, lost profits, or content rejected or
          removed by third-party platforms. Our total liability is limited to the fees you paid us in the 12 months before the claim.
        </p>

        <h2>11. Governing law</h2>
        <p>
          These terms are governed by the laws of India. Courts at {c.state || 'our registered office'} have exclusive jurisdiction, subject to any mandatory consumer rights
          where you live.
        </p>

        <h2>12. Contact</h2>
        <p>{c.supportEmail ? <a href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a> : 'Use the support email in the footer.'}</p>
      </Prose>
    </SiteShell>
  );
}
