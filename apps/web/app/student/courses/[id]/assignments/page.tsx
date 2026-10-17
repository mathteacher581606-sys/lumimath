'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import BackButton from '@/components/BackButton';
import LatexRenderer from '@/components/LatexRenderer';

export default function StudentCourseAssignments() {
  const params = useParams();
  const courseId = params.id as string;
  const [course, setCourse] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Chi tiết + nộp bài
  const [detail, setDetail] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [pdfUrl, setPdfUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[] | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    try {
      setCourse(await apiFetch(`/courses/${courseId}`));
      setData(await apiFetch(`/courses/${courseId}/assignments`));
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function openDetail(id: string) {
    try {
      const d = await apiFetch(`/courses/${courseId}/assignments/${id}`);
      setDetail(d);
      setAnswers({});
      setContent(d.mySubmission?.content || '');
      setImages(d.mySubmission?.imageUrls || []);
      setPdfUrl(d.mySubmission?.pdfUrl || '');
      setLeaderboard(null);
      if (d.showLeaderboard) {
        apiFetch(`/courses/${courseId}/assignments/${id}/leaderboard`)
          .then(setLeaderboard)
          .catch(() => {});
      }
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function uploadImage(file: File) {
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
        throw new Error(err.message);
      }
      const d = await res.json();
      setImages((prev) => [...prev, d.url]);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  async function uploadPdf(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      showToast('⚠️ PDF quá lớn (tối đa 10MB)');
      return;
    }
    setUploading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/uploads/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${token}` },
        body: file,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Không tải được PDF' }));
        throw new Error(err.message);
      }
      const d = await res.json();
      setPdfUrl(d.url);
      showToast(`📄 Đã tải PDF${d.compressed ? ' (đã nén)' : ''}`);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!detail) return;
    setSubmitting(true);
    try {
      await apiFetch(`/courses/${courseId}/assignments/${detail.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ content, imageUrls: images, pdfUrl: pdfUrl || null, answers }),
      });
      showToast('✅ Đã nộp bài! AI đang chấm thô…');
      openDetail(detail.id);
      load();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    detail &&
    (!detail.mySubmission ||
      detail.mySubmission.status === 'RETURNED' ||
      detail.allowResubmit);
  const mySub = detail?.mySubmission;

  return (
    <div className="page-container" data-theme="maroon" style={{ maxWidth: 1100 }}>
      {toast && <div className="toast" style={{ position: 'fixed', top: 20, right: 20, zIndex: 60 }}>{toast}</div>}
      <div className="lm-band">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>
            <BackButton to={`/student/courses/${courseId}`} label="Về khóa học" />
            📚 Bài tập được giao
          </h2>
          <p className="lm-band-sub">{course?.title || 'Đang tải…'}</p>
        </div>
      </div>

      {data === null ? (
        <p style={{ marginTop: 20, color: 'var(--color-muted)' }}>Đang tải…</p>
      ) : data.assignments.length === 0 ? (
        <div className="card" style={{ marginTop: 20, textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
          <p>Chưa có bài tập nào được giao.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12, marginTop: 20 }}>
          {data.assignments.map((a: any) => (
            <div key={a.id} className="card" style={{ padding: 14, cursor: 'pointer', borderLeft: '4px solid var(--lm-amber)' }} onClick={() => openDetail(a.id)}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 26 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
                    {a.kind === 'EXAM' ? '📝 Đề thi' : a.kind === 'TULUAN' ? '✍️ Tự luận' : '🖊 Tự gõ đề'}
                    {a.dueDate ? ` · hạn ${new Date(a.dueDate).toLocaleDateString('vi-VN')}` : ''}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12.5 }}>
                    {!a.mySubmission ? (
                      <span className="badge" style={{ fontSize: 11 }}>Chưa nộp</span>
                    ) : a.mySubmission.status === 'RETURNED' ? (
                      <span className="badge badge-warning" style={{ fontSize: 11 }}>🔁 Cần nộp lại</span>
                    ) : a.mySubmission.published ? (
                      <span className="badge badge-success" style={{ fontSize: 11 }}>✅ {a.mySubmission.score ?? '—'}đ</span>
                    ) : (
                      <span className="badge" style={{ fontSize: 11 }}>📥 Đã nộp — chờ chấm</span>
                    )}
                    {a.isLate && <span className="badge badge-warning" style={{ fontSize: 11, marginLeft: 6 }}>⏰ Nộp muộn</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== MODAL CHI TIẾT BÀI GIAO ===== */}
      {detail && (
        <div className="lm-detail-backdrop" onClick={() => setDetail(null)}>
          <div className="lm-detail" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head">
              <strong>📚 {detail.title}</strong>
              <button className="lm-detail-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="lm-detail-body" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 10 }}>
                {detail.kind === 'EXAM' ? '📝 Đề thi' : detail.kind === 'TULUAN' ? '✍️ Tự luận' : '🖊 Tự gõ đề'}
                {detail.dueDate ? ` · Hạn nộp: ${new Date(detail.dueDate).toLocaleString('vi-VN')}` : ' · Không giới hạn thời gian'}
                {detail.exam ? ` · ${detail.exam.totalScore}đ` : ''}
              </div>
              {detail.description && (
                <div style={{ padding: 10, background: '#faf6ee', borderRadius: 8, marginBottom: 12, whiteSpace: 'pre-wrap', fontSize: 13.5 }}>
                  {detail.description}
                </div>
              )}
              {detail.customContent && (
                <div style={{ padding: 12, background: '#fff', border: '1px solid var(--color-rule)', borderRadius: 8, marginBottom: 12 }}>
                  <LatexRenderer content={detail.customContent} />
                </div>
              )}
              {detail.customQuestions?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {detail.customQuestions.map((c: string, i: number) => (
                    <div key={i} style={{ padding: 12, background: '#fff', border: '1px solid var(--color-rule)', borderRadius: 8 }}>
                      <div style={{ fontSize: 13.5 }}>
                        <b>Câu {i + 1}.</b> <LatexRenderer content={c} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {detail.pdfUrl && (
                <a href={detail.pdfUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--color-accent)', display: 'inline-block', marginBottom: 12 }}>
                  📄 Tải PDF đề bài
                </a>
              )}

              {/* ===== KẾT QUẢ (sau khi GV chốt) ===== */}
              {mySub && !canSubmit && (
                <div style={{ padding: 14, borderRadius: 10, background: mySub.published ? '#eefaf0' : '#fdf1dc', marginBottom: 14 }}>
                  {mySub.published ? (
                    <>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-success)' }}>
                        ✅ Điểm của bạn: {mySub.score ?? '—'} {detail.exam ? `/${detail.exam.totalScore}` : '/10'}
                      </div>
                      {mySub.assessment && (
                        <div style={{ marginTop: 4, fontWeight: 700, color: 'var(--lm-maroon)' }}>
                          Đánh giá: {mySub.assessment === 'Đ' ? 'Đạt' : mySub.assessment === 'CĐ' ? 'Chưa đạt' : mySub.assessment === 'HT' ? 'Hoàn thành' : mySub.assessment === 'CHT' ? 'Chưa hoàn thành' : mySub.assessment === 'HTT' ? 'Hoàn thành tốt' : mySub.assessment}
                        </div>
                      )}
                      {mySub.teacherComment && (
                        <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.6 }}>
                          💬{' '}
                          <span dangerouslySetInnerHTML={{ __html: mySub.teacherComment }} />
                        </div>
                      )}
                      {detail.showAnswers && detail.exam?.items && (
                        <div style={{ marginTop: 12, borderTop: '1px dashed var(--color-rule)', paddingTop: 10 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>🔑 Đáp án</div>
                          {detail.exam.items.map((it: any, i: number) => (
                            <div key={it.id} style={{ fontSize: 12.5, marginBottom: 8 }}>
                              <b>Câu {i + 1}:</b> <LatexRenderer content={String(it.question.answer ?? '—')} />
                              {it.question.solution ? (
                                <div style={{ color: 'var(--color-muted)', marginTop: 2 }}>
                                  💡 <LatexRenderer content={it.question.solution} />
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 13.5 }}>
                      📥 Bài đã nộp — đang chờ giáo viên chốt điểm{mySub.aiScore != null ? ` (AI chấm thô: ${mySub.aiScore})` : ''}.
                    </div>
                  )}
                </div>
              )}

              {/* ===== NỘP BÀI ===== */}
              {canSubmit && (
                <>
                  {detail.kind === 'EXAM' && detail.exam ? (
                    <div style={{ marginBottom: 14 }}>
                      {/* Launcher làm bài như THI ONLINE */}
                      <div style={{ padding: 16, borderRadius: 12, background: 'var(--lm-maroon)', color: '#fff', marginBottom: 12 }}>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>📝 {detail.exam.title}</div>
                        <div style={{ fontSize: 13, marginTop: 4, opacity: 0.9 }}>
                          {detail.exam.totalScore} điểm · {detail.exam.duration} phút
                          {detail.dueDate ? ` · Hạn nộp: ${new Date(detail.dueDate).toLocaleString('vi-VN')}` : ''}
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <a
                            href={`/student/exams/${detail.exam.id}/take`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-lm amber"
                            style={{ textDecoration: 'none', padding: '10px 20px', fontWeight: 800 }}
                          >
                            ▶ Bắt đầu làm bài thi
                          </a>
                          <button
                            type="button"
                            className="btn-lm ghost"
                            style={{ padding: '10px 20px' }}
                            onClick={async () => {
                              setSubmitting(true);
                              try {
                                await apiFetch(
                                  `/courses/${courseId}/assignments/${detail.id}/submit-exam`,
                                  { method: 'POST' },
                                );
                                showToast('✅ Đã nộp kết quả bài thi vào bài tập');
                                openDetail(detail.id);
                                load();
                              } catch (e: any) {
                                showToast('❌ ' + e.message);
                              } finally {
                                setSubmitting(false);
                              }
                            }}
                          >
                            {submitting ? '⏳ Đang nộp…' : '📥 Nộp kết quả vừa làm'}
                          </button>
                        </div>
                        <div style={{ fontSize: 12, marginTop: 10, opacity: 0.85 }}>
                          ⏱ Bài thi có bộ đếm ngược + chống gian lận. Làm xong quay lại đây bấm "📥 Nộp kết quả vừa làm".
                        </div>
                      </div>
                      {mySub && (
                        <div style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
                          Trạng thái: {mySub.status === 'RETURNED' ? '🔁 Cần nộp lại' : '📥 Đã nộp — chờ giáo viên chốt điểm'}
                        </div>
                      )}
                    </div>
                  ) : detail.kind === 'EXAM' ? (
                    <div style={{ marginBottom: 14, padding: 14, background: '#fdf1dc', borderRadius: 10, fontSize: 13 }}>
                      ⏳ Đề thi đang tải hoặc đã bị gỡ khỏi kho đề.
                    </div>
                  ) : (
                    <div className="form-group">
                      <label>Bài làm (gõ trực tiếp, hỗ trợ LaTeX $...$)</label>
                      <textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Viết bài làm tại đây…" />
                    </div>
                  )}

                  {/* Với đề thi: làm + nộp qua hệ thống thi online, không nộp file tại đây */}
                  {detail.kind !== 'EXAM' && (
                    <>
                  <div className="form-group">
                    <label>📷 Ảnh bài làm (không giới hạn số lượng, tự nén — hiện theo thứ tự tải lên)</label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={uploading}
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        files.forEach((f) => uploadImage(f));
                      }}
                    />
                    {images.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {images.map((u, i) => (
                          <div key={i} style={{ position: 'relative' }}>
                            <span className="mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>{i + 1}.</span>{' '}
                            <img src={u} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-rule)' }} />
                            <button
                              type="button"
                              onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                              style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, border: 'none', background: 'var(--color-danger)', color: '#fff', fontSize: 11, cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>📄 PDF bài làm (tối đa 10MB, tự nén)</label>
                    <input
                      type="file"
                      accept="application/pdf"
                      disabled={uploading}
                      onChange={(e) => uploadPdf(e.target.files?.[0] || (null as any))}
                    />
                    {pdfUrl && (
                      <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--color-accent)' }}>
                        ✅ Đã đính kèm PDF (xem)
                      </a>
                    )}
                  </div>

                  <button className="btn-lm amber" style={{ width: 'auto', padding: '9px 22px' }} disabled={submitting || uploading} onClick={submit}>
                    {submitting ? '⏳ Đang nộp…' : uploading ? '⏳ Đang tải tệp…' : '📤 Nộp bài'}
                  </button>
                    </>
                  )}
                </>
              )}

              {/* Bảng xếp hạng */}
              {detail.showLeaderboard && leaderboard && leaderboard.length > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: '#fdf1dc', borderRadius: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: '#8a5a1a', marginBottom: 8 }}>🏆 Bảng xếp hạng</div>
                  {leaderboard.map((r: any) => (
                    <div key={r.studentId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                      <span>
                        {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `${r.rank}.`}{' '}
                        {r.fullName}
                      </span>
                      <span className="mono" style={{ fontWeight: 700 }}>{r.score}đ</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
