import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LumiMath — Học Toán online cùng AI',
  description:
    'LumiMath: nền tảng học Toán trực tuyến cho học sinh THPT Việt Nam. Ngân hàng đề phong phú, bài giảng video, bài tập chấm điểm bằng AI, thi thử online, điểm thưởng XP và bảng xếp hạng.',
  keywords: [
    'LumiMath',
    'học toán online',
    'toán THPT',
    'luyện thi toán',
    'đề thi toán',
    'AI chấm bài',
    'toán lớp 10 11 12',
  ],
  authors: [{ name: 'LumiMath' }],
  applicationName: 'LumiMath',
  openGraph: {
    title: 'LumiMath — Học Toán online cùng AI',
    description:
      'Ngân hàng đề phong phú · Chấm bài bằng AI · Thi thử online · Gamification',
    type: 'website',
    locale: 'vi_VN',
    siteName: 'LumiMath',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#fbfaf7" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="LumiMath" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); }); }`,
          }}
        />
        {/* Font: Lora (tiêu đề) + Be Vietnam Pro (nội dung) + Inter (UI nhỏ) + JetBrains Mono (số/công thức) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&family=Be+Vietnam+Pro:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        {/* Nạp theme đã lưu trước khi render để không bị giật màu */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try { var t = localStorage.getItem('lumimath-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
