import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false,
  experimental: {
    // @ts-ignore
    allowedDevOrigins: ['192.168.137.1', '192.168.0.193', '172.20.10.4', '172.0.1.159', 'localhost:3002', 'localhost:3002', '*.exp.direct']
  }
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);