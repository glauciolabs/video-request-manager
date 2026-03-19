/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/admin/:path*',
        destination: '/:path*'
      }
    ];
  }
};

export default nextConfig;
