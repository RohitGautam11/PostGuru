/** @type {import('next').NextConfig} */
const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  // The browser only ever talks to this origin. /api/* is proxied to the NestJS API, which keeps auth
  // cookies first-party and lets OAuth callbacks / webhooks use the web domain.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
  // Older paths → design routes.
  async redirects() {
    return [
      { source: '/register', destination: '/signup', permanent: false },
      { source: '/compose', destination: '/composer', permanent: false },
      { source: '/calendar', destination: '/planner', permanent: false },
      { source: '/accounts', destination: '/connect', permanent: false },
      { source: '/comments', destination: '/inbox?filter=comments', permanent: false },
      { source: '/media', destination: '/composer', permanent: false },
      { source: '/posts', destination: '/planner?view=list', permanent: false },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
