import path from 'node:path';

import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';

import { staticSecurityHeaders } from './lib/security/headers';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@learny/core',
    '@learny/config',
    '@learny/contracts',
    '@learny/domain',
    '@learny/bricks',
    '@learny/ui',
  ],
  // Native/Node-only telemetry libraries stay outside the bundle (SPEC-010).
  serverExternalPackages: ['pino', '@sentry/nextjs'],
  poweredByHeader: false,
  // QA locale: le navigateur ouvre l'app sur 127.0.0.1, pas seulement localhost.
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  reactStrictMode: true,
  // SPEC-804 ET-5/ET-6 — images modernes, imports ciblés et analyse du bundle.
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
    // Next's proxy stream cloning otherwise defaults below the 11 MiB uploads accepted by the API.
    proxyClientMaxBodySize: '12mb',
  },
  // Docker image (SPEC-012, ET-2): a self-contained server whose traced files include workspace
  // packages. The managed build (SPEC-013) keeps the same output, which Vercel accepts.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // Templates read with fs at request time are invisible to the tracer: ship them explicitly
  // (SPEC-806 legal pages, SPEC-803 accessibility statement).
  outputFileTracingIncludes: {
    '/legal/*': ['../../docs/legal/*.md'],
    '/accessibilite': ['./content/legal/*.md'],
  },
  // SDD demo pages are never indexed, even when they answer 404 (SPEC-006, EF-4).
  headers() {
    return Promise.resolve([
      {
        // SPEC-805 — HSTS is added per request by the proxy only for a real HTTPS production response.
        source: '/:path*',
        headers: Object.entries(staticSecurityHeaders(false)).map(([key, value]) => ({
          key,
          value,
        })),
      },
      {
        source: '/_dev/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        // SPEC-801 ET-11 — the worker must never be served from a stale HTTP cache.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
    ]);
  },
};

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

export default withBundleAnalyzer(nextConfig);
