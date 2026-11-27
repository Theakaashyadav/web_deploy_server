import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  agentRules: false,
  distDir: process.env.WEBSYNK_NEXT_DIST_DIR || '.next',
  output: 'standalone',
  trailingSlash: true,
  async redirects() {
    const preferredHost=[{type:'host' as const,value:'www.websynk.in'}];
    return [
      {source:'/:path*.:extension',has:preferredHost,destination:'https://websynk.in/:path*.:extension',permanent:true},
      {source:'/:path*',has:preferredHost,destination:'https://websynk.in/:path*/',permanent:true},
    ];
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }
    ] }, { source: '/:path(admin|login|api)/:rest*', headers: [{key:'X-Robots-Tag',value:'noindex, nofollow'}] }];
  }
};
export default nextConfig;
