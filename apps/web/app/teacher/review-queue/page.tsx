'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import LatexRenderer from '@/components/LatexRenderer';
import ImageAnnotator from '@/components/ImageAnnotator';

// Hàng đợi chấm bài: mọi bài tự luận chưa chốt điểm của giáo viên
export default function ReviewQueuePage() {
  const [items, setItems] = useState<any[] | null>(null);
  const [courses, setCourses] = useState<any[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [fCourse, setFCourse] = useState('');
  const [fClass, setFClass] = useState('');
  const [reviewing, setReviewing] = useState<any | null>(null);
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [annotatingSrc, setAnnotatingSrc] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    load();
    apiFetch('/courses').then((d) => setCourses(d)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (fCourse) params.set('courseId', fCourse);
      if (fClass) params.set('className', fClass);
      const data = await apiFetch(`/exercises/review-queue?${params.toString()}`);
      setItems(data);
      const cls = Array.from(
        new Set(data.map((s: any) => s.student?.className).filter(Boolean)),
      ) as string[];
      setClasses(cls);
    } catch (e: any) {
      console.error(e);
    }
  }

  function openReview(s: any) {
    setReviewing(s);
    setScore(
      s.teacherScore != null ? String(s.teacherScore) : s.aiScore != null ? String(s.aiScore) : '',
    );
    setNote(s.teacherNote || '');
  }

  async function saveReview() {
    if (!reviewing) return;
    const s = Number(score);
    if (isNaN(s) || s < 0 || s > reviewing.exercise.maxScore) {
      alert(`Điểm phải từ 0 đến ${reviewing.exercise.maxScore}`);
      return;
    }
    setBusy(true);
    try {
      await apiFetch(
        `/exercises/${reviewing.exercise.id}/submissions/${reviewing.id}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ teacherScore: s, teacherNote: note }),
        },
      );
      showToast('Đã chốt điểm — bài rời khỏi hàng đợi');
      setReviewing(null);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAnnotatedBlob(blob: Blob) {
    if (!reviewing) return;
    setBusy(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/uploads/image', {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` },
        body: blob,
      });
      if (!res.ok) throw new Error('Không lưu được ảnh');
      const data = await res.json();
      await apiFetch(
        `/exercises/${reviewing.exercise.id}/submissions/${reviewing.id}/annotations`,
        { method: 'POST', body: JSON.stringify({ urls: [data.url] }) },
      );
      setReviewing({
        ...reviewing,
        annotatedUrls: [...(reviewing.annotatedUrls || []), data.url],
      });
      setAnnotatingSrc(null);
      showToast('Đã lưu ảnh sửa bài');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-container">
      <h1 className="page-title">✅ Hàng đợi chấm bài</h1>
      <p className="page-subtitle">
        Tất cả bài tự luận đã được chấm sơ bộ, đang chờ bạn chốt điểm và nhận xét cuối.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <select
          value={fCourse}
          onChange={(e) => { setFCourse(e.target.value); setTimeout(load, 0); }}
          style={{ padding: 9, border: '1px solid var(--color-rule)', borderRadius: 8, fontSize: 13, background: 'var(--color-paper)', color: 'var(--color-ink)', maxWidth: 240 }}
        >
          <option value="">Tất cả khóa học</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
        <select
          value={fClass}
          onChange={(e) => { setFClass(e.target.value); setTimeout(load, 0); }}
          style={{ padding: 9, border: '1px solid var(--color-rule)', borderRadius: 8, fontSize: 13, background: 'var(--color-paper)', color: 'var(--color-ink)' }}
        >
          <option value="">Tất cả lớp</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button className="btn" style={{ width: 'auto' }} onClick={load}>
          🔄 Làm mới
        </button>
        {items !== null && (
          <span className="badge badge-accent" style={{ alignSelf: 'center' }}>
            {items.length} bài chờ chấm
          </span>
        )}
      </div>

      {items === null ? (
        <p>Đang tải…</p>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--color-muted)' }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🎉</div>
          <p style={{ fontSize: 16, fontWeight: 600 }}>Hàng đợi trống!</p>
          <p style={{ fontSize: 14, marginTop: 4 }}>Không còn bài nào chờ chốt điểm.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((s) => (
            <div key={s.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                    <strong>{s.student?.fullName}</strong>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{s.student?.studentCode}</span>
                    {s.student?.className && <span className="badge">{s.student.className}</span>}
                    <span className="badge badge-accent">{s.exercise.courseTitle}</span>
                  </div>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    <LatexRenderer content={s.exercise.prompt} />
                  </div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    {s.aiScore != null ? `AI chấm sơ bộ: ${s.aiScore}/${s.exercise.maxScore}` : 'Chưa có bản nháp AI'}
                    {s.imageUrls?.length ? ` · ${s.imageUrls.length} ảnh` : ''}
                    {s.annotatedUrls?.length ? ` · 📝 đã sửa ${s.annotatedUrls.length} ảnh` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <button className="btn" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => openReview(s)}>
                    ✅ Chấm ngay
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal chấm nhanh */}
      {reviewing && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 50%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1600, padding: 16,
          }}
          onClick={() => setReviewing(null)}
        >
          <div
            style={{
              background: 'var(--color-paper)', borderRadius: 14,
              maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>
              ✅ Chấm bài — {reviewing.student?.fullName}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 10 }}>
              Thang {reviewing.exercise.maxScore} · {reviewing.student?.className || 'Chưa phân lớp'}
            </p>

            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <strong>Đề bài:</strong> <LatexRenderer content={reviewing.exercise.prompt} />
            </div>
            <div style={{ fontSize: 13, marginBottom: 8, padding: 10, background: 'var(--color-paper-2)', borderRadius: 8, whiteSpace: 'pre-wrap' }}>
              <strong>Bài làm:</strong>
              <div style={{ marginTop: 4 }}>{reviewing.content}</div>
            </div>

            {reviewing.imageUrls?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>Ảnh bài làm:</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {reviewing.imageUrls.map((url: string, i: number) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={url} alt={`Ảnh ${i + 1}`} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-rule)' }} />
                      <button
                        className="btn"
                        style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', padding: '4px 10px', fontSize: 11, width: 'auto' }}
                        onClick={() => setAnnotatingSrc(url)}
                      >
                        ✏️ Sửa
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reviewing.annotatedUrls?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 13, color: 'var(--color-success)' }}>📝 Ảnh đã sửa:</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {reviewing.annotatedUrls.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={`Đã sửa ${i + 1}`} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--color-success)' }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {reviewing.aiFeedback && (
              <div style={{ fontSize: 12, marginBottom: 8, padding: 8, background: 'color-mix(in oklch, var(--color-accent) 7%, var(--color-paper))', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                <strong style={{ fontSize: 11 }}>Bản nháp chấm sơ bộ:</strong>
                <div style={{ marginTop: 2 }}>{reviewing.aiFeedback}</div>
              </div>
            )}

            <div className="form-group">
              <label>Điểm chốt (0 – {reviewing.exercise.maxScore})</label>
              <input type="number" min={0} max={reviewing.exercise.maxScore} step={0.25} value={score} onChange={(e) => setScore(e.target.value)} />
            </div>
            <div className="form-group">
              <label>📝 Nhận xét của thầy cô</label>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn" style={{ flex: 1 }} onClick={saveReview} disabled={busy}>
                {busy ? 'Đang lưu…' : '✅ Chốt điểm & gửi nhận xét'}
              </button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setReviewing(null)}>
                Để sau
              </button>
            </div>
          </div>
        </div>
      )}

      {annotatingSrc && (
        <ImageAnnotator src={annotatingSrc} onCancel={() => setAnnotatingSrc(null)} onSave={handleAnnotatedBlob} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
