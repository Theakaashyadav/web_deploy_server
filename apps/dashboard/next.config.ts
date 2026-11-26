import type { NextConfig } from 'next';
const uploadBytes=Number(process.env.MAX_UPLOAD_BYTES || 104857600);
const nextConfig: NextConfig = {
  agentRules: false,
  distDir: process.env.DEPLOYHUB_NEXT_DIST_DIR || '.next',
  output: 'standalone',
  experimental: {
    // Folder uploads include a paths manifest and one multipart header for every file.
    proxyClientMaxBodySize: (Number.isSafeInteger(uploadBytes)&&uploadBytes>0 ? uploadBytes : 104857600)+32*1024*1024,
    proxyTimeout: 600000,
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_ORIGIN || 'http://127.0.0.1:4100'}/api/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' }
    ] }];
  }
};
export default nextConfig;
