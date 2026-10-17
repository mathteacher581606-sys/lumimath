'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      if (data.sent === false && data.message) {
        setError(
          'Hệ thống email chưa được cấu hình. Vui lòng liên hệ giáo viên để được hỗ trợ đặt lại mật khẩu.',
        );
      } else {
        setDone(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="logo">🔐</div>
        <h1>Quên mật khẩu</h1>
        {done ? (
          <>
            <p className="subtitle">
              Nếu email <strong>{email}</strong> tồn tại trong hệ thống, chúng tôi đã gửi
              liên kết đặt lại mật khẩu (hiệu lực 30 phút).
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 10 }}>
              Hãy kiểm tra hộp thư đến và cả mục Spam.
            </p>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="subtitle">
              Nhập email đăng ký tài khoản — chúng tôi sẽ gửi liên kết đặt lại mật khẩu.
            </p>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@lumimath.vn"
                required
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button className="btn" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}
            </button>
          </form>
        )}
        <Link
          href="/login"
          style={{
            display: 'block',
            textAlign: 'center',
            marginTop: 16,
            fontSize: 13,
            color: 'var(--color-accent)',
          }}
        >
          ← Quay lại đăng nhập
        </Link>
      </div>
    </div>
  );
}
