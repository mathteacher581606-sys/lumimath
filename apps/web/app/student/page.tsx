'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, logout } from '@/lib/api';

export default function StudentPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== 'STUDENT') {
      router.push('/login');
      return;
    }
    setUser(u);
  }, [router]);

  if (!user) return <div className="page-container">Đang tải...</div>;

  return (
    <div>
      <div className="topbar">
        <h1>🎓 LumiMath — Cổng Học sinh</h1>
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
      <div className="page-container">
        <h2>Xin chào, {user.fullName} 👋</h2>
        <p style={{ marginTop: 8, color: '#666' }}>
          Mã học sinh: {user.studentCode || 'Chưa có'}
        </p>
        <p style={{ marginTop: 16 }}>
          🚧 Cổng Học sinh đang được xây dựng (Phần 7c)...
        </p>
      </div>
    </div>
  );
}
