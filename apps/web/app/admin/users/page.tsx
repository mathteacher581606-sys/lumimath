'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

const ROLE_LABEL: Record<string, string> = {
  TEACHER: 'Giáo viên',
  STUDENT: 'Học sinh',
  ADMIN: 'Quản trị',
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[] | null>(null);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ fullName: '', email: '', school: '', className: '', grade: '', workplace: '' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Nhập học sinh từ Excel
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    load();
  }, [roleFilter]);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (roleFilter) params.set('role', roleFilter);
      const data = await apiFetch(`/admin/users${params.toString() ? '?' + params : ''}`);
      setUsers(data);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/import-students', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Nhập thất bại');
      } else {
        setImportResult(data);
        showToast(`Đã tạo ${data.created.length} tài khoản`);
        load();
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  async function downloadTemplate() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/import-students/template', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Không tải được file mẫu');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mau-nhap-hoc-sinh.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  }

  function downloadAccountList() {
    if (!importResult?.created?.length) return;
    const header = ['Họ tên', 'Email', 'Khối', 'Lớp', 'Mã HS', 'Mật khẩu'];
    const lines = importResult.created.map((a: any) =>
      [a.fullName, a.email, a.grade != null ? a.grade : '', a.className, a.studentCode, a.password]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = '\uFEFF' + header.join(',') + '\n' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'danh-sach-tai-khoan-hoc-sinh.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function doSearch() {
    (async () => {
      try {
        const params = new URLSearchParams();
        if (roleFilter) params.set('role', roleFilter);
        if (search.trim()) params.set('q', search.trim());
        const data = await apiFetch(`/admin/users?${params.toString()}`);
        setUsers(data);
      } catch (e: any) {
        console.error(e);
      }
    })();
  }

  function openEdit(u: any) {
    setEditing(u);
    setForm({
      fullName: u.fullName || '',
      email: u.email || '',
      school: u.school || '',
      className: u.className || '',
      grade: u.grade != null ? String(u.grade) : '',
      workplace: u.workplace || '',
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...form,
          grade: form.grade === '' ? null : Number(form.grade),
        }),
      });
      showToast('Đã cập nhật thông tin');
      setEditing(null);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(u: any) {
    const pwd = prompt(`Nhập mật khẩu mới cho "${u.fullName}" (tối thiểu 6 ký tự):`);
    if (!pwd) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${u.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: pwd }),
      });
      showToast(`Đã đặt lại mật khẩu cho ${u.fullName}`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(u: any) {
    if (!confirm(`Xóa vĩnh viễn tài khoản "${u.fullName}" (${u.email})?\nToàn bộ dữ liệu liên quan sẽ bị xóa!`)) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${u.id}`, { method: 'DELETE' });
      showToast(`Đã xóa tài khoản ${u.fullName}`);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Quản lý thành viên</h1>
      <p className="page-subtitle">Xem, sửa thông tin, đặt lại mật khẩu và xóa tài khoản.</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          placeholder="🔍 Tìm theo tên, email, mã..."
          style={{ flex: 2, minWidth: 200, padding: 10, border: '1.5px solid var(--color-rule)', borderRadius: 10, fontSize: 14, background: 'var(--color-paper-2)' }}
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ padding: 10, border: '1.5px solid var(--color-rule)', borderRadius: 10, fontSize: 14, background: 'var(--color-paper-2)' }}
        >
          <option value="">Tất cả vai trò</option>
          <option value="TEACHER">Giáo viên</option>
          <option value="STUDENT">Học sinh</option>
        </select>
        <button className="btn" style={{ width: 'auto' }} onClick={doSearch}>
          Tìm
        </button>
        <button
          className="btn btn-outline"
          style={{ width: 'auto', padding: '9px 14px', fontSize: 13 }}
          onClick={downloadTemplate}
          title="Tải file Excel mẫu đúng định dạng để nhập hàng loạt"
        >
          📄 File mẫu
        </button>
        <button
          className="btn"
          style={{ width: 'auto', marginLeft: 'auto', background: 'var(--color-accent)', color: '#fff' }}
          disabled={importing}
          onClick={() => importFileRef.current?.click()}
        >
          {importing ? 'Đang nhập…' : '📥 Nhập từ Excel'}
        </button>
        <input
          ref={importFileRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
      </div>

      {/* Hướng dẫn nhập Excel */}
      <div className="card" style={{ padding: 12, marginBottom: 16, fontSize: 13, color: 'var(--color-muted)' }}>
        📥 <strong>Nhập hàng loạt:</strong> file Excel có cột <strong>Họ tên</strong> + <strong>Email</strong>
        (tùy chọn thêm: <strong>Lớp</strong>, <strong>Mật khẩu</strong>, <strong>Trường</strong>).
        Học sinh không có mật khẩu sẽ được cấp tự động — tải file danh sách sau khi nhập để gửi cho lớp.
      </div>

      {/* Kết quả nhập */}
      {importResult && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>
            Kết quả nhập: ✅ {importResult.created.length} tài khoản mới
            {importResult.skipped.length > 0 && ` · ⚠️ ${importResult.skipped.length} dòng bỏ qua`}
          </h2>
          {importResult.created.length > 0 && (
            <>
              <button className="btn" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={downloadAccountList}>
                📄 Tải danh sách tài khoản + mật khẩu (Excel/CSV)
              </button>
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-rule)' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Họ tên</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Email</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Khối</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Lớp</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Mã HS</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Mật khẩu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.created.slice(0, 20).map((a: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--color-rule)' }}>
                        <td style={{ padding: '6px 8px' }}>{a.fullName}</td>
                        <td style={{ padding: '6px 8px' }}>{a.email}</td>
                        <td style={{ padding: '6px 8px' }}>{a.grade != null ? a.grade : '—'}</td>
                        <td style={{ padding: '6px 8px' }}>{a.className || '—'}</td>
                        <td className="mono" style={{ padding: '6px 8px' }}>{a.studentCode}</td>
                        <td className="mono" style={{ padding: '6px 8px' }}>{a.password}</td>
                      </tr>
                    ))}
                    {importResult.created.length > 20 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '6px 8px', color: 'var(--color-muted)' }}>
                          … còn {importResult.created.length - 20} tài khoản (tải file để xem đầy đủ)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {importResult.skipped.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <strong style={{ color: 'var(--color-danger)' }}>Bỏ qua:</strong>
              <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                {importResult.skipped.slice(0, 10).map((s: any, i: number) => (
                  <li key={i}>Dòng {s.row}: {s.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {users === null ? (
        <p>Đang tải…</p>
      ) : users.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
          Không tìm thấy thành viên nào.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-rule)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Thành viên</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Vai trò</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lớp / Nơi công tác</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>XP</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--color-rule)' }}>
                  <td style={{ padding: '8px 10px' }}>
                    <strong>{u.fullName}</strong>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      {u.email}
                      {u.teacherCode || u.studentCode ? ` · ${u.teacherCode || u.studentCode}` : ''}
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span className={u.role === 'ADMIN' ? 'badge badge-accent' : 'badge'}>
                      {u.roleLabel}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', color: 'var(--color-muted)', fontSize: 13 }}>
                    {u.grade != null ? `Khối ${u.grade}` : ''}
                    {u.grade != null && (u.className || u.workplace) ? ' · ' : ''}
                    {u.className || u.workplace || '—'}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--color-muted)' }}>
                    {u.xp} (Lv {u.level})
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline" style={{ width: 'auto', padding: '5px 10px', fontSize: 12, marginRight: 6 }} onClick={() => openEdit(u)}>
                      ✏️ Sửa
                    </button>
                    <button className="btn btn-outline" style={{ width: 'auto', padding: '5px 10px', fontSize: 12, marginRight: 6 }} onClick={() => resetPassword(u)}>
                      🔑 Đặt lại MK
                    </button>
                    <button className="btn btn-danger" style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }} onClick={() => deleteUser(u)}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal sửa thông tin */}
      {editing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 45%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            padding: 20,
          }}
          onClick={() => setEditing(null)}
        >
          <div className="auth-card" onClick={(e) => e.stopPropagation()}>
            <div className="logo">✏️</div>
            <h1>Sửa thông tin</h1>
            <p className="subtitle">{editing.roleLabel} · {editing.email}</p>
            <div className="form-group">
              <label>Họ tên</label>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Khối (1–12)</label>
              <input
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
                placeholder="VD: 12"
                type="number"
                min={1}
                max={12}
              />
            </div>
            <div className="form-group">
              <label>Lớp (học sinh)</label>
              <input value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} placeholder="VD: 12A1" />
            </div>
            <div className="form-group">
              <label>Trường / Nơi công tác</label>
              <input value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn" style={{ flex: 1 }} disabled={busy} onClick={saveEdit}>
                {busy ? 'Đang lưu…' : 'Lưu'}
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditing(null)}>
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
