'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, getUser } from '@/lib/api';
import { isImageFile, uploadImage as uploadImageFile } from '@/lib/image-upload';
import BackButton from '@/components/BackButton';
import LatexRenderer from '@/components/LatexRenderer';
import { SkeletonCards } from '@/components/Skeleton';

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
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    setMe(getUser());
  }, []);

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
    // Mở thẳng một bài giao khi đến từ bài giảng: ?open=<assignmentId>
    const open = new URLSearchParams(window.location.search).get('open');
    if (open) openDetail(open);
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

  // Tải lần lượt từng ảnh (giữ đúng thứ tự trang; nén trên máy trước khi gửi)
  const [uploadProgress, setUploadProgress] = useState('');
  async function uploadImages(files: File[]) {
    const imgs = files.filter(isImageFile);
    if (imgs.length < files.length) showToast(`Bỏ qua ${files.length - imgs.length} tệp không phải ảnh`);
    if (!imgs.length) return;
    setUploading(true);
    let ok = 0;
    try {
      for (let i = 0; i < imgs.length; i++) {
        setUploadProgress(`${i + 1}/${imgs.length}`);
        try {
          const url = await uploadImageFile(imgs[i]);
          ok++;
          setImages((prev) => [...prev, url]);
        } catch (e: any) {
          showToast(`Ảnh ${i + 1}: ${e.message}`);
        }
      }
      if (ok) showToast(`Đã tải ${ok}/${imgs.length} ảnh`);
    } finally {
      setUploading(false);
      setUploadProgress('');
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

  // Đổi thứ tự ảnh bài làm (ảnh 1 là trang đầu)
  function moveImage(from: number, to: number) {
    setImages((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
  }

  async function submit() {
    if (!detail) return;
    setSubmitting(true);
    try {
      await apiFetch(`/courses/${courseId}/assignments/${detail.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ content, imageUrls: images, pdfUrl: pdfUrl || null, answers }),
      });
      showToast(
        detail?.mySubmission ? '✅ Đã cập nhật bài nộp!' : '✅ Đã nộp bài! AI đang chấm thô…',
      );
      openDetail(detail.id);
      load();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Hạn nộp (đã tính theo lớp). Còn hạn ⇒ học sinh được SỬA/NỘP LẠI bài tự luận.
  const dueTs = detail?.dueDate ? new Date(detail.dueDate).getTime() : null;
  const pastDue = dueTs != null && Date.now() > dueTs;
  const isEssayKind = detail && detail.kind !== 'EXAM';
  const rz = detail?.resubmit;
  const canEditBeforeDue = Boolean(isEssayKind && !pastDue);
  // Server là nguồn chân lý (tính cả giới hạn lượt sửa + khoá sau khi chấm)
  const serverCanEdit = rz ? Boolean(rz.canEdit) : canEditBeforeDue;
  const canSubmit = Boolean(
    detail &&
      (!detail.mySubmission ||
        detail.mySubmission.status === 'RETURNED' ||
        detail.allowResubmit ||
        serverCanEdit),
  );
  const isResubmit = Boolean(detail?.mySubmission && canSubmit);
  const mySub = detail?.mySubmission;

  // Lý do bị khoá (hiển thị cho học sinh)
  const lockReason = (() => {
    if (!mySub || canSubmit) return '';
    if (rz?.pastDue || pastDue) return 'Đã hết hạn nộp nên không thể sửa bài.';
    if (rz?.lockedAfterGraded && rz?.graded)
      return 'Giáo viên đã chấm bài nên không thể sửa.';
    if (rz?.editsLeft === 0)
      return rz?.maxResubmit === 0
        ? 'Bài giao này không cho phép sửa lại sau khi đã nộp.'
        : `Bạn đã dùng hết ${rz?.maxResubmit} lượt sửa bài.`;
    return '';
  })();

  return (
    <div className="page-container" style={{ maxWidth: 1100 }}>
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
        <div style={{ marginTop: 20 }}>
          <SkeletonCards count={6} height={132} />
        </div>
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
          <div className="lm-detail" style={{ maxWidth: 960 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head" style={{ alignItems: 'flex-start' }}>
              <strong style={{ fontSize: 19, lineHeight: 1.35, wordBreak: 'break-word' }}>{detail.title}</strong>
              <button className="lm-detail-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="lm-detail-body" style={{ maxHeight: '84vh', overflowY: 'auto' }}>
              {/* Thông tin bài nộp — các dòng có icon cho dễ đọc */}
              <div className="lm-sub-meta">
                <div>
                  <span className="lm-sub-ico">🔖</span> Mã bài tập:{' '}
                  <b className="mono">{String(detail.id || '').slice(-8)}</b>
                </div>
                <div>
                  <span className="lm-sub-ico">🏫</span> Lớp: <b>{me?.className || '—'}</b>
                </div>
                <div>
                  <span className="lm-sub-ico">👤</span> Tên học sinh:{' '}
                  <b>{me?.fullName || '—'}</b>
                </div>
                <div>
                  <span className="lm-sub-ico">📅</span> Hạn nộp:{' '}
                  <b>
                    {detail.dueDate
                      ? new Date(detail.dueDate).toLocaleString('vi-VN')
                      : 'Không thời hạn'}
                  </b>
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginBottom: 12 }}>
                {detail.kind === 'EXAM' ? '📝 Đề thi' : detail.kind === 'TULUAN' ? '✍️ Tự luận' : '🖊 Tự gõ đề'}
                {detail.exam ? ` · ${detail.exam.totalScore}đ` : ''}
              </div>
              {detail.description && (
                <div style={{ padding: 10, background: 'var(--color-paper-2)', borderRadius: 8, marginBottom: 12, whiteSpace: 'pre-wrap', fontSize: 13.5 }}>
                  {detail.description}
                </div>
              )}
              {detail.questions?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--lm-maroon)' }}>
                      📄 ĐỀ BÀI
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      ({detail.questions.length} câu)
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {detail.questions.map((q: any, i: number) => {
                      const TypeLabel: Record<string, string> = {
                        MCQ: 'Trắc nghiệm',
                        TRUE_FALSE: 'Đúng/Sai',
                        SHORT_ANSWER: 'Trả lời ngắn',
                        ESSAY: 'Tự luận',
                      };
                      const Letters = 'ABCDEFGH';
                      const opts: any[] = Array.isArray(q.options) ? q.options : [];
                      return (
                        <div
                          key={q.id || i}
                          style={{
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-rule)',
                            borderRadius: 10,
                            padding: 14,
                          }}
                        >
                          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 6, flexWrap: 'wrap' }}>
                            <b style={{ fontSize: 13.5, color: 'var(--lm-maroon)' }}>Câu {i + 1}.</b>
                            {q.type && (
                              <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                                {TypeLabel[q.type] || q.type}
                              </span>
                            )}
                            {q.code && (
                              <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>· {q.code}</span>
                            )}
                          </div>
                          <LatexRenderer content={q.content || ''} />
                          {opts.length > 0 && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {opts.map((o: any, k: number) => (
                                <div key={k} style={{ fontSize: 13, display: 'flex', gap: 6 }}>
                                  <b style={{ flexShrink: 0 }}>{Letters[k] || k + 1}.</b>
                                  <div style={{ minWidth: 0 }}>
                                    <LatexRenderer content={typeof o === 'string' ? o : o?.content || ''} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {detail.customContent && (
                <div style={{ padding: 12, background: 'var(--color-surface)', border: '1px solid var(--color-rule)', borderRadius: 8, marginBottom: 12 }}>
                  <LatexRenderer content={detail.customContent} />
                </div>
              )}
              {detail.customQuestions?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {detail.customQuestions.map((c: string, i: number) => (
                    <div key={i} style={{ padding: 12, background: 'var(--color-surface)', border: '1px solid var(--color-rule)', borderRadius: 8 }}>
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
                <div style={{ padding: 14, borderRadius: 10, background: mySub.published ? 'color-mix(in srgb, var(--color-success) 14%, var(--color-surface))' : 'var(--color-track)', marginBottom: 14 }}>
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
                      📥 Bài đã nộp — đang chờ giáo viên chốt điểm
                      {mySub.aiScore != null ? ` · Điểm cao nhất tạm tính: ${mySub.aiScore}` : ''}.
                    </div>
                  )}
                </div>
              )}

              {/* ===== LÀM BÀI ===== */}
              {canSubmit && (
                <>
                  {detail.kind === 'EXAM' && detail.exam ? (
                    <div style={{ marginBottom: 14 }}>
                      {/* Launcher làm bài */}
                      <div style={{ padding: 18, borderRadius: 14, background: 'var(--lm-maroon)', color: '#fff', marginBottom: 12 }}>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>📝 {detail.exam.title}</div>
                        <div style={{ fontSize: 13, marginTop: 4, opacity: 0.9 }}>
                          {detail.exam.totalScore} điểm · {detail.exam.duration} phút
                          {detail.dueDate ? ` · Hạn nộp: ${new Date(detail.dueDate).toLocaleString('vi-VN')}` : ''}
                        </div>
                        {mySub && (mySub.score != null || mySub.aiScore != null) && (
                          <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800, color: '#ffd27a' }}>
                            🏆 Điểm cao nhất của bạn: {mySub.score ?? mySub.aiScore}/{detail.exam.totalScore}
                          </div>
                        )}
                        <div style={{ marginTop: 14 }}>
                          <a
                            href={`/student/exams/${detail.exam.id}/take`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-block',
                              textDecoration: 'none',
                              padding: '12px 28px',
                              fontWeight: 800,
                              fontSize: 15.5,
                              borderRadius: 10,
                              background: 'var(--color-surface)',
                              color: 'var(--lm-maroon)',
                              boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
                            }}
                          >
                            ▶ Bắt đầu làm bài
                          </a>
                        </div>
                        <div style={{ fontSize: 12, marginTop: 10, opacity: 0.92 }}>
                          ⏱ Bài có bộ đếm ngược + chống gian lận. Điểm sẽ <strong>tự động lưu</strong> khi bạn nộp bài hoặc thoát ra.
                        </div>
                      </div>
                      {mySub && (
                        <div style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
                          Trạng thái: {mySub.status === 'RETURNED' ? '🔁 Cần nộp lại' : '📥 Đã nộp — chờ giáo viên chốt điểm'}
                          {mySub.score != null ? ` · Điểm: ${mySub.score}` : mySub.aiScore != null ? ` · Điểm tạm tính: ${mySub.aiScore}` : ''}
                        </div>
                      )}
                    </div>
                  ) : detail.kind === 'EXAM' ? (
                    <div style={{ marginBottom: 14, padding: 14, background: 'var(--color-paper-2)', borderRadius: 10, fontSize: 13 }}>
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
                    <label style={{ fontSize: 14 }}>
                      📷 Ảnh bài làm{' '}
                      <span style={{ color: 'var(--color-muted)', fontWeight: 500, fontSize: 12.5 }}>
                        — dùng ◀ ▶ để đổi thứ tự (ảnh 1 là trang đầu)
                      </span>
                    </label>

                    {images.length > 0 && (
                      <div className="lm-sub-imgs">
                        {images.map((u, i) => (
                          <div key={`${i}-${u.slice(-20)}`} className="lm-sub-img-card">
                            <div style={{ position: 'relative', background: 'var(--color-track)' }}>
                              <img src={u} alt={`Ảnh ${i + 1}`} loading="lazy" />
                              <button
                                type="button"
                                className="lm-sub-img-del"
                                title="Xoá ảnh này"
                                onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                              >
                                ✕
                              </button>
                              <span className="lm-sub-img-no">Trang {i + 1}</span>
                            </div>
                            <div className="lm-sub-img-bar">
                              <button
                                type="button"
                                onClick={() => moveImage(i, i - 1)}
                                disabled={i === 0}
                                title="Đưa lên trước"
                              >
                                ◀
                              </button>
                              <span>{i + 1}</span>
                              <button
                                type="button"
                                onClick={() => moveImage(i, i + 1)}
                                disabled={i === images.length - 1}
                                title="Đưa ra sau"
                              >
                                ▶
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <label className="lm-sub-drop">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={uploading}
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          e.currentTarget.value = '';
                          uploadImages(files);
                        }}
                        style={{ display: 'none' }}
                      />
                      <span style={{ fontSize: 24, lineHeight: 1 }}>⬆️</span>
                      <span className="lm-sub-drop-title">
                        {uploading ? `Đang tải ảnh ${uploadProgress}…` : 'Chụp hoặc chọn ảnh bài làm'}
                      </span>
                      <span className="lm-sub-drop-hint">
                        Chọn nhiều ảnh được, ảnh tự nén trước khi gửi · PDF tải ở ô bên dưới
                      </span>
                    </label>
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

                  {mySub && canSubmit && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '9px 12px',
                        borderRadius: 8,
                        background: 'var(--color-track)',
                        border: '1px solid var(--color-rule-2)',
                        fontSize: 12.5,
                        color: 'var(--color-accent)',
                      }}
                    >
                      ✏️ Bạn đã nộp bài — vẫn có thể <b>sửa và nộp lại</b>.{' '}
                      {rz && rz.editsLeft != null ? (
                        <b>
                          Còn {rz.editsLeft}/{rz.maxResubmit} lượt sửa.
                        </b>
                      ) : (
                        <>(không giới hạn lượt sửa)</>
                      )}{' '}
                      Bài nộp mới sẽ thay thế bài cũ và cần giáo viên chấm lại.
                    </div>
                  )}
                  {mySub && !canSubmit && lockReason && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: '9px 12px',
                        borderRadius: 8,
                        background: 'var(--color-danger-wash)',
                        border: '1px solid var(--color-danger)',
                        fontSize: 12.5,
                        color: 'var(--color-danger)',
                      }}
                    >
                      🔒 {lockReason} Hãy liên hệ giáo viên nếu cần nộp lại.
                    </div>
                  )}
                  <div className="lm-sticky-actions" style={{ display: 'flex', justifyContent: 'center', marginTop: 18, marginBottom: 4 }}>
                    <button className="lm-submit-big" disabled={submitting || uploading} onClick={submit}>
                      {submitting
                        ? '⏳ Đang nộp…'
                        : uploading
                          ? '⏳ Đang tải tệp…'
                          : isResubmit
                            ? 'Cập nhật bài nộp'
                            : 'Nộp bài'}
                    </button>
                  </div>
                    </>
                  )}
                </>
              )}

              {/* Bảng xếp hạng */}
              {detail.showLeaderboard && leaderboard && leaderboard.length > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: 'var(--color-paper-2)', borderRadius: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--color-warning)', marginBottom: 8 }}>🏆 Bảng xếp hạng</div>
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
