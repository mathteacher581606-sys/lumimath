'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '@/lib/api';

// Khu thảo luận trong bài giảng: học sinh hỏi, giáo viên trả lời
export default function LessonComments({
  courseId,
  lessonId,
  prefill,
}: {
  courseId: string;
  lessonId: string;
  prefill?: string;
}) {
  const [comments, setComments] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const me = getUser();

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // Điền sẵn câu hỏi khi học sinh bấm "🆘 Cần hỏi thầy"
  useEffect(() => {
    if (prefill) setText(prefill);
  }, [prefill]);

  async function load() {
    try {
      const data = await apiFetch(
        `/courses/${courseId}/lessons/${lessonId}/comments`,
      );
      setComments(data);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/courses/${courseId}/lessons/${lessonId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      });
      setText('');
      load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await apiFetch(`/courses/comments/${id}`, { method: 'DELETE' });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div id="thao-luan" style={{ marginTop: 12, scrollMarginTop: 20 }}>
      <strong style={{ fontSize: 13 }}>💬 Thảo luận</strong>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {comments === null ? (
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>Đang tải…</p>
        ) : comments.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            Chưa có câu hỏi nào. Hãy đặt câu hỏi đầu tiên!
          </p>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              style={{
                padding: '8px 10px',
                background: 'color-mix(in oklch, var(--color-rule) 35%, var(--color-paper))',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 12 }}>
                  {c.author.fullName}
                  {c.author.role === 'TEACHER' ? (
                    <span className="badge badge-accent" style={{ marginLeft: 6, fontSize: 10 }}>
                      GV
                    </span>
                  ) : null}
                </strong>
                {(me?.id === c.authorId || me?.role === 'TEACHER') && (
                  <button
                    onClick={() => remove(c.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--color-danger)',
                    }}
                    title="Xóa bình luận"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>{c.content}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 2 }}>
                {new Date(c.createdAt).toLocaleString('vi-VN')}
              </div>
            </div>
          ))
        )}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={me?.role === 'TEACHER' ? 'Trả lời học sinh…' : 'Đặt câu hỏi cho giáo viên…'}
          style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--color-rule)', borderRadius: 8, fontSize: 13, background: 'var(--color-paper)' }}
        />
        <button
          type="submit"
          className="btn"
          disabled={busy || !text.trim()}
          style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
        >
          {me?.role === 'TEACHER' ? 'Trả lời' : 'Gửi'}
        </button>
      </form>
    </div>
  );
}
