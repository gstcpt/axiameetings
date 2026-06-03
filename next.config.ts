import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false,
  // @ts-ignore
  allowedDevOrigins: ['192.168.137.1', '192.168.0.193', '172.20.10.4', '172.0.1.159', 'localhost:3002', 'localhost:3002', '*.exp.direct'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
        ]
      }
    ];
  }
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);