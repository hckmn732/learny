import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@learny/core', '@learny/config'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
