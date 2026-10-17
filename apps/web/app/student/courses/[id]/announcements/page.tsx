'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import BackButton from '@/components/BackButton';

export default function StudentCourseAnnouncements() {
  const params = useParams();
  const courseId = params.id as string;
  const [course, setCourse] = useState<any>(null);
  const [list, setList] = useState<any[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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

  const EMOJIS = ['👍', '❤️', '🎉', '🙏', '😮'];

  return (
    <div className="page-container" data-theme="maroon" style={{ maxWidth: 960 }}>
      {toast && <div className="toast" style={{ position: 'fixed', top: 20, right: 20, zIndex: 60 }}>{toast}</div>}
      <div className="lm-band">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>
            <BackButton to={`/student/courses/${courseId}`} label="Về khóa học" />
            📣 Bảng tin khóa học
          </h2>
          <p className="lm-band-sub">{course?.title || 'Đang tải…'}</p>
        </div>
      </div>

      {list === null ? (
        <p style={{ marginTop: 20, color: 'var(--color-muted)' }}>Đang tải bảng tin…</p>
      ) : list.length === 0 ? (
        <div className="card" style={{ marginTop: 20, textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📣</div>
          <p>Chưa có thông báo nào từ giáo viên.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
          {list.map((a) => (
            <div key={a.id} className="card" style={{ padding: 16, borderLeft: a.pinned ? '4px solid var(--lm-amber)' : undefined }}>
              <div>
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
                          style={{ width: 'auto', fontSize: 12.5, background: a.myVote === i ? '#fff3d6' : undefined, border: a.myVote === i ? '1.5px solid var(--lm-amber)' : undefined }}
                          onClick={async () => {
                            try {
                              await apiFetch(`/courses/${courseId}/announcements/${a.id}/vote`, {
                                method: 'POST',
                                body: JSON.stringify({ optionIndex: i }),
                              });
                              load();
                            } catch (e: any) {
                              showToast('❌ ' + e.message);
                            }
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
                    placeholder="Đặt câu hỏi / bình luận…"
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
