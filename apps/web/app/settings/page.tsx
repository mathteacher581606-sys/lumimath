'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUser, logout, apiFetch, updateStoredUser, uploadImageFile } from '@/lib/api';
import { THEMES, getTheme, setTheme } from '@/lib/theme';

type Tab = 'theme' | 'info' | 'pass';
const TABS: { id: Tab; label: string }[] = [
  { id: 'theme', label: 'Giao diện' },
  { id: 'info', label: 'Thông tin cá nhân' },
  { id: 'pass', label: 'Mật khẩu' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [tab, setTab] = useState<Tab>('theme');

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.push('/login');
      return;
    }
    setUser(u);
    const h = window.location.hash.replace('#', '');
    if (h === 'info' || h === 'pass' || h === 'theme') setTab(h);
  }, [router]);

  function pick(t: Tab) {
    setTab(t);
    try {
      window.history.replaceState(null, '', `#${t}`);
    } catch {}
  }

  // Phím mũi tên trái/phải để chuyển tab (chuẩn ARIA tabs)
  function onTabKey(e: React.KeyboardEvent, idx: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (idx + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
    pick(TABS[next].id);
    document.getElementById(`st-tab-${TABS[next].id}`)?.focus();
  }

  if (!user) return <div style={{ padding: 40 }}>Đang tải…</div>;

  const isStudent = user.role === 'STUDENT';

  return (
    <div className="page-container st">
      <div>
        <h1 className="page-title">Cài đặt</h1>
        <p className="page-subtitle" style={{ marginBottom: 0 }}>
          {isStudent ? 'Tùy chỉnh giao diện và tài khoản của em.' : 'Tùy chỉnh giao diện và tài khoản của bạn.'}
        </p>
      </div>

      <div role="tablist" aria-label="Mục cài đặt" className="st-tabs">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            id={`st-tab-${t.id}`}
            type="button"
            role="tab"
            className="st-tab"
            aria-selected={tab === t.id}
            aria-controls={`st-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => pick(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`st-panel-${tab}`} aria-labelledby={`st-tab-${tab}`}>
        {tab === 'theme' && <ThemePanel isStudent={isStudent} />}
        {tab === 'info' && <ProfilePanel isStudent={isStudent} onSaved={(u) => setUser({ ...user, ...u })} />}
        {tab === 'pass' && (
          <PasswordPanel
            isStudent={isStudent}
            onLogout={() => {
              logout();
              router.push('/login');
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ---------------- Tab 1: Giao diện ---------------- */

function ThemePanel({ isStudent }: { isStudent: boolean }) {
  const [current, setCurrent] = useState('paper');
  useEffect(() => setCurrent(getTheme()), []);

  function choose(id: string) {
    setTheme(id);
    setCurrent(id);
  }

  return (
    <section className="st-panel" aria-labelledby="st-theme-h">
      <h2 id="st-theme-h">Bảng màu</h2>
      <p className="st-panel-sub">
        Chọn màu {isStudent ? 'em' : 'bạn'} thích. Thay đổi áp dụng ngay và được nhớ trên trình duyệt này.
      </p>
      <div role="radiogroup" aria-label="Bảng màu" className="st-themes">
        {THEMES.map((t) => {
          const on = current === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={on}
              className="st-theme"
              onClick={() => choose(t.id)}
            >
              <span
                className="st-theme-preview"
                aria-hidden="true"
                style={{ background: t.paper, borderColor: t.rule }}
              >
                <span className="bar" style={{ background: t.accent }} />
                <span className="block" style={{ background: t.surface, borderColor: t.rule }} />
                <span className="block" style={{ background: t.surface, borderColor: t.rule }} />
              </span>
              <span className="st-theme-name">
                <span>
                  {t.letter} · {t.name}
                </span>
                {on && (
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </span>
              <span className="st-theme-desc">{t.desc}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Tab 2: Thông tin cá nhân ---------------- */

type Form = {
  fullName: string;
  className: string;
  school: string;
  workplace: string;
  birthDate: string;
  phone: string;
  parentPhone: string;
};

const EMPTY: Form = {
  fullName: '',
  className: '',
  school: '',
  workplace: '',
  birthDate: '',
  phone: '',
  parentPhone: '',
};

function toForm(p: any): Form {
  return {
    fullName: p?.fullName || '',
    className: p?.className || '',
    school: p?.school || '',
    workplace: p?.workplace || '',
    birthDate: p?.birthDate ? String(p.birthDate).slice(0, 10) : '',
    phone: p?.phone || '',
    parentPhone: p?.parentPhone || '',
  };
}

function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const last = parts[parts.length - 1][0] || '';
  const first = parts.length > 1 ? parts[parts.length - 2][0] : '';
  return (first + last).toUpperCase();
}

function ProfilePanel({ isStudent, onSaved }: { isStudent: boolean; onSaved: (u: any) => void }) {
  const [profile, setProfile] = useState<any>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [loadError, setLoadError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    apiFetch('/auth/profile')
      .then((p) => {
        setProfile(p);
        setForm(toForm(p));
      })
      .catch((e) => setLoadError(e.message || 'Không tải được thông tin'));
  }, []);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [k]: e.target.value });
    setMsg(null);
  };

  const nameInvalid = form.fullName.trim().length < 2;
  const dirty = profile && JSON.stringify(form) !== JSON.stringify(toForm(profile));

  function applySaved(p: any) {
    setProfile(p);
    setForm(toForm(p));
    const patch = { fullName: p.fullName, className: p.className, avatarUrl: p.avatarUrl };
    updateStoredUser(patch);
    onSaved(patch);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (nameInvalid) {
      setMsg({ type: 'err', text: 'Họ và tên phải có ít nhất 2 ký tự' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const body: Record<string, any> = {
        fullName: form.fullName,
        school: form.school,
        birthDate: form.birthDate || null,
      };
      if (isStudent) {
        body.className = form.className;
        body.parentPhone = form.parentPhone;
      } else {
        body.workplace = form.workplace;
        body.phone = form.phone;
      }
      const p = await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify(body) });
      applySaved(p);
      setMsg({ type: 'ok', text: 'Đã lưu thông tin' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message || 'Không lưu được' });
    } finally {
      setBusy(false);
    }
  }

  async function changeAvatar(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMsg({ type: 'err', text: 'Hãy chọn một tệp ảnh' });
      return;
    }
    setAvatarBusy(true);
    setMsg(null);
    try {
      const url = await uploadImageFile(file);
      const p = await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({ avatarUrl: url }) });
      applySaved(p);
      setMsg({ type: 'ok', text: 'Đã đổi ảnh đại diện' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message || 'Không đổi được ảnh' });
    } finally {
      setAvatarBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    try {
      const p = await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({ avatarUrl: null }) });
      applySaved(p);
      setMsg({ type: 'ok', text: 'Đã xóa ảnh đại diện' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message || 'Không xóa được ảnh' });
    } finally {
      setAvatarBusy(false);
    }
  }

  if (loadError) {
    return (
      <section className="st-panel">
        <p className="st-msg err" role="alert">
          {loadError}
        </p>
      </section>
    );
  }
  if (!profile) return <section className="st-panel skeleton" style={{ height: 360 }} aria-hidden="true" />;

  return (
    <form className="st-panel" aria-labelledby="st-info-h" onSubmit={save} noValidate>
      <h2 id="st-info-h">Thông tin cá nhân</h2>

      <div className="st-avatar-row">
        <div className="st-avatar" aria-hidden="true">
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials(form.fullName)}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => changeAvatar(e.target.files?.[0])}
        />
        <button type="button" className="btn btn-outline" disabled={avatarBusy} onClick={() => fileRef.current?.click()}>
          {avatarBusy ? 'Đang tải ảnh…' : 'Đổi ảnh đại diện'}
        </button>
        {profile.avatarUrl && (
          <button type="button" className="btn btn-outline" disabled={avatarBusy} onClick={removeAvatar}>
            Xóa ảnh
          </button>
        )}
      </div>

      <div className="st-fields">
        <div className="st-field">
          <label htmlFor="f-name">Họ và tên</label>
          <input
            id="f-name"
            type="text"
            autoComplete="name"
            maxLength={80}
            value={form.fullName}
            onChange={set('fullName')}
            aria-invalid={nameInvalid}
            aria-describedby={nameInvalid ? 'f-name-err' : undefined}
          />
          {nameInvalid && (
            <span id="f-name-err" className="st-hint" style={{ color: 'var(--color-danger)' }}>
              Nhập ít nhất 2 ký tự
            </span>
          )}
        </div>

        {isStudent ? (
          <div className="st-field">
            <label htmlFor="f-class">Lớp</label>
            <input id="f-class" type="text" maxLength={20} placeholder="VD: 12A1" value={form.className} onChange={set('className')} />
          </div>
        ) : (
          <div className="st-field">
            <label htmlFor="f-work">Nơi công tác</label>
            <input id="f-work" type="text" maxLength={120} value={form.workplace} onChange={set('workplace')} />
          </div>
        )}

        <div className="st-field">
          <label htmlFor="f-school">Trường</label>
          <input id="f-school" type="text" maxLength={120} value={form.school} onChange={set('school')} />
        </div>

        <div className="st-field">
          <label htmlFor="f-dob">Ngày sinh</label>
          <input id="f-dob" type="date" value={form.birthDate} onChange={set('birthDate')} />
        </div>

        {isStudent ? (
          <div className="st-field">
            <label htmlFor="f-pphone">Số điện thoại phụ huynh</label>
            <input id="f-pphone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="09xx xxx xxx" value={form.parentPhone} onChange={set('parentPhone')} />
          </div>
        ) : (
          <div className="st-field">
            <label htmlFor="f-phone">Số điện thoại</label>
            <input id="f-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="09xx xxx xxx" value={form.phone} onChange={set('phone')} />
          </div>
        )}

        <div className="st-field">
          <label htmlFor="f-email">Email</label>
          <input id="f-email" type="email" value={profile.email || ''} readOnly aria-describedby="f-email-hint" />
          <span id="f-email-hint" className="st-hint">
            {isStudent ? 'Muốn đổi email, em nhờ giáo viên hỗ trợ.' : 'Liên hệ quản trị viên để đổi email.'}
          </span>
        </div>

        <div className="st-field">
          <label htmlFor="f-code">{isStudent ? 'Mã học sinh' : 'Mã giáo viên'}</label>
          <input id="f-code" type="text" value={profile.studentCode || profile.teacherCode || '—'} readOnly />
        </div>
      </div>

      <div className="st-actions">
        {msg && (
          <span className={`st-msg ${msg.type}`} role={msg.type === 'err' ? 'alert' : 'status'}>
            {msg.text}
          </span>
        )}
        <button type="button" className="btn btn-outline" disabled={!dirty || busy} onClick={() => { setForm(toForm(profile)); setMsg(null); }}>
          Hủy
        </button>
        <button type="submit" className="btn sh-btn-accent" disabled={!dirty || busy}>
          {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  );
}

/* ---------------- Tab 3: Mật khẩu (+ thông báo email, đăng xuất) ---------------- */

function PasswordPanel({ isStudent, onLogout }: { isStudent: boolean; onLogout: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!currentPassword) {
      setMsg({ type: 'err', text: 'Nhập mật khẩu hiện tại' });
      return;
    }
    if (newPassword.length < 6) {
      setMsg({ type: 'err', text: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
      return;
    }
    if (newPassword !== confirm) {
      setMsg({ type: 'err', text: 'Mật khẩu nhập lại không khớp' });
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMsg({ type: 'ok', text: 'Đổi mật khẩu thành công' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirm('');
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <form className="st-panel" style={{ maxWidth: 560 }} aria-labelledby="st-pass-h" onSubmit={submit} noValidate>
        <h2 id="st-pass-h">Đổi mật khẩu</h2>
        <div className="st-field">
          <label htmlFor="p-old">Mật khẩu hiện tại</label>
          <input id="p-old" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div className="st-field">
          <label htmlFor="p-new">Mật khẩu mới</label>
          <input id="p-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} aria-describedby="p-new-hint" />
          <span id="p-new-hint" className="st-hint">
            Tối thiểu 6 ký tự, nên có cả chữ và số.
          </span>
        </div>
        <div className="st-field">
          <label htmlFor="p-cf">Nhập lại mật khẩu mới</label>
          <input id="p-cf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <div className="st-actions">
          {msg && (
            <span className={`st-msg ${msg.type}`} role={msg.type === 'err' ? 'alert' : 'status'}>
              {msg.text}
            </span>
          )}
          <button type="submit" className="btn sh-btn-accent" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Đổi mật khẩu'}
          </button>
        </div>
      </form>

      <section className="st-panel" style={{ maxWidth: 560 }} aria-labelledby="st-more-h">
        <h2 id="st-more-h">Thông báo và phiên đăng nhập</h2>
        <EmailNotifyToggle />
        <div className="st-row">
          <span className="st-hint" style={{ fontSize: 14 }}>
            {isStudent ? 'Dùng máy chung? Nhớ đăng xuất khi học xong.' : 'Dùng máy chung? Nhớ đăng xuất khi xong việc.'}
          </span>
          <button type="button" className="btn btn-danger" style={{ width: 'auto', minHeight: 44, padding: '0 20px' }} onClick={onLogout}>
            Đăng xuất
          </button>
        </div>
      </section>
    </div>
  );
}

function EmailNotifyToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    // /auth/profile trả đúng cờ emailNotify (trước đây đọc /auth/me không có trường này)
    apiFetch('/auth/profile')
      .then((data) => setEnabled(data?.emailNotify !== false))
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
      <label className="st-switch">
        <input type="checkbox" checked={!!enabled} disabled={busy || enabled === null} onChange={toggle} />
        Nhận email khi có điểm, khi bài được chấm xong hoặc khi mật khẩu được đặt lại
      </label>
      {msg && (
        <p className="st-hint" role="status" style={{ marginTop: 8 }}>
          {msg}
        </p>
      )}
    </div>
  );
}
