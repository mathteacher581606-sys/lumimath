'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, getUser } from '@/lib/api';
import { useMe } from '@/lib/use-me';

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

// "chờ 3 ngày" / "chờ 5 giờ"
function waited(iso: string | null) {
  if (!iso) return '';
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'vừa nộp';
  if (h < 24) return `chờ ${h} giờ`;
  return `chờ ${Math.floor(h / 24)} ngày`;
}

function gradeHref(i: any) {
  return `/teacher/courses/${i.courseId}/assignments/${i.assignmentId}/grade`;
}

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
  const [grading, setGrading] = useState<any>(null);

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
    apiFetch('/teacher/grading-summary')
      .then(setGrading)
      .catch(() => setGrading({ totalPending: 0, totalUnpublished: 0, items: [] }));
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
      showToast('Đã tạo khóa học');
      loadCourses();
    } catch (err: any) {
      showToast(err.message || 'Không tạo được khóa học');
    } finally {
      setSaving(false);
    }
  }

  const totalLessons = courses.reduce((s, c) => s + (c._count?.lessons || 0), 0);
  const totalStudents = courses.reduce((s, c) => s + (c._count?.enrollments || 0), 0);
  const publishedCount = courses.filter((c) => c.isPublished).length;

  const [name, setName] = useState('thầy cô');
  useEffect(() => {
    const n = (getUser()?.fullName || '').trim().split(/\s+/).pop();
    if (n) setName(n);
  }, []);
  const pendingItems = (grading?.items || []).filter((i: any) => i.pending > 0);
  const lead = pendingItems[0];
  const rest = (grading?.items || []).filter((i: any) => i !== lead).slice(0, 4);
  const oldDays = lead?.oldestSubmittedAt
    ? (Date.now() - new Date(lead.oldestSubmittedAt).getTime()) / 86400000
    : 0;

  return (
    <div className="page-container sh">
      {/* ===== Lời chào + số liệu nhanh ===== */}
      <section className="sh-hello" aria-labelledby="tc-hello">
        <div className="sh-hello-text">
          <h1 id="tc-hello">
            {greeting()}, {name}!
          </h1>
          <p>{assistantOnly ? 'Bạn đang là trợ giảng cho các khóa học dưới đây.' : 'Đây là việc cần làm hôm nay.'}</p>
        </div>
        <div className="sh-chips">
          <span className="chip">{courses.length} khóa học</span>
          <span className="chip">{totalLessons} bài giảng</span>
          <span className="chip">{totalStudents} học sinh</span>
        </div>
      </section>

      {/* ===== Nhắc việc chấm bài cỡ lớn ===== */}
      {!grading ? (
        <div className="sh-lead skeleton" style={{ height: 200 }} aria-hidden="true" />
      ) : lead ? (
        <section className={`sh-lead ${oldDays >= 2 ? 'is-urgent' : ''}`} aria-labelledby="tc-lead">
          <p className="sh-lead-kicker">
            Cần chấm · {waited(lead.oldestSubmittedAt)}
            {grading.totalPending > lead.pending ? ` · tổng ${grading.totalPending} bài` : ''}
          </p>
          <h2 id="tc-lead" className="sh-lead-title">
            {lead.pending} bài “{lead.title}” đang chờ chấm
          </h2>
          <p className="sh-lead-sub">{lead.courseTitle}</p>
          <Link href={gradeHref(lead)} className="sh-cta">
            Chấm ngay
          </Link>
        </section>
      ) : (
        <section className="sh-lead is-calm" aria-labelledby="tc-lead">
          <p className="sh-lead-kicker">Chấm bài</p>
          <h2 id="tc-lead" className="sh-lead-title">Không còn bài nào chờ chấm</h2>
          <p className="sh-lead-sub">
            {grading.totalUnpublished > 0
              ? `Còn ${grading.totalUnpublished} bài đã chấm nhưng chưa công bố điểm.`
              : 'Mọi bài nộp đều đã được chấm và công bố.'}
          </p>
          <Link href="/teacher/exams" className="sh-cta">
            Soạn đề mới
          </Link>
        </section>
      )}

      {rest.length > 0 && (
        <section aria-label="Bài giao khác cần xử lý" className="sh-cards">
          {rest.map((i: any) => (
            <Link key={i.assignmentId} href={gradeHref(i)} className="sh-task">
              <span className="sh-task-meta">
                {i.pending > 0 ? `${i.pending} bài chờ chấm · ${waited(i.oldestSubmittedAt)}` : `${i.unpublished} bài chưa công bố điểm`}
              </span>
              <span className="sh-task-title">{i.title}</span>
              <span className="sh-task-course">{i.courseTitle}</span>
              <span className="sh-task-btn">{i.pending > 0 ? 'Chấm bài' : 'Công bố điểm'}</span>
            </Link>
          ))}
        </section>
      )}

      {/* ===== Khóa học ===== */}
      <section aria-labelledby="tc-courses" className="tc-courses">
        <div className="tc-courses-head">
          <div>
            <h2 id="tc-courses">Khóa học của tôi</h2>
            <p className="sh-muted">
              {publishedCount} công khai · {courses.length - publishedCount} bản nháp
            </p>
          </div>
          {!assistantOnly && (
            <button type="button" className="btn sh-btn-accent tc-new" aria-expanded={showForm} onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Đóng' : '+ Tạo khóa học'}
            </button>
          )}
        </div>

        {showForm && !assistantOnly && (
          <form onSubmit={createCourse} className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 16 }}>Tạo khóa học mới</h3>
            <div className="form-group">
              <label htmlFor="c-title">Tên khóa học *</label>
              <input
                id="c-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="VD: Toán 12 - Hàm số"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="c-desc">Mô tả</label>
              <input
                id="c-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Mô tả ngắn về khóa học"
              />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label htmlFor="c-grade">Lớp</label>
                <select id="c-grade" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                  <option value="">Tất cả</option>
                  <option value="10">Lớp 10</option>
                  <option value="11">Lớp 11</option>
                  <option value="12">Lớp 12</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: '1 1 200px' }}>
                <label htmlFor="c-pass">Mật khẩu tham gia (tùy chọn)</label>
                <input
                  id="c-pass"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Để trống = khóa học mở"
                />
              </div>
            </div>
            <label className="st-switch" style={{ marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
              />
              Công khai (học sinh có thể thấy)
            </label>
            <button className="btn sh-btn-accent" disabled={saving}>
              {saving ? 'Đang tạo…' : 'Lưu khóa học'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="tc-grid" aria-hidden="true">
            {[0, 1, 2].map((k) => (
              <div key={k} className="skeleton" style={{ height: 190, borderRadius: 'var(--radius-card)' }} />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="sh-box" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontWeight: 700 }}>Chưa có khóa học nào</p>
            <p className="sh-muted">Nhấn “+ Tạo khóa học” để bắt đầu.</p>
          </div>
        ) : (
          <div className="tc-grid">
            {courses.map((c) => (
              <Link key={c.id} href={`/teacher/courses/${c.id}`} className="tc-course">
                <div className="tc-cover">
                  {c.coverUrl ? (
                    <img src={c.coverUrl} alt="" />
                  ) : (
                    <span className="tc-cover-mark" aria-hidden="true">
                      {c.grade ? c.grade : 'Σ'}
                    </span>
                  )}
                </div>
                <div className="tc-body">
                  <span className="tc-meta">
                    {c.subject || 'Toán'}
                    {c.grade ? ` · Lớp ${c.grade}` : ' · THPT'}
                  </span>
                  <span className="tc-title">{c.title}</span>
                  {c.description && <span className="tc-desc">{c.description}</span>}
                  <span className="tc-tags">
                    {c.isAssistant && <span className="chip">Trợ giảng</span>}
                    <span className="chip">{c.password ? 'Có mật khẩu' : 'Mở'}</span>
                    <span className={`chip ${c.isPublished ? '' : 'chip-hot'}`}>{c.isPublished ? 'Công khai' : 'Bản nháp'}</span>
                  </span>
                  <span className="tc-count">
                    {c._count?.lessons ?? 0} bài giảng · {c._count?.enrollments ?? 0} học sinh
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
