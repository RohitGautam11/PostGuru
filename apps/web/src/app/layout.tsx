import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const APP = process.env.NEXT_PUBLIC_APP_NAME || 'PostGuru';

export const metadata: Metadata = {
  title: { default: APP, template: `%s · ${APP}` },
  description: 'Schedule, publish and engage across every social channel from one calm, focused workspace.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#F4F6F8' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
