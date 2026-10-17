'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, logout, apiFetch } from '@/lib/api';
import { THEMES, getTheme, setTheme } from '@/lib/theme';

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [current, setCurrent] = useState('paper');

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.push('/login');
      return;
    }
    setUser(u);
    setCurrent(getTheme());
  }, [router]);

  function pickTheme(id: string) {
    setTheme(id);
    setCurrent(id);
  }

  if (!user) return <div style={{ padding: 40 }}>Đang tải...</div>;

  return (
    <div className="page-container">
      <h1 className="page-title">Cài đặt</h1>
      <p className="page-subtitle">
        Tùy chỉnh giao diện và xem thông tin tài khoản của bạn.
      </p>

      <div className="card">
        <h2 style={{ fontSize: 17, marginBottom: 14 }}>Thông tin tài khoản</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 2 }}>Họ tên</div>
            <div style={{ fontWeight: 600 }}>{user.fullName}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 2 }}>Email</div>
            <div style={{ fontWeight: 600 }}>{user.email}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 2 }}>Vai trò</div>
            <div style={{ fontWeight: 600 }}>
              {user.role === 'TEACHER' ? 'Giáo viên' : 'Học sinh'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 2 }}>Mã định danh</div>
            <div className="mono" style={{ fontWeight: 600 }}>
              {user.teacherCode || user.studentCode || '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 17, marginBottom: 4 }}>Màu giao diện</h2>
        <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 16 }}>
          Chọn bảng màu cho toàn bộ ứng dụng. Thay đổi áp dụng ngay lập tức.
        </p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`theme-option ${current === t.id ? 'selected' : ''}`}
              onClick={() => pickTheme(t.id)}
            >
              <div className="swatch" style={{ background: t.paper }}>
                <span className="dot" style={{ background: t.ink }} />
                <span className="bar" style={{ background: t.rule }} />
                <span className="dot" style={{ background: t.accent }} />
              </div>
              <div className="theme-name">{t.name}</div>
              <div className="theme-desc">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Đổi mật khẩu</h2>
        <ChangePasswordForm />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Thông báo</h2>
        <EmailNotifyToggle />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: 17, marginBottom: 12 }}>Phiên đăng nhập</h2>
        <button
          className="btn btn-outline"
          style={{ width: 'auto' }}
          onClick={() => {
            logout();
            router.push('/login');
          }}
        >
          Đăng xuất
        </button>
      </div>
    </div>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPassword.length < 6) {
      setMsg({ type: 'err', text: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
      return;
    }
    if (newPassword !== confirm) {
      setMsg({ type: 'err', text: 'Xác nhận mật khẩu không khớp' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMsg({ type: 'ok', text: 'Đổi mật khẩu thành công!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 360 }}>
      <div className="form-group">
        <label>Mật khẩu hiện tại</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div className="form-group">
        <label>Mật khẩu mới (tối thiểu 6 ký tự)</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </div>
      <div className="form-group">
        <label>Xác nhận mật khẩu mới</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>
      {msg && (
        <p style={{ fontSize: 13, color: msg.type === 'ok' ? 'var(--color-success)' : 'var(--color-danger)', marginBottom: 8 }}>
          {msg.text}
        </p>
      )}
      <button className="btn" disabled={busy} style={{ width: 'auto' }}>
        {busy ? 'Đang lưu…' : 'Đổi mật khẩu'}
      </button>
    </form>
  );
}

function EmailNotifyToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    apiFetch('/auth/me')
      .then((data) => setEnabled(data.emailNotify !== false))
      .catch(() => setEnabled(true));
  }, []);

  async function toggle() {
    if (enabled === null) return;
    setBusy(true);
    setMsg('');
    try {
      const data = await apiFetch('/auth/email-notify', {
        method: 'POST',
        body: JSON.stringify({ enabled: !enabled }),
      });
      setEnabled(data.emailNotify);
      setMsg(data.emailNotify ? 'Đã bật nhận email thông báo' : 'Đã tắt nhận email thông báo');
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className={enabled ? 'btn' : 'btn btn-outline'}
          style={{ width: 'auto', padding: '7px 14px', fontSize: 13 }}
          disabled={busy || enabled === null}
          onClick={toggle}
        >
          {enabled === null ? 'Đang tải…' : enabled ? '✅ Đang nhận email thông báo' : '🔕 Tắt nhận email thông báo'}
        </button>
      </div>
      {msg && <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 8 }}>{msg}</p>}
      <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 8 }}>
        Khi bật, bạn sẽ nhận email khi bài thi được AI chấm xong, khi giáo viên đặt lại mật khẩu…
      </p>
    </div>
  );
}
