'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'STUDENT',
    school: '',
    className: '',
    workplace: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const body: any = {
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        role: form.role,
      };
      if (form.school) body.school = form.school;
      if (form.role === 'STUDENT' && form.className) body.className = form.className;
      if (form.role === 'TEACHER' && form.workplace) body.workplace = form.workplace;

      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      alert('Đăng ký thành công! Hãy đăng nhập.');
      router.push('/login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>🎓 Đăng ký</h1>
        <p className="subtitle">Tạo tài khoản LumiMath</p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Họ tên</label>
            <input value={form.fullName} onChange={(e) => update('fullName', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Mật khẩu (tối thiểu 6 ký tự)</label>
            <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Vai trò</label>
            <select value={form.role} onChange={(e) => update('role', e.target.value)}>
              <option value="STUDENT">Học sinh</option>
              <option value="TEACHER">Giáo viên</option>
            </select>
          </div>
          <div className="form-group">
            <label>Trường</label>
            <input value={form.school} onChange={(e) => update('school', e.target.value)} />
          </div>
          {form.role === 'STUDENT' ? (
            <div className="form-group">
              <label>Lớp (ví dụ 12A1)</label>
              <input value={form.className} onChange={(e) => update('className', e.target.value)} />
            </div>
          ) : (
            <div className="form-group">
              <label>Nơi công tác</label>
              <input value={form.workplace} onChange={(e) => update('workplace', e.target.value)} />
            </div>
          )}
          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Đang đăng ký...' : 'Đăng ký'}
          </button>
        </form>
        <p className="link">
          Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
