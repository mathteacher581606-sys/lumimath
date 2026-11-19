'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useMe } from '@/lib/use-me';

// Bảng màu gradient cho bìa khóa học (xoay vòng theo thứ tự)
const COVER_GRADIENTS = [
  'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
  'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
  'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
  'linear-gradient(135deg, #d97706 0%, #dc2626 100%)',
  'linear-gradient(135deg, #db2777 0%, #9333ea 100%)',
  'linear-gradient(135deg, #0891b2 0%, #4338ca 100%)',
];
const COVER_ICONS = ['📐', '📈', '🧮', '📊', '🔢', '✏️'];

export default function TeacherDashboard() {
  const [courses, setCourses] = useState<any[]>([]);
  const me = useMe();
  const assistantOnly = !!me?.assistantOnly;
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    grade: '',
    password: '',
    isPublished: true,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

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

  useEffect(() => {
    loadCourses();
  }, []);

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = { title: form.title, isPublished: form.isPublished };
      if (form.description) body.description = form.description;
      if (form.grade) body.grade = Number(form.grade);
      if (form.password) body.password = form.password;
      await apiFetch('/courses', { method: 'POST', body: JSON.stringify(body) });
      setForm({ title: '', description: '', grade: '', password: '', isPublished: true });
      setShowForm(false);
      showToast('✅ Đã tạo khóa học!');
      loadCourses();
    } catch (err: any) {
      showToast('❌ ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  const totalLessons = courses.reduce((s, c) => s + (c._count?.lessons || 0), 0);
  const totalStudents = courses.reduce((s, c) => s + (c._count?.enrollments || 0), 0);
  const publishedCount = courses.filter((c) => c.isPublished).length;

  return (
    <div className="page-container">
      {/* ====== BANNER TỔNG QUAN (cùng phong cách ngân hàng đề) ====== */}
      <div
        style={{
          background: 'linear-gradient(135deg, #312e81 0%, #4c1d95 55%, #6d28d9 100%)',
          color: '#fff',
          padding: '18px 20px',
          borderRadius: 18,
          boxShadow: '0 8px 24px rgba(49,46,129,0.25)',
          marginBottom: 18,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
            }}
          >
            📚
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 className="page-title" style={{ marginBottom: 0, color: '#fff', fontSize: 20 }}>
              Khóa học của tôi
              <span
                style={{
                  fontSize: 11,
                  marginLeft: 10,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: 'rgba(168,85,247,0.35)',
                  border: '1px solid rgba(196,181,253,0.4)',
                  fontWeight: 600,
                  verticalAlign: 'middle',
                }}
              >
                Quản lý giảng dạy
              </span>
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ddd6fe' }}>
              Tạo khóa học, bài giảng, bài tập và theo dõi học sinh
            </p>
          </div>
          {!assistantOnly && (
            <button
              className="btn"
              style={{
                width: 'auto',
                padding: '10px 20px',
                border: 'none',
                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                boxShadow: '0 4px 12px rgba(239,68,68,0.35)',
              }}
              onClick={() => setShowForm(!showForm)}
            >
              {showForm ? 'Hủy' : '+ Tạo khóa học'}
            </button>
          )}
        </div>

        {/* Ô thống kê nhanh */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10,
            marginTop: 14,
            paddingTop: 14,
            borderTop: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: 11, color: '#ddd6fe', display: 'block' }}>Khóa học:</span>
            <b style={{ fontSize: 18, fontWeight: 800 }}>{courses.length}</b>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: 11, color: '#ddd6fe', display: 'block' }}>Bài giảng:</span>
            <b style={{ fontSize: 18, fontWeight: 800 }}>{totalLessons}</b>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: 11, color: '#ddd6fe', display: 'block' }}>Học sinh:</span>
            <b style={{ fontSize: 18, fontWeight: 800 }}>{totalStudents}</b>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: 11, color: '#ddd6fe', display: 'block' }}>Công khai / Nháp:</span>
            <b style={{ fontSize: 18, fontWeight: 800 }}>
              {publishedCount} / {courses.length - publishedCount}
            </b>
          </div>
        </div>
      </div>

      {showForm && !assistantOnly && (
        <form onSubmit={createCourse} className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Tạo khóa học mới</h3>
          <div className="form-group">
            <label>Tên khóa học *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="VD: Toán 12 - Hàm số"
              required
            />
          </div>
          <div className="form-group">
            <label>Mô tả</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Mô tả ngắn về khóa học"
            />
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Lớp</label>
              <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                <option value="">Tất cả</option>
                <option value="10">Lớp 10</option>
                <option value="11">Lớp 11</option>
                <option value="12">Lớp 12</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Mật khẩu tham gia (tùy chọn)</label>
              <input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Để trống = khóa học mở"
              />
            </div>
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
              style={{ width: 'auto' }}
            />
            <label style={{ margin: 0 }}>Công khai (học sinh có thể thấy)</label>
          </div>
          <button className="btn" disabled={saving}>
            {saving ? 'Đang tạo...' : 'Lưu khóa học'}
          </button>
        </form>
      )}

      {loading ? (
        <p>Đang tải...</p>
      ) : courses.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--color-muted)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
          <p style={{ fontSize: 16, fontWeight: 600 }}>Chưa có khóa học nào</p>
          <p style={{ fontSize: 14, marginTop: 4 }}>Nhấn "+ Tạo khóa học" để bắt đầu</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {courses.map((c, i) => (
            <Link
              key={c.id}
              href={`/teacher/courses/${c.id}`}
              className="card course-card"
              style={{
                textDecoration: 'none',
                color: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                padding: 0,
                borderRadius: 16,
                transition: 'transform .15s ease, box-shadow .15s ease',
              }}
            >
              {/* Bìa khóa học: ảnh đại diện nếu có, không thì gradient */}
              <div
                style={{
                  background: c.coverUrl ? '#000' : COVER_GRADIENTS[i % COVER_GRADIENTS.length],
                  padding: '22px 18px',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  position: 'relative',
                  overflow: 'hidden',
                  minHeight: 96,
                }}
              >
                {c.coverUrl && (
                  <>
                    <img
                      src={c.coverUrl}
                      alt={c.title}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 70%)' }} />
                  </>
                )}
                <span style={{ fontSize: 34, position: 'relative', zIndex: 1 }}>{COVER_ICONS[i % COVER_ICONS.length]}</span>
                <div style={{ minWidth: 0, position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: 10, letterSpacing: 1.5, opacity: 0.85, textTransform: 'uppercase', fontWeight: 700 }}>
                    {c.subject || 'Toán'}
                    {c.grade ? ` · Lớp ${c.grade}` : ' · THPT'}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>{c.title}</div>
                </div>
              </div>
              {/* Thân thẻ */}
              <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column' }}>
                {c.description && (
                  <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 10 }}>
                    {c.description}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {c.isAssistant && (
                    <span className="badge" style={{ background: 'rgba(232,163,61,0.25)', color: '#7a5a10', border: '1px solid rgba(232,163,61,0.5)' }}>
                      👥 Trợ giảng
                    </span>
                  )}
                  {c.password ? (
                    <span className="badge badge-warning">🔒 Có mật khẩu</span>
                  ) : (
                    <span className="badge badge-success">🔓 Mở</span>
                  )}
                  {c.isPublished ? (
                    <span className="badge badge-accent">Công khai</span>
                  ) : (
                    <span className="badge badge-warning">Bản nháp</span>
                  )}
                </div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 'auto' }}>
                  {c._count?.lessons ?? 0} bài giảng · {c._count?.enrollments ?? 0} học sinh
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
