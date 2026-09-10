import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? '/api/v1',
  },
  allowedDevOrigins: [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'https://actor-implement-meters-crown.trycloudflare.com',
  ],
  async rewrites() {
    return [{
      source: '/api/v1/:path*',
      destination: 'http://127.0.0.1:8000/api/v1/:path*',
    }]
  },
};

export default nextConfig;
