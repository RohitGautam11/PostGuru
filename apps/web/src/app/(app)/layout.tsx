'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HelpDialog, ShortcutsDialog, SignOutDialog, WhatsNewDialog } from '@/components/shell/dialogs';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { Spinner } from '@/components/ui';
import { useMe } from '@/lib/hooks';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isLoading, isError } = useMe();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signOut, setSignOut] = useState(false);
  const [help, setHelp] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [whatsNew, setWhatsNew] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('sidebar-collapsed') === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const collapse = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem('sidebar-collapsed', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  if (isLoading || isError) {
    // isError → the API client is redirecting to /login.
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: '#F4F6F9' }}>
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F4F6F9' }}>
      <Sidebar
        collapsed={collapsed}
        onCollapse={collapse}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onSignOut={() => setSignOut(true)}
        onHelp={() => setHelp(true)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenu={() => setMobileOpen(true)} onSignOut={() => setSignOut(true)} onHelp={() => setHelp(true)} onShortcuts={() => setShortcuts(true)} onWhatsNew={() => setWhatsNew(true)} />
        <main className="flex-1 overflow-y-auto" id="main">
          {children}
        </main>
      </div>
      <SignOutDialog open={signOut} onClose={() => setSignOut(false)} />
      <HelpDialog open={help} onClose={() => setHelp(false)} />
      <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
      <WhatsNewDialog open={whatsNew} onClose={() => setWhatsNew(false)} />
    </div>
  );
}
