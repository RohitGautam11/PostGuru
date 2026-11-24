import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose, SiteShell } from '@/components/public/site-shell';
import { getPublicConfig } from '@/lib/public-config';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default async function PrivacyPage() {
  const config = await getPublicConfig();
  const { appName } = config;
  const c = config.company;
  const contact = c.supportEmail ? <a href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a> : 'the support email shown in the footer';

  return (
    <SiteShell config={config}>
      <Prose title="Privacy Policy" updated="24 November 2026">
        <p>
          This policy explains how {c.legalName} (&quot;we&quot;, &quot;us&quot;), the operator of {appName}, collects, uses, stores and deletes personal data when you use our
          social media management service (the &quot;Service&quot;). We process data in line with India&apos;s Digital Personal Data Protection Act, 2023 and, for users in the
          EU/UK, the GDPR.
        </p>

        <h2>1. Data we collect</h2>
        <ul>
          <li>
            <b>Account data:</b> your name, email address, password hash (or Google sign-in identifier), time zone, profile photo and two-factor settings.
          </li>
          <li>
            <b>Connected social accounts:</b> when you connect Facebook, Instagram, Threads, LinkedIn, X, YouTube, TikTok or Pinterest, we receive OAuth access tokens and
            refresh tokens, the account or page ID, name, username, profile picture and follower counts. We never receive or store your social media passwords.
          </li>
          <li>
            <b>Content you create:</b> posts, captions, media files you upload, schedules, drafts, internal notes and replies.
          </li>
          <li>
            <b>Engagement data:</b> comments, mentions and direct messages on your connected accounts, and the related author names and public profile pictures, so you can
            manage them in the inbox.
          </li>
          <li>
            <b>Analytics:</b> post and account metrics (reach, impressions, likes, comments, shares, followers) provided by each platform&apos;s API.
          </li>
          <li>
            <b>Billing data:</b> plan, billing name, address, state and GSTIN. Card and UPI details are handled by our payment processors and are never stored on our servers.
          </li>
          <li>
            <b>Technical data:</b> IP address, browser user agent, and logs needed for security and debugging. Feedback you send includes the page you were on.
          </li>
        </ul>

        <h2>2. How we use data</h2>
        <ul>
          <li>To provide the Service: publish and schedule posts, sync comments and messages, show analytics and send notifications you enable.</li>
          <li>To generate AI suggestions (captions, hashtags, replies) when you ask for them.</li>
          <li>To secure accounts, prevent abuse, process payments and issue GST tax invoices.</li>
          <li>To improve the product using aggregated usage and the feedback you choose to send.</li>
        </ul>
        <p>
          We do not sell personal data, use platform data for advertising, or use data obtained from Meta, Google, LinkedIn, X, TikTok or Pinterest APIs for any purpose
          other than providing the features you use. Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the
          Limited Use requirements.
        </p>

        <h2>3. Storage and security</h2>
        <ul>
          <li>OAuth access and refresh tokens are encrypted at rest with AES-256-GCM. Passwords are stored only as salted hashes.</li>
          <li>All traffic is encrypted in transit with HTTPS (TLS 1.2+). Sessions use HTTP-only, secure cookies.</li>
          <li>Data is stored in managed PostgreSQL databases and object storage with access limited to authorised staff.</li>
          <li>Tokens are refreshed automatically before they expire and are deleted when you disconnect an account.</li>
        </ul>

        <h2>4. Third-party processors</h2>
        <p>We share data only with service providers that help us run the Service, under contracts that protect it:</p>
        <ul>
          <li>Hosting and database: Vercel (application hosting) and Supabase / managed PostgreSQL (database and file storage).</li>
          <li>Social platforms you connect: Meta (Facebook, Instagram, Threads), LinkedIn, X, Google (YouTube), TikTok and Pinterest, which receive the content you publish.</li>
          <li>AI: Anthropic (Claude), only for text you send to the AI assistant. Anthropic does not use API data to train its models.</li>
          <li>Payments: Razorpay (India) and Stripe (international).</li>
          <li>Email delivery: our SMTP provider, for account and notification emails.</li>
        </ul>

        <h2>5. Retention</h2>
        <ul>
          <li>Account and content data are kept while your account is active.</li>
          <li>Synced comments, messages and metrics are kept while the social account stays connected and deleted when you disconnect it.</li>
          <li>In-app notifications are deleted after 90 days; expired sessions after 7 days.</li>
          <li>Invoices are retained for 8 years as required by Indian tax law.</li>
          <li>When you delete your account, your data is deleted within 30 days, except where the law requires us to keep it.</li>
        </ul>

        <h2>6. Your rights and choices</h2>
        <p>
          You can access and update your data in Settings, export your posts, disconnect any social account at any time, and delete your account in Settings → Account. You
          can also request deletion without logging in on our <Link href="/data-deletion">Data Deletion page</Link>. You may withdraw consent for a platform at any time by
          removing {appName} in that platform&apos;s settings (for example Facebook → Settings → Business Integrations), and we will stop using those tokens.
        </p>

        <h2>7. Children</h2>
        <p>The Service is not intended for anyone under 18. We do not knowingly collect data from children.</p>

        <h2>8. Changes</h2>
        <p>We will post changes to this policy on this page and, for significant changes, notify you by email or in the app.</p>

        <h2>9. Contact and grievance officer</h2>
        <p>
          {c.legalName}
          {c.address ? `, ${c.address}` : ''}
          {c.state ? `, ${c.state}, India` : ''}. Email: {contact}. We respond to privacy requests within 30 days.
        </p>
      </Prose>
    </SiteShell>
  );
}
