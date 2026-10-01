'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function TeacherDashboard() {
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', grade: '' });
  const [saving, setSaving] = useState(false);

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
      const body: any = { title: form.title };
      if (form.description) body.description = form.description;
      if (form.grade) body.grade = Number(form.grade);
      await apiFetch('/courses', { method: 'POST', body: JSON.stringify(body) });
      setForm({ title: '', description: '', grade: '' });
      setShowForm(false);
      loadCourses();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h2>Khóa học của tôi</h2>
        <button
          className="btn"
          style={{ width: 'auto', padding: '10px 18px' }}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Hủy' : '+ Tạo khóa học'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={createCourse}
          style={{
            background: '#fff',
            padding: 20,
            borderRadius: 12,
            marginBottom: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <div className="form-group">
            <label>Tên khóa học *</label>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Mô tả</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Lớp (10/11/12)</label>
            <input
              type="number"
              value={form.grade}
              onChange={(e) => setForm({ ...form, grade: e.target.value })}
            />
          </div>
          <button className="btn" disabled={saving}>
            {saving ? 'Đang tạo...' : 'Lưu khóa học'}
          </button>
        </form>
      )}

      {loading ? (
        <p>Đang tải...</p>
      ) : courses.length === 0 ? (
        <p style={{ color: '#666' }}>Chưa có khóa học nào. Hãy tạo khóa học đầu tiên!</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {courses.map((c) => (
            <div
              key={c.id}
              style={{
                background: '#fff',
                padding: 20,
                borderRadius: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>{c.title}</h3>
              {c.description && (
                <p style={{ color: '#666', fontSize: 14, marginBottom: 8 }}>{c.description}</p>
              )}
              <div style={{ fontSize: 13, color: '#888' }}>
                📚 {c._count?.lessons ?? 0} bài giảng · 👨‍🎓 {c._count?.enrollments ?? 0} học sinh
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
