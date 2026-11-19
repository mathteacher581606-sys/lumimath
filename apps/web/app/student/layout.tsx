'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getUser, logout } from '@/lib/api';
import NotificationBell from '@/components/NotificationBell';
import Logo from '@/components/Logo';
import {
  IconHome,
  IconBook,
  IconCompass,
  IconPen,
  IconHistory,
  IconTrophy,
  IconSettings,
} from '@/components/Icons';

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== 'STUDENT') {
      router.push('/login');
      return;
    }
    setUser(u);
  }, [router]);

  if (!user)
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>Đang tải…</div>
    );

  const navItems = [
    // Tách riêng: Trang chủ (bảng điều khiển) và Khóa học của tôi (danh sách khóa đã đăng ký)
    { href: '/student', label: 'Trang chủ', icon: <IconHome /> },
    { href: '/student/my-courses', label: 'Khóa học của tôi', icon: <IconBook /> },
    { href: '/student/courses', label: 'Khám phá', icon: <IconCompass /> },
    { href: '/student/exams', label: 'Thi thử online', icon: <IconPen /> },
    { href: '/student/practice', label: 'Phòng luyện đề', icon: <IconTrophy /> },
    { href: '/student/attempts', label: 'Lịch sử làm bài', icon: <IconHistory /> },
    { href: '/student/leaderboard', label: 'Bảng xếp hạng', icon: <IconTrophy /> },
    { href: '/settings', label: 'Cài đặt', icon: <IconSettings /> },
  ];

  // '/student' chỉ active khi ĐÚNG trang chủ (không lan sang các trang con)
  const isActive = (href: string) => {
    if (href === '/student') return pathname === '/student';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="brand"><Logo /></div>
          <NotificationBell />
        </div>
        <nav>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive(item.href) ? 'active' : ''}`}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="user-box">
          <div className="user-name">{user.fullName}</div>
          <div className="user-code">{user.studentCode || 'Học sinh'}</div>
          <button
            className="btn-logout"
            onClick={() => {
              logout();
              router.push('/login');
            }}
          >
            Đăng xuất
          </button>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
