'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import Logo from '@/components/Logo';

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
  // OTP xác thực email (bắt buộc với HỌC SINH)
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpMsg, setOtpMsg] = useState('');

  function update(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function sendOtp() {
    if (!form.email) {
      setError('Vui lòng nhập email trước khi gửi mã');
      return;
    }
    setOtpBusy(true);
    setError('');
    setOtpMsg('');
    try {
      await apiFetch('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ email: form.email.trim().toLowerCase() }),
      });
      setOtpSent(true);
      setOtpMsg('✅ Đã gửi mã 6 số tới email — mã có hiệu lực 5 phút');
      setOtpCooldown(60);
      const t = setInterval(() => {
        setOtpCooldown((c) => {
          if (c <= 1) {
            clearInterval(t);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setOtpBusy(false);
    }
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
      if (form.role === 'STUDENT') {
        if (!otp.trim()) {
          setError('Vui lòng nhập mã xác nhận email (OTP)');
          setLoading(false);
          return;
        }
        body.otp = otp.trim();
      }

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
    <div className="auth-shell">
      {/* Cột trái — lời mở đầu */}
      <aside className="auth-aside">
        <div className="auth-wordmark"><Logo size={30} /></div>
        <div>
          <h2>Ngân hàng đề cho thầy cô. Sân luyện cho học trò.</h2>
          <p className="tagline">
            Giáo viên soạn đề bằng LaTeX, giao bài và theo dõi tiến độ. Học sinh
            làm đề, xem lời giải chi tiết và tích lũy kinh nghiệm mỗi ngày.
          </p>
        </div>
        <div className="math-marks">
          {`\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}`}
          <br />
          {`\\binom{n}{k} = \\frac{n!}{k!(n-k)!}`}
          <br />
          {`\\triangle ABC: \\; a^2 = b^2 + c^2 - 2bc\\cos A`}
        </div>
      </aside>

      {/* Cột phải — form đăng ký */}
      <div className="auth-form-side">
        <div className="auth-card">
          <h1>Tạo tài khoản</h1>
          <p className="subtitle">Bắt đầu sử dụng LumiMath.</p>

          {error && <div className="error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Họ tên</label>
              <input
                value={form.fullName}
                onChange={(e) => update('fullName', e.target.value)}
                placeholder="Nguyễn Văn A"
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="email@truong.edu.vn"
                autoComplete="email"
                required
              />
            </div>
            {form.role === 'STUDENT' && (
              <div className="form-group">
                <label>Mã xác nhận email (OTP)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Nhập 6 số"
                    inputMode="numeric"
                    maxLength={6}
                    style={{ flex: 1, letterSpacing: 4, fontFamily: 'monospace', fontWeight: 700 }}
                    required
                  />
                  <button
                    type="button"
                    onClick={sendOtp}
                    disabled={otpBusy || otpCooldown > 0}
                    style={{ width: 'auto', padding: '0 14px', fontSize: 13, borderRadius: 8, border: 'none', background: otpCooldown > 0 ? '#d6d3cd' : 'var(--lm-amber, #c2703d)', color: '#fff', fontWeight: 700, cursor: otpCooldown > 0 ? 'default' : 'pointer' }}
                  >
                    {otpBusy ? 'Đang gửi…' : otpCooldown > 0 ? `Gửi lại (${otpCooldown}s)` : otpSent ? 'Gửi lại mã' : 'Gửi mã'}
                  </button>
                </div>
                {otpMsg && (
                  <p style={{ fontSize: 12.5, color: 'var(--color-success, #15803d)', marginTop: 6 }}>{otpMsg}</p>
                )}
                <p style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 6 }}>
                  Bấm "Gửi mã" → mở email → nhập mã 6 số (hiệu lực 5 phút). Không thấy mã? Kiểm tra mục Spam.
                </p>
              </div>
            )}
            <div className="form-group">
              <label>Mật khẩu (tối thiểu 6 ký tự)</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="••••••"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="form-group">
              <label>Bạn là</label>
              <select value={form.role} onChange={(e) => update('role', e.target.value)}>
                <option value="STUDENT">Học sinh</option>
                <option value="TEACHER">Giáo viên</option>
              </select>
            </div>
            <div className="form-group">
              <label>Trường</label>
              <input
                value={form.school}
                onChange={(e) => update('school', e.target.value)}
                placeholder="THPT …"
              />
            </div>
            {form.role === 'STUDENT' ? (
              <div className="form-group">
                <label>Lớp (ví dụ 12A1)</label>
                <input
                  value={form.className}
                  onChange={(e) => update('className', e.target.value)}
                  placeholder="12A1"
                />
              </div>
            ) : (
              <div className="form-group">
                <label>Nơi công tác</label>
                <input
                  value={form.workplace}
                  onChange={(e) => update('workplace', e.target.value)}
                  placeholder="Tỉnh/Thành phố"
                />
              </div>
            )}
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Đang đăng ký…' : 'Đăng ký'}
            </button>
          </form>

          <p className="link">
            Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
