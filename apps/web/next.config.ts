import path from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@learny/core',
    '@learny/config',
    '@learny/contracts',
    '@learny/db',
    '@learny/ingestion',
    '@learny/jobs',
    '@learny/llm',
    '@learny/notifications',
    '@learny/tutor',
    '@learny/ui',
  ],
  // Native/Node-only telemetry libraries stay outside the bundle (SPEC-010).
  serverExternalPackages: ['pino', 'postgres', '@sentry/nextjs', 'nodemailer'],
  poweredByHeader: false,
  // QA locale: le navigateur ouvre l'app sur 127.0.0.1, pas seulement localhost.
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  reactStrictMode: true,
  // Docker image (SPEC-012, ET-2): a self-contained server whose traced files include workspace
  // packages. The managed build (SPEC-013) keeps the same output, which Vercel accepts.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
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
