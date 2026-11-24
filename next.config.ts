import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Native / browser-driving packages must stay out of the server bundle.
  serverExternalPackages: ['better-sqlite3', 'tmclub-api', 'playwright', 'baileys'],
  experimental: { serverActions: { bodySizeLimit: '30mb' } },
};

export default nextConfig;
