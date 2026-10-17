'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getUser, logout } from '@/lib/api';
import NotificationBell from '@/components/NotificationBell';
import Logo from '@/components/Logo';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== 'ADMIN') {
      router.push('/login');
      return;
    }
    setUser(u);
  }, [router]);

  if (!user)
    return <div style={{ padding: 40, textAlign: 'center' }}>Đang tải…</div>;

  const navItems = [
    { href: '/admin', label: 'Tổng quan' },
    { href: '/admin/users', label: 'Thành viên' },
    { href: '/settings', label: 'Cài đặt' },
  ];

  const isActive = (href: string) =>
    href === '/admin'
      ? pathname === '/admin'
      : pathname === href || pathname.startsWith(href + '/');

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
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="user-box">
          <div className="user-name">{user.fullName}</div>
          <div className="user-code">Quản trị viên</div>
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
