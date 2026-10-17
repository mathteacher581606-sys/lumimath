'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getUser, logout } from '@/lib/api';
import NotificationBell from '@/components/NotificationBell';
import Logo from '@/components/Logo';
import {
  IconBook,
  IconUsers,
  IconLibrary,
  IconFlask,
  IconFileText,
  IconGrid,
  IconPen,
  IconUpload,
  IconSettings,
} from '@/components/Icons';

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== 'TEACHER') {
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
    { href: '/teacher', label: 'Khóa học', icon: <IconBook /> },
    { href: '/teacher/classes', label: 'Điểm theo lớp', icon: <IconUsers /> },
    { href: '/teacher/bank', label: 'Ngân hàng đề', icon: <IconLibrary /> },
    { href: '/teacher/latex-guide', label: 'Công thức LaTeX', icon: <IconFlask /> },
    { href: '/teacher/exams', label: 'Kho đề thi', icon: <IconFileText /> },
    { href: '/teacher/exams/matrix', label: 'Tạo đề thi (ma trận)', icon: <IconGrid /> },
    { href: '/teacher/exams/compose', label: 'Soạn đề', icon: <IconPen /> },
    { href: '/teacher/exams/import', label: 'Nhập đề thi', icon: <IconUpload /> },
    { href: '/settings', label: 'Cài đặt', icon: <IconSettings /> },
  ];

  const isActive = (href: string) =>
    href === '/teacher'
      ? pathname === '/teacher' || pathname.startsWith('/teacher/courses')
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
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="user-box">
          <div className="user-name">{user.fullName}</div>
          <div className="user-code">{user.teacherCode || 'Giáo viên'}</div>
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
