import type { Metadata } from 'next';
import { Prose, SiteShell } from '@/components/public/site-shell';
import { getPublicConfig } from '@/lib/public-config';
import { DeletionForm, DeletionStatus } from './client';

export const metadata: Metadata = { title: 'Data Deletion' };

export default async function DataDeletionPage({ searchParams }: { searchParams: { code?: string } }) {
  const config = await getPublicConfig();
  const { appName } = config;
  return (
    <SiteShell config={config}>
      <Prose title="Data Deletion Instructions" updated="24 November 2026">
        {searchParams.code && <DeletionStatus code={searchParams.code} />}
        <p>You can remove the data {appName} stores about you at any time. Choose the option that fits:</p>

        <h2>Option 1: Delete everything (you have an account)</h2>
        <ul>
          <li>
            Log in and open <b>Settings → Account → Delete account</b>.
          </li>
          <li>Confirm with your password. Your profile, workspaces you solely own, connected-account tokens, posts, media, inbox data and analytics are deleted immediately from the live database and from backups within 30 days.</li>
        </ul>

        <h2>Option 2: Remove one social account</h2>
        <ul>
          <li>
            Open <b>Connect Accounts</b>, click the <b>×</b> next to the account and confirm.
          </li>
          <li>Its access tokens, synced comments, messages and metrics are deleted. Nothing is deleted on the social platform itself.</li>
        </ul>

        <h2>Option 3: From Facebook, Instagram or Threads</h2>
        <ul>
          <li>
            Facebook: <b>Settings &amp; privacy → Settings → Business integrations</b> (or Apps and websites), select {appName} and choose <b>Remove</b>, ticking the option to
            delete data.
          </li>
          <li>
            Instagram: <b>Settings → Website permissions → Apps and websites</b>, select {appName} and <b>Remove</b>.
          </li>
          <li>Meta notifies us automatically and we delete the connected accounts and their synced data. You can check the status with the confirmation code Meta shows you.</li>
        </ul>

        <h2>Option 4: Send us a request</h2>
        <p>Use this form if you cannot log in or are not a user but believe we hold your data (for example, a comment you left on a customer&apos;s page). We confirm by email and complete requests within 30 days.</p>
        <DeletionForm />
      </Prose>
    </SiteShell>
  );
}
