'use client';

import { useEffect, useState } from 'react';
import { getUser } from '@/lib/api';
import StudentLayout from '../student/layout';
import TeacherLayout from '../teacher/layout';

// Trang Cài đặt hiển thị bên trong khung (menu trái) của đúng vai trò
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setRole(getUser()?.role || 'NONE');
  }, []);

  if (!role) return <div style={{ padding: 40, textAlign: 'center' }}>Đang tải…</div>;
  if (role === 'STUDENT') return <StudentLayout>{children}</StudentLayout>;
  if (role === 'TEACHER') return <TeacherLayout>{children}</TeacherLayout>;
  return <main className="main-content">{children}</main>;
}
