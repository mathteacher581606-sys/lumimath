'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function StudentExams() {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Luyện nhanh theo chủ đề
  const [topics, setTopics] = useState<any>(null);
  const [selTopic, setSelTopic] = useState('');
  const [selDiff, setSelDiff] = useState('');
  const [selCount, setSelCount] = useState('10');
  const [quickBusy, setQuickBusy] = useState(false);

  useEffect(() => {
    load();
    apiFetch('/exams/practice/topics').then(setTopics).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch('/exams/available');
      setExams(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function startQuick() {
    if (!selTopic) {
      alert('Vui lòng chọn chủ đề');
      return;
    }
    setQuickBusy(true);
    try {
      const data = await apiFetch('/exams/quick-practice', {
        method: 'POST',
        body: JSON.stringify({
          topicId: selTopic,
          difficulty: selDiff || null,
          count: Number(selCount) || 10,
        }),
      });
      window.location.href = `/student/exams/${data.examId}/take`;
    } catch (e: any) {
      alert(e.message);
      setQuickBusy(false);
    }
  }

  return (
    <div className="page-container">
      <h1 className="page-title">📝 Thi thử online</h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 14, marginBottom: 20 }}>
        Làm đề thi trực tuyến, chấm điểm tự động ngay sau khi nộp bài.
      </p>

      {/* ===== Luyện nhanh theo chủ đề ===== */}
      <div className="card" style={{ padding: 16, marginBottom: 22 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>⚡ Luyện nhanh theo chủ đề</h3>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
          Chọn chủ đề bất kỳ trong ngân hàng đề của giáo viên để luyện ngay.
        </p>
        {!topics ? (
          <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Đang tải chủ đề…</p>
        ) : topics.topics?.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>{topics.message}</p>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 2, minWidth: 200, marginBottom: 0 }}>
              <label style={{ fontSize: 12 }}>Chủ đề</label>
              <select value={selTopic} onChange={(e) => setSelTopic(e.target.value)}>
                <option value="">— Chọn chủ đề —</option>
                {topics.topics.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.count} câu)
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ width: 150, marginBottom: 0 }}>
              <label style={{ fontSize: 12 }}>Độ khó</label>
              <select value={selDiff} onChange={(e) => setSelDiff(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="NHAN_BIET">Nhận biết</option>
                <option value="THONG_HIEU">Thông hiểu</option>
                <option value="VAN_DUNG">Vận dụng</option>
                <option value="VAN_DUNG_CAO">Vận dụng cao</option>
              </select>
            </div>
            <div className="form-group" style={{ width: 110, marginBottom: 0 }}>
              <label style={{ fontSize: 12 }}>Số câu</label>
              <input
                type="number"
                min={1}
                max={20}
                value={selCount}
                onChange={(e) => setSelCount(e.target.value)}
              />
            </div>
            <button
              className="btn"
              style={{ width: 'auto', padding: '9px 18px' }}
              disabled={quickBusy || !selTopic}
              onClick={startQuick}
            >
              {quickBusy ? 'Đang tạo đề…' : '🚀 Luyện ngay'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p>Đang tải...</p>
      ) : exams.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--color-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📝</div>
          <p style={{ fontSize: 16, fontWeight: 600 }}>Chưa có đề thi công khai</p>
          <p style={{ fontSize: 14, marginTop: 4 }}>Chờ giáo viên công khai đề thi nhé!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {exams.map((ex) => (
            <div key={ex.id} className="card">
              <h3 className="card-title">{ex.title}</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <span className="badge">{ex.teacher?.fullName || 'Giáo viên'}</span>
                <span className="badge">{ex._count?.items ?? 0} câu</span>
                <span className="badge">{ex.duration} phút</span>
              </div>
              <p className="mono" style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 14 }}>
                Tổng điểm: {ex.totalScore} · Lần đã làm: {ex.myAttempts || 0}
              </p>
              <Link
                href={`/student/exams/${ex.id}/take`}
                className="btn"
                style={{ textDecoration: 'none', textAlign: 'center', display: 'block' }}
              >
                Làm bài
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
