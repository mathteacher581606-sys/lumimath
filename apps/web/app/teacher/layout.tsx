'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getUser, logout } from '@/lib/api';

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

  if (!user) return <div className="page-container">Đang tải...</div>;

  const navStyle = (active: boolean) => ({
    padding: '6px 14px',
    borderRadius: 8,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: 14,
    color: active ? '#fff' : '#555',
    background: active ? '#2563eb' : 'transparent',
  });

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <h1 style={{ fontSize: 18 }}>🎓 LumiMath</h1>
          <nav style={{ display: 'flex', gap: 8 }}>
            <Link href="/teacher" style={navStyle(pathname === '/teacher')}>
              Khóa học
            </Link>
            <Link
              href="/teacher/bank"
              style={navStyle(pathname === '/teacher/bank')}
            >
              Ngân hàng đề
            </Link>
            <Link
              href="/teacher/exams/new"
              style={navStyle(pathname === '/teacher/exams/new')}
            >
              Tạo đề thi
            </Link>
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, color: '#555' }}>{user.fullName}</span>
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
      </div>
      {children}
    </div>
  );
}
