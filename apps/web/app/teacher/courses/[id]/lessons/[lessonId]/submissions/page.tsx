'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import LatexRenderer from '@/components/LatexRenderer';
import ImageAnnotator from '@/components/ImageAnnotator';

// Danh sách nộp bài BTVN tự luận của 1 bài học — GV chấm + xuất bảng điểm
export default function LessonSubmissionsPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;
  const lessonId = params.lessonId as string;

  const [lesson, setLesson] = useState<any>(null);
  const [course, setCourse] = useState<any>(null);
  const [exercises, setExercises] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [reviewing, setReviewing] = useState<{ exercise: any; submission: any } | null>(null);
  const [score, setScore] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [annotatingSrc, setAnnotatingSrc] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      const [exData, stData, courseData] = await Promise.all([
        apiFetch(`/courses/${courseId}/lessons/${lessonId}/exercises`),
        apiFetch(`/courses/${courseId}/students`),
        apiFetch(`/courses/${courseId}`),
      ]);
      setExercises(exData || []);
      setStudents(stData || []);
      setCourse(courseData);
      setLesson(
        (courseData?.lessons || []).find((l: any) => l.id === lessonId) || null,
      );
    } catch (e: any) {
      showToast(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function subOf(exercise: any, student: any) {
    return (exercise.submissions || []).find(
      (s: any) => s.studentId === (student.student?.id || student.id),
    );
  }

  function displayScore(ex: any, sub: any): { text: string; cls: string } {
    if (!sub) return { text: '—', cls: 'muted' };
    if (sub.teacherScore !== null && sub.teacherScore !== undefined) {
      return { text: `${sub.teacherScore}/${ex.maxScore} ✓`, cls: 'final' };
    }
    if (sub.aiScore !== null && sub.aiScore !== undefined) {
      return { text: `${sub.aiScore}/${ex.maxScore}`, cls: 'draft' };
    }
    return { text: 'Chờ chấm', cls: 'pending' };
  }

  function openReview(ex: any, sub: any) {
    if (!sub) return;
    setReviewing({ exercise: ex, submission: sub });
    setScore(
      sub.teacherScore != null
        ? String(sub.teacherScore)
        : sub.aiScore != null
          ? String(sub.aiScore)
          : '',
    );
    setNote(sub.teacherNote || '');
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
        `/exercises/${reviewing.exercise.id}/submissions/${reviewing.submission.id}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ teacherScore: s, teacherNote: note }),
        },
      );
      showToast('Đã chốt điểm');
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
        `/exercises/${reviewing.exercise.id}/submissions/${reviewing.submission.id}/annotations`,
        { method: 'POST', body: JSON.stringify({ urls: [data.url] }) },
      );
      setReviewing({
        ...reviewing,
        submission: {
          ...reviewing.submission,
          annotatedUrls: [
            ...(reviewing.submission.annotatedUrls || []),
            data.url,
          ],
        },
      });
      setAnnotatingSrc(null);
      showToast('Đã lưu ảnh sửa bài');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function exportSheet(format: 'xlsx' | 'pdf') {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/courses/${courseId}/lessons/${lessonId}/exercises/export?format=${format}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || '').slice(-300));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bang-diem-btvn-${lesson?.title || 'bai-hoc'}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (loading) return <div className="page-container">Đang tải…</div>;

  return (
    <div className="page-container" style={{ maxWidth: 1100 }}>
      <button
        className="btn btn-outline"
        style={{ width: 'auto', marginBottom: 12 }}
        onClick={() => router.push(`/teacher/courses/${courseId}`)}
      >
        ← Về khóa học
      </button>

      <h1 className="page-title" style={{ marginBottom: 4 }}>
        📥 Danh sách nộp bài
      </h1>
      <p className="page-subtitle">
        {course?.title} — {lesson?.title || ''}
        {lesson?.chapter ? ` · ${lesson.chapter}` : ''}
      </p>

      {exercises.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: 'var(--color-muted)' }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>✍️</div>
          <p style={{ fontSize: 16, fontWeight: 600 }}>Bài học chưa có BTVN tự luận</p>
          <p style={{ fontSize: 14, marginTop: 4 }}>
            Về khóa học → mở bài học → "+ Gõ đề mới" hoặc "🏦 Chọn từ ngân hàng đề" để gán bài tập.
          </p>
        </div>
      ) : (
        <>
          {/* Đề bài */}
          <div className="card" style={{ marginBottom: 16, padding: 14 }}>
            {exercises.map((ex: any, i: number) => (
              <div
                key={ex.id}
                style={{
                  padding: '8px 0',
                  borderBottom: i < exercises.length - 1 ? '1px solid var(--color-rule)' : 'none',
                }}
              >
                <strong style={{ fontSize: 13 }}>Bài {i + 1} ({ex.maxScore}đ):</strong>{' '}
                <span style={{ fontSize: 13 }}>
                  <LatexRenderer content={ex.prompt} />
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)', marginLeft: 8 }}>
                  {ex.submissions?.length ?? 0}/{students.length} bài nộp
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn" style={{ width: 'auto' }} onClick={() => exportSheet('xlsx')}>
                📊 Xuất bảng điểm (Excel)
              </button>
              <button className="btn btn-outline" style={{ width: 'auto' }} onClick={() => exportSheet('pdf')}>
                📄 Xuất bảng điểm (PDF)
              </button>
            </div>
          </div>

          {/* Bảng nộp bài */}
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-paper-2)' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>STT</th>
                  <th style={{ padding: '10px', textAlign: 'left', minWidth: 170 }}>Họ và tên</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Lớp</th>
                  {exercises.map((ex: any, i: number) => (
                    <th key={ex.id} style={{ padding: '10px', textAlign: 'center', minWidth: 110 }}>
                      Bài {i + 1}
                    </th>
                  ))}
                  <th style={{ padding: '10px', textAlign: 'center' }}>Chấm</th>
                </tr>
              </thead>
              <tbody>
                {students.map((stWrap: any, idx: number) => {
                  const st = stWrap.student || stWrap;
                  return (
                    <tr key={st.id} style={{ borderTop: '1px solid var(--color-rule)' }}>
                      <td style={{ padding: 8 }}>{idx + 1}</td>
                      <td style={{ padding: 8 }}>
                        <strong>{st.fullName}</strong>
                        <div className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                          {st.studentCode || ''}
                        </div>
                      </td>
                      <td style={{ padding: 8 }}>{st.className || '—'}</td>
                      {exercises.map((ex: any) => {
                        const sub = subOf(ex, st);
                        const d = displayScore(ex, sub);
                        return (
                          <td key={ex.id} style={{ padding: 8, textAlign: 'center' }}>
                            <span
                              className={
                                d.cls === 'final'
                                  ? 'badge badge-success'
                                  : d.cls === 'draft'
                                    ? 'badge badge-accent'
                                    : d.cls === 'pending'
                                      ? 'badge badge-warning'
                                      : undefined
                              }
                              style={d.cls === 'muted' ? { color: 'var(--color-muted)' } : undefined}
                            >
                              {d.text}
                            </span>
                            {sub?.imageUrls?.length ? (
                              <span style={{ fontSize: 11, marginLeft: 4 }}>📷</span>
                            ) : null}
                            {sub?.annotatedUrls?.length ? (
                              <span style={{ fontSize: 11, marginLeft: 4 }}>📝</span>
                            ) : null}
                          </td>
                        );
                      })}
                      <td style={{ padding: 8, textAlign: 'center' }}>
                        {exercises.some((ex: any) => subOf(ex, st)) && (
                          <button
                            className="btn btn-outline"
                            style={{ width: 'auto', padding: '5px 10px', fontSize: 12 }}
                            onClick={() => {
                              // Mở bài đầu tiên có bài nộp
                              for (const ex of exercises) {
                                const s = subOf(ex, st);
                                if (s) {
                                  openReview(ex, s);
                                  return;
                                }
                              }
                            }}
                          >
                            Chấm
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal chấm bài */}
      {reviewing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 50%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1600,
            padding: 16,
          }}
          onClick={() => setReviewing(null)}
        >
          <div
            style={{
              background: 'var(--color-paper)',
              borderRadius: 14,
              maxWidth: 700,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>
              ✅ Chấm bài — {reviewing.submission.student?.fullName}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 10 }}>
              Thang {reviewing.exercise.maxScore} · {reviewing.submission.student?.className || 'Chưa phân lớp'}
            </p>

            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <strong>Đề bài:</strong> <LatexRenderer content={reviewing.exercise.prompt} />
            </div>
            <div
              style={{
                fontSize: 13,
                marginBottom: 8,
                padding: 10,
                background: 'var(--color-paper-2)',
                borderRadius: 8,
                whiteSpace: 'pre-wrap',
              }}
            >
              <strong>Bài làm:</strong>
              <div style={{ marginTop: 4 }}>{reviewing.submission.content}</div>
            </div>

            {reviewing.submission.imageUrls?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>Ảnh bài làm (✏️ Sửa để viết lên ảnh):</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {reviewing.submission.imageUrls.map((url: string, i: number) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img
                        src={url}
                        alt={`Ảnh ${i + 1}`}
                        style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--color-rule)' }}
                      />
                      <button
                        className="btn"
                        style={{
                          position: 'absolute',
                          bottom: 6,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          padding: '4px 10px',
                          fontSize: 11,
                          width: 'auto',
                        }}
                        onClick={() => setAnnotatingSrc(url)}
                      >
                        ✏️ Sửa
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reviewing.submission.annotatedUrls?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <strong style={{ fontSize: 13, color: 'var(--color-success)' }}>📝 Ảnh đã sửa:</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {reviewing.submission.annotatedUrls.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt={`Đã sửa ${i + 1}`}
                        style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '2px solid var(--color-success)' }}
                      />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {reviewing.submission.aiFeedback && (
              <div
                style={{
                  fontSize: 12,
                  marginBottom: 8,
                  padding: 8,
                  background: 'color-mix(in oklch, var(--color-accent) 7%, var(--color-paper))',
                  borderRadius: 6,
                  whiteSpace: 'pre-wrap',
                }}
              >
                <strong style={{ fontSize: 11 }}>Bản nháp chấm sơ bộ:</strong>
                <div style={{ marginTop: 2 }}>{reviewing.submission.aiFeedback}</div>
              </div>
            )}

            <div className="form-group">
              <label>Điểm chốt (0 – {reviewing.exercise.maxScore})</label>
              <input
                type="number"
                min={0}
                max={reviewing.exercise.maxScore}
                step={0.25}
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
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
        <ImageAnnotator
          src={annotatingSrc}
          onCancel={() => setAnnotatingSrc(null)}
          onSave={handleAnnotatedBlob}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
