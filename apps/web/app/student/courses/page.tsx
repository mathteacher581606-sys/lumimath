'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { SkeletonCards } from '@/components/Skeleton';

const COVERS = ['📐', '📈', '🧮', '📊', '🔢', '✏️', '📏', '➗'];

export default function BrowseCourses() {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [passwordModal, setPasswordModal] = useState<any | null>(null);
  const [password, setPassword] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    setLoading(true);
    try {
      const data = await apiFetch('/courses');
      setCourses(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleEnroll(course: any) {
    if (course.password) {
      setPasswordModal(course);
      setPassword('');
    } else {
      doEnroll(course.id, undefined);
    }
  }

  async function doEnroll(courseId: string, pwd?: string) {
    setEnrolling(courseId);
    try {
      const body: any = {};
      if (pwd) body.password = pwd;
      await apiFetch(`/courses/${courseId}/enroll`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPasswordModal(null);
      showToast('✅ Đăng ký khóa học thành công!');
      loadCourses();
    } catch (err: any) {
      showToast('❌ ' + err.message);
    } finally {
      setEnrolling(null);
    }
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Khám phá khóa học</h1>

      {loading ? (
        <SkeletonCards count={6} height={168} />
      ) : courses.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--color-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <p style={{ fontSize: 16, fontWeight: 600 }}>Chưa có khóa học công khai</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {courses.map((c) => (
            <div key={c.id} className="card course-card">
              <div className="course-cover" style={{ background: c.coverUrl ? '#000' : undefined, position: 'relative', overflow: 'hidden' }}>
                {c.coverUrl && (
                  <img
                    src={c.coverUrl}
                    alt={c.title}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                <div style={{ position: 'absolute', inset: 0, background: c.coverUrl ? 'linear-gradient(to top, rgba(0,0,0,0.45), transparent 60%)' : undefined }} />
                <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="cover-subject">{c.subject || 'Toán'}</span>
                  {c.grade ? (
                    <span style={{ marginLeft: 10 }}>LỚP {c.grade}</span>
                  ) : (
                    <span style={{ marginLeft: 10 }}>THPT</span>
                  )}
                  {c.password && <span style={{ marginLeft: 10 }}>· KHÓA</span>}
                </div>
              </div>
              <div className="course-title">{c.title}</div>
              {c.description && (
                <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 10 }}>{c.description}</p>
              )}
              <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 14 }}>
                {c.teacher?.fullName || 'Giáo viên'} · {c._count?.lessons ?? 0} bài giảng
              </p>
              <button
                className="btn"
                style={{ marginTop: 'auto' }}
                onClick={() => handleEnroll(c)}
                disabled={enrolling === c.id}
              >
                {c.password ? 'Nhập mã để đăng ký' : enrolling === c.id ? 'Đang đăng ký…' : 'Đăng ký khóa học'}
              </button>
            </div>
          ))}
        </div>
      )}

      {passwordModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            padding: 20,
          }}
          onClick={() => setPasswordModal(null)}
        >
          <div className="auth-card" onClick={(e) => e.stopPropagation()}>
            <div className="logo">🔒</div>
            <h1>Khóa học có mật khẩu</h1>
            <p className="subtitle">
              Nhập mật khẩu để tham gia: <strong>{passwordModal.title}</strong>
            </p>
            <div className="form-group">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu khóa học"
                autoFocus
              />
            </div>
            <button
              className="btn"
              onClick={() => doEnroll(passwordModal.id, password)}
              disabled={enrolling === passwordModal.id}
            >
              {enrolling === passwordModal.id ? 'Đang kiểm tra...' : 'Đăng ký'}
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
