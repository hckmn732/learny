import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@learny/core', '@learny/config', '@learny/contracts', '@learny/jobs'],
  poweredByHeader: false,
  reactStrictMode: true,
  // SDD demo pages are never indexed, even when they answer 404 (SPEC-006, EF-4).
  headers() {
    return Promise.resolve([
      {
        source: '/_dev/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]);
  },
};

export default nextConfig;
