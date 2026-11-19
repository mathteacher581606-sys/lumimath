'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import BackButton from '@/components/BackButton';

const TYPES = [
  {
    key: 'PRACTICE_TSA',
    name: 'Đánh giá tư duy',
    short: 'TSA',
    org: 'ĐH Bách khoa Hà Nội',
    color: 'linear-gradient(120deg, #7b1113 0%, #be123c 60%, #d97706 100%)',
    desc: '3 phần: Tư duy Toán học · Tư duy Đọc hiểu · Tư duy Khoa học (môn Toán đang mở)',
    available: true,
  },
  {
    key: 'PRACTICE_HSA',
    name: 'Đánh giá năng lực',
    short: 'HSA',
    org: 'ĐHQG Hà Nội',
    color: 'linear-gradient(120deg, #1e3a8a 0%, #3730a3 60%, #6d28d9 100%)',
    desc: '3 phần: Tư duy định lượng · Tư duy định tính · Khoa học',
    available: false,
  },
];

export default function PracticeRoomPage() {
  const [kind, setKind] = useState('PRACTICE_TSA');
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function load(k: string) {
    setLoading(true);
    try {
      const data = await apiFetch(`/exams/practice-room?kind=${k}`);
      setExams(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container" data-theme="maroon">
      <BackButton to="/student" label="Về Trang chủ" />
      <h1 className="page-title">🎯 Phòng luyện đề</h1>
      <p className="page-subtitle">
        Luyện đề thi thật — giao diện và thời gian giống hệt khi thi. Chọn kỳ thi rồi chọn đề để bắt đầu.
      </p>

      {/* Chọn kỳ thi */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 28 }}>
        {TYPES.map((t) => (
          <div
            key={t.key}
            onClick={() => t.available && setKind(t.key)}
            style={{
              borderRadius: 16,
              padding: 20,
              color: '#fff',
              cursor: t.available ? 'pointer' : 'not-allowed',
              opacity: t.available ? 1 : 0.55,
              background: t.color,
              boxShadow: '0 10px 26px rgba(0,0,0,0.16)',
              border: kind === t.key ? '3px solid #ffd27a' : '3px solid transparent',
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 700 }}>{t.org}</div>
            <div style={{ fontSize: 26, fontWeight: 800, margin: '4px 0 2px' }}>{t.short}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{t.name}</div>
            <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 8, lineHeight: 1.5 }}>{t.desc}</div>
            {!t.available && (
              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, background: 'rgba(255,255,255,0.2)', display: 'inline-block', padding: '3px 10px', borderRadius: 999 }}>
                🚧 Sắp ra mắt
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Danh sách đề */}
      <h2 style={{ fontSize: 18, marginBottom: 14 }}>
        {TYPES.find((t) => t.key === kind)?.short} — Đề luyện
      </h2>
      {loading ? (
        <p>Đang tải…</p>
      ) : exams.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>Chưa có đề luyện cho kỳ thi này</p>
          <p style={{ fontSize: 13 }}>Giáo viên đang soạn đề — quay lại sau nhé!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {exams.map((e) => (
            <div key={e.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: 15.5 }}>{e.title}</h3>
              {e.description && (
                <p style={{ fontSize: 12.5, color: 'var(--color-muted)', margin: '6px 0 10px' }}>{e.description}</p>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <span className="badge">{e.questionCount} câu</span>
                <span className="badge">⏱ {e.duration} phút</span>
                {e.bestScore != null && (
                  <span className="badge badge-success">🏆 Điểm cao nhất: {e.bestScore}/{e.totalScore}</span>
                )}
                {e.attempts > 0 && <span className="badge">Đã làm {e.attempts} lần</span>}
              </div>
              <Link
                href={`/student/exams/${e.id}/take`}
                className="btn"
                style={{ width: '100%', marginTop: 'auto', textDecoration: 'none' }}
              >
                🚀 Vào thi (giống thi thật)
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
