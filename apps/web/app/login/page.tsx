'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, saveAuth } from '@/lib/api';
import Logo from '@/components/Logo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveAuth(data.accessToken, data.user);
      if (data.user.role === 'TEACHER') {
        router.push('/teacher');
      } else if (data.user.role === 'ADMIN') {
        router.push('/admin');
      } else {
        router.push('/student');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      {/* Cột trái — lời mở đầu (editorial) */}
      <aside className="auth-aside">
        <div className="auth-wordmark"><Logo size={30} /></div>
        <div>
          <h2>Luyện tập mỗi ngày. Tiến bộ từng ngày.</h2>
          <p className="tagline">
            Ngân hàng đề theo chuẩn chương trình phổ thông. Biên dịch LaTeX trực
            tiếp trên web. Chấm điểm tự động và lời giải chi tiết cho từng câu.
          </p>
        </div>
        <div className="math-marks">
          {`f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}`}
          <br />
          {`\\int_a^b f(x)\\,dx = F(b) - F(a)`}
          <br />
          {`e^{i\\pi} + 1 = 0`}
          <br />
          {`\\sqrt{2} \\notin \\mathbb{Q}`}
        </div>
      </aside>

      {/* Cột phải — form đăng nhập */}
      <div className="auth-form-side">
        <div className="auth-card">
          <h1>Đăng nhập</h1>
          <p className="subtitle">Chào mừng trở lại.</p>

          {error && <div className="error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@lumimath.vn"
                autoComplete="email"
                required
              />
            </div>
            <div className="form-group">
              <label>Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                autoComplete="current-password"
                required
              />
            </div>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
          </form>

          <p className="link">
            Chưa có tài khoản? <Link href="/register">Đăng ký</Link>
          </p>
          <p className="link" style={{ marginTop: 8 }}>
            <Link href="/forgot-password">Quên mật khẩu?</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
