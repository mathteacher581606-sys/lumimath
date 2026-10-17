'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    apiFetch('/admin/stats')
      .then(setStats)
      .catch((e) => console.error(e));
  }, []);

  const cards = [
    { key: 'teachers', label: 'Giáo viên', icon: '👩‍🏫' },
    { key: 'students', label: 'Học sinh', icon: '🧑‍🎓' },
    { key: 'courses', label: 'Khóa học', icon: '📚' },
    { key: 'questions', label: 'Câu hỏi ngân hàng', icon: '📝' },
    { key: 'exams', label: 'Đề thi', icon: '📄' },
    { key: 'attempts', label: 'Bài thi đã nộp', icon: '✅' },
  ];

  return (
    <div className="page-container">
      <h1 className="page-title">Tổng quan hệ thống</h1>
      <p className="page-subtitle">Quản trị toàn bộ nền tảng LumiMath.</p>

      {!stats ? (
        <p>Đang tải…</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 14,
            marginTop: 20,
          }}
        >
          {cards.map((c) => (
            <div key={c.key} className="card" style={{ padding: 20, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>{c.icon}</div>
              <div className="mono" style={{ fontSize: 26, fontWeight: 700 }}>
                {stats[c.key] ?? 0}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>{c.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
