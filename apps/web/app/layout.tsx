import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LumiMath',
  description: 'Nền tảng học toán trực tuyến',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
