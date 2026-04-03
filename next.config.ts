import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(process.cwd()),
  /** Internal rewrite (no 308): some clients mishandle POST after redirect from `/api/foo/`. */
  async rewrites() {
    return [
      { source: '/api/company-context/', destination: '/api/company-context' },
      { source: '/api/intake-flow/', destination: '/api/intake-flow' },
      { source: '/api/services-search/', destination: '/api/services-search' },
      { source: '/api/check-availability/', destination: '/api/check-availability' },
      { source: '/api/book-appointment/', destination: '/api/book-appointment' }
    ];
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx']
    };
    return config;
  }
};

export default nextConfig;
