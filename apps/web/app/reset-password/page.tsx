'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    if (password !== confirm) {
      setError('Xác nhận mật khẩu không khớp');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, token, newPassword: password }),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="logo">🔑</div>
      <h1>Đặt lại mật khẩu</h1>
      {done ? (
        <>
          <p className="subtitle">Mật khẩu đã được đặt lại thành công!</p>
          <Link href="/login" className="btn" style={{ width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 14 }}>
            Đăng nhập ngay
          </Link>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="subtitle">
            Tạo mật khẩu mới cho tài khoản <strong>{email}</strong>
          </p>
          <div className="form-group">
            <label>Mật khẩu mới (tối thiểu 6 ký tự)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Xác nhận mật khẩu mới</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Đang lưu…' : 'Đặt lại mật khẩu'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="auth-page">
      <Suspense fallback={<div className="auth-card"><p>Đang tải…</p></div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
