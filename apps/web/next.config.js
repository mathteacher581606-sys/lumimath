/** @type {import('next').NextConfig} */
const API_UPSTREAM = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  // Nâng thời gian chờ proxy /api (mặc định 30s) — nhập đề Word cần quét AI lâu hơn
  experimental: {
    proxyTimeout: 120000,
  },
  // Proxy toàn bộ /api/* → API server. Nhờ vậy người dùng ở BẤT CỨ ĐÂU
  // (LAN, internet qua tunnel) đều xem được ảnh/nội dung vì mọi request
  // đi qua chính origin của trang web, không còn hardcode localhost.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_UPSTREAM}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
