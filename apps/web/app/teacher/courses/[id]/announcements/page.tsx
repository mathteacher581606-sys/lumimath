'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import BackButton from '@/components/BackButton';

export default function CourseAnnouncements() {
  const params = useParams();
  const courseId = params.id as string;
  const [course, setCourse] = useState<any>(null);
  const [list, setList] = useState<any[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Form đăng thông báo
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    content: '',
    pinned: false,
    allowVote: false,
    voteOptions: '',
    images: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    try {
      setCourse(await apiFetch(`/courses/${courseId}`));
      setList(await apiFetch(`/courses/${courseId}/announcements`));
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function uploadImage(file: File): Promise<string | null> {
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/uploads/image', {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'image/png', Authorization: `Bearer ${token}` },
        body: file,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Không tải được ảnh' }));
        showToast('❌ ' + err.message);
        return null;
      }
      return (await res.json()).url;
    } catch (e: any) {
      showToast('❌ ' + e.message);
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.content.trim()) {
      showToast('⚠️ Vui lòng nhập nội dung thông báo');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/courses/${courseId}/announcements`, {
        method: 'POST',
        body: JSON.stringify({
          content: form.content,
          pinned: form.pinned,
          allowVote: form.allowVote,
          voteOptions: form.voteOptions
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
          images: form.images,
        }),
      });
      setForm({ content: '', pinned: false, allowVote: false, voteOptions: '', images: [] });
      setShowForm(false);
      showToast('✅ Đã đăng thông báo');
      load();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function comment(id: string) {
    const text = comments[id] || '';
    if (!text.trim()) return;
    try {
      await apiFetch(`/courses/${courseId}/announcements/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      });
      setComments((p) => ({ ...p, [id]: '' }));
      load();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function react(id: string, emoji: string) {
    try {
      await apiFetch(`/courses/${courseId}/announcements/${id}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
      load();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function removeAnn(id: string) {
    if (!confirm('Xóa thông báo này?')) return;
    try {
      await apiFetch(`/courses/${courseId}/announcements/${id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  const EMOJIS = ['👍', '❤️', '🎉', '🙏', '😮'];

  return (
    <div className="page-container" data-theme="maroon" style={{ maxWidth: 960 }}>
      {toast && (
        <div className="toast" style={{ position: 'fixed', top: 20, right: 20, zIndex: 60 }}>
          {toast}
        </div>
      )}
      <div className="lm-band">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>
            <BackButton to={`/teacher/courses/${courseId}`} label="Về khóa học" />
            📣 Bảng tin khóa học
          </h2>
          <p className="lm-band-sub">{course?.title || 'Đang tải…'}</p>
        </div>
        <button className="btn-lm amber" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Đóng' : '＋ Đăng thông báo'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginTop: 20, padding: 18 }}>
          <form onSubmit={create}>
            <div className="form-group">
              <label>Nội dung thông báo</label>
              <textarea
                rows={4}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="VD: Tuần này lớp mình ôn tập chương Đạo hàm, các em xem bài giảng trước nhé…"
              />
            </div>
            <div className="form-group">
              <label>📷 Đính kèm ảnh (tự nén)</label>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const url = await uploadImage(f);
                  if (url) setForm((p) => ({ ...p, images: [...p.images, url] }));
                }}
              />
              {form.images.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  {form.images.map((u, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={u} alt="" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-rule)' }} />
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, images: p.images.filter((_, j) => j !== i) }))}
                        style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: 'none', background: 'var(--color-danger)', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                📌 Ghim đầu bảng tin
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={form.allowVote}
                  onChange={(e) => setForm({ ...form, allowVote: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                🗳 Mở biểu quyết
              </label>
            </div>
            {form.allowVote && (
              <div className="form-group">
                <label>Lựa chọn biểu quyết (mỗi dòng 1 lựa chọn)</label>
                <textarea
                  rows={3}
                  value={form.voteOptions}
                  onChange={(e) => setForm({ ...form, voteOptions: e.target.value })}
                  placeholder={'Đi học sớm\nĐi học muộn'}
                />
              </div>
            )}
            <button className="btn" style={{ width: 'auto', padding: '8px 20px' }} disabled={saving || uploading}>
              {saving || uploading ? '⏳ Đang đăng…' : '📣 Đăng thông báo'}
            </button>
          </form>
        </div>
      )}

      {list === null ? (
        <p style={{ marginTop: 20, color: 'var(--color-muted)' }}>Đang tải bảng tin…</p>
      ) : list.length === 0 ? (
        <div className="card" style={{ marginTop: 20, textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📣</div>
          <p>Chưa có thông báo nào. Đăng thông báo đầu tiên cho lớp nhé!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
          {list.map((a) => (
            <div key={a.id} className="card" style={{ padding: 16, borderLeft: a.pinned ? '4px solid var(--lm-amber)' : undefined }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {a.pinned && <span className="badge badge-warning">📌 Ghim</span>}{' '}
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                    {new Date(a.createdAt).toLocaleString('vi-VN')}
                  </span>
                  <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 14.5 }}>{a.content}</div>
                  {a.images?.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {a.images.map((u: string, i: number) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer">
                          <img src={u} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-rule)' }} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '4px 10px', fontSize: 12, color: 'var(--color-danger)' }}
                  onClick={() => removeAnn(a.id)}
                >
                  🗑️
                </button>
              </div>

              {/* Biểu quyết */}
              {a.voteOptions?.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: '#fdf1dc', borderRadius: 8 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#8a5a1a', marginBottom: 6 }}>
                    🗳 Biểu quyết {a.voteDeadline ? `(hạn: ${new Date(a.voteDeadline).toLocaleString('vi-VN')})` : ''}
                  </div>
                  {a.voteOptions.map((opt: string, i: number) => {
                    const total = (a.voteCounts || []).reduce((x: number, y: number) => x + y, 0);
                    const count = a.voteCounts?.[i] || 0;
                    const pct = total ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <button
                          className="lm-filter-btn"
                          style={{ width: 'auto', fontSize: 12.5, border: a.myVote === i ? '1.5px solid var(--lm-amber)' : undefined, background: a.myVote === i ? '#fff3d6' : undefined }}
                          onClick={async () => {
                            await apiFetch(`/courses/${courseId}/announcements/${a.id}/vote`, {
                              method: 'POST',
                              body: JSON.stringify({ optionIndex: i }),
                            });
                            load();
                          }}
                        >
                          {a.myVote === i ? '✓ ' : ''}{opt} — {count} phiếu
                        </button>
                        <div style={{ height: 6, background: '#f3e2bd', borderRadius: 3, marginTop: 4 }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--lm-amber)', borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Cảm xúc */}
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {EMOJIS.map((em) => (
                  <button
                    key={em}
                    className="lm-filter-btn"
                    style={{ padding: '3px 10px', fontSize: 14, background: a.myReaction === em ? '#fff3d6' : undefined }}
                    onClick={() => react(a.id, em)}
                  >
                    {em} {(a.reactionCounts || {})[em] || 0}
                  </button>
                ))}
              </div>

              {/* Bình luận */}
              <div style={{ marginTop: 10, borderTop: '1px dashed var(--color-rule)', paddingTop: 10 }}>
                {a.comments?.map((c: any) => (
                  <div key={c.id} style={{ fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>{new Date(c.createdAt).toLocaleTimeString('vi-VN')}</span>{' '}
                    {c.content}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <input
                    value={comments[a.id] || ''}
                    onChange={(e) => setComments((p) => ({ ...p, [a.id]: e.target.value }))}
                    placeholder="Trả lời / bình luận…"
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--color-rule)', fontSize: 13 }}
                  />
                  <button className="btn-lm ghost" style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }} onClick={() => comment(a.id)}>
                    Gửi
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
