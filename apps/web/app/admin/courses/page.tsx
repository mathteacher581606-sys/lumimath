'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<any[] | null>(null);
  const [courseId, setCourseId] = useState('');
  const [emailsText, setEmailsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await apiFetch('/admin/courses');
      setCourses(data || []);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function enroll() {
    const emails = emailsText
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes('@'));
    if (!courseId) {
      alert('Chọn khóa học trước');
      return;
    }
    if (!emails.length) {
      alert('Nhập ít nhất một email (mỗi email một dòng hoặc cách nhau dấu phẩy)');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await apiFetch(`/admin/courses/${courseId}/enroll`, {
        method: 'POST',
        body: JSON.stringify({ emails }),
      });
      setResult(r);
      showToast(`Đã thêm ${r.enrolled.length} · tạo mới ${r.created.length} tài khoản`);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadCreated() {
    if (!result?.created?.length) return;
    const header = ['Email', 'Mật khẩu'];
    const lines = result.created.map((a: any) =>
      [a.email, a.password].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','),
    );
    const csv = '\uFEFF' + header.join(',') + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tai-khoan-moi-tao.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const selected = courses?.find((c) => c.id === courseId);

  return (
    <div className="page-container">
      <h1 className="page-title">Khóa học</h1>
      <p className="page-subtitle">
        Thêm nhiều tài khoản học sinh vào một khóa học (email chưa tồn tại sẽ được tạo tự động).
      </p>

      <div className="card" style={{ padding: 20, maxWidth: 720 }}>
        <div className="form-group">
          <label>Chọn khóa học</label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            style={{ padding: 10, border: '1.5px solid var(--color-rule)', borderRadius: 10, fontSize: 14, background: 'var(--color-paper-2)' }}
          >
            <option value="">— Chọn khóa học —</option>
            {courses?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} · {c.teacher} · {c.studentCount} HS
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Danh sách email (mỗi email một dòng, hoặc cách nhau dấu phẩy/chấm phẩy)</label>
          <textarea
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
            rows={7}
            placeholder={'nguyenvana@gmail.com\nnguyenvanb@gmail.com\n...'}
            style={{ width: '100%', padding: 10, border: '1.5px solid var(--color-rule)', borderRadius: 10, fontSize: 14, fontFamily: 'monospace' }}
          />
        </div>

        <button className="btn" style={{ width: 'auto' }} disabled={busy} onClick={enroll}>
          {busy ? 'Đang thêm…' : '➕ Thêm vào khóa học'}
        </button>

        {result && (
          <div className="card" style={{ padding: 16, marginTop: 16, fontSize: 14 }}>
            <h2 style={{ fontSize: 15, marginBottom: 8 }}>Kết quả</h2>
            <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
              <li>✅ Đã thêm vào khóa học: <strong>{result.enrolled.length}</strong>{result.enrolled.length > 0 && ` (${result.enrolled.join(', ')})`}</li>
              <li>🆕 Tài khoản mới được tạo: <strong>{result.created.length}</strong>{result.created.length > 0 && ' — tải file để lấy mật khẩu'}</li>
              <li>♻️ Đã có trong khóa học: <strong>{result.already.length}</strong>{result.already.length > 0 && ` (${result.already.join(', ')})`}</li>
              <li>⚠️ Không phải học sinh (giáo viên/admin): <strong>{result.notStudent.length}</strong>{result.notStudent.length > 0 && ` (${result.notStudent.join(', ')})`}</li>
            </ul>
            {result.created.length > 0 && (
              <button className="btn" style={{ width: 'auto', marginTop: 10, padding: '8px 14px', fontSize: 13 }} onClick={downloadCreated}>
                📄 Tải danh sách tài khoản mới + mật khẩu
              </button>
            )}
          </div>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
