'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import LatexRenderer from '@/components/LatexRenderer';
import { formatAnswer } from '@/lib/answer';
import BackButton from '@/components/BackButton';
import { SkeletonRows } from '@/components/Skeleton';

export default function AttemptHistoryPage() {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Tải PDF "ĐÁP ÁN & LỜI GIẢI" của bài làm đang mở (server tự sửa lỗi LaTeX khi biên dịch)
  async function downloadAnswersPdf() {
    if (!detail?.examId || !detail?.attemptId) return;
    setDownloadingPdf(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/exams/${detail.examId}/attempts/${detail.attemptId}/answers-pdf`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || 'Không tạo được PDF đáp án').slice(-400));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dap-an-${String(detail.title || 'de-thi').slice(0, 40)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) {
      alert(e?.message || 'Lỗi tải PDF');
    } finally {
      setDownloadingPdf(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch('/exams/attempts/my');
      setAttempts(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(attempt: any) {
    if (detail?.attemptId === attempt.id) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setDetail(null);
    try {
      const data = await apiFetch(`/exams/${attempt.examId}/attempts/${attempt.id}`);
      setDetail(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingDetail(false);
    }
  }

  return (
    <div className="page-container">
      <BackButton to="/student/exams" label="Về Thi thử online" />
      <h1 className="page-title">Lịch sử làm bài</h1>
      <p className="page-subtitle">
        Xem lại các lần làm bài, điểm số và đáp án chi tiết của bạn.
      </p>

      {loading ? (
        <SkeletonRows count={7} />
      ) : attempts.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 44, color: 'var(--color-muted)' }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>Chưa có bài làm nào</p>
          <p style={{ fontSize: 14 }}>Vào mục "Thi thử online" để bắt đầu luyện tập!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {attempts.map((a) => (
            <div key={a.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 15 }}>{a.examTitle}</strong>
                  <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>
                    {a.teacherName} ·{' '}
                    {a.submittedAt ? new Date(a.submittedAt).toLocaleString('vi-VN') : ''}
                    {a.timeSpent ? ` · ${Math.floor(a.timeSpent / 60)} phút` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span
                    className={a.passed ? 'badge badge-success' : 'badge badge-danger'}
                  >
                    {a.score}/{a.totalScore}
                  </span>
                  <button
                    className="btn btn-outline"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                    onClick={() => openDetail(a)}
                  >
                    {detail?.attemptId === a.id ? 'Đóng' : 'Xem chi tiết'}
                  </button>
                </div>
              </div>

              {detail?.attemptId === a.id && (
                loadingDetail ? (
                  <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 10 }}>Đang tải chi tiết…</p>
                ) : (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="badge badge-accent">Điểm: {detail.score}/{detail.totalScore}</span>
                      <span className={detail.score >= detail.totalScore * 0.5 ? 'badge badge-success' : 'badge badge-danger'}>
                        {detail.score >= detail.totalScore * 0.5 ? 'Đạt' : 'Chưa đạt'}
                      </span>
                      <button
                        type="button"
                        className="btn-lm ghost"
                        style={{ width: 'auto', padding: '6px 14px', fontSize: 12.5, textDecoration: 'none' }}
                        disabled={downloadingPdf}
                        onClick={downloadAnswersPdf}
                        title="Tải PDF đáp án & lời giải của bài làm này"
                      >
                        {downloadingPdf ? '⏳ Đang tạo PDF…' : '📄 Tải đáp án PDF'}
                      </button>
                    </div>

                    {/* Phân tích điểm mạnh/yếu */}
                    {detail.aiAnalysis && (
                      <div
                        style={{
                          padding: 14,
                          background: 'color-mix(in oklch, var(--color-accent) 7%, var(--color-paper))',
                          border: '1px solid var(--color-rule)',
                          borderRadius: 8,
                          marginBottom: 12,
                        }}
                      >
                        <strong style={{ fontSize: 14 }}>📈 Phân tích năng lực (AI)</strong>
                        {detail.aiAnalysis.strengths?.length > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <span style={{ color: 'var(--color-success)', fontSize: 13, fontWeight: 600 }}>Điểm mạnh: </span>
                            {detail.aiAnalysis.strengths.join(' · ')}
                          </div>
                        )}
                        {detail.aiAnalysis.weaknesses?.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <span style={{ color: 'var(--color-danger)', fontSize: 13, fontWeight: 600 }}>Cần cải thiện: </span>
                            {detail.aiAnalysis.weaknesses.join(' · ')}
                          </div>
                        )}
                        {detail.aiAnalysis.advice && (
                          <div style={{ marginTop: 6, fontSize: 13 }}>
                            <strong>💡 Lời khuyên:</strong> {detail.aiAnalysis.advice}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {detail.results.map((r: any) => (
                        <div
                          key={r.itemId}
                          style={{
                            padding: 12,
                            border: '1px solid var(--color-rule)',
                            borderRadius: 8,
                            background: 'var(--color-paper)',
                          }}
                        >
                          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                            {r.pending ? (
                              <span className="badge badge-warning">⏳ Tự luận — đang chờ chấm</span>
                            ) : r.finalScore !== null && r.finalScore !== undefined ? (
                              <span className="badge badge-success">Đã chốt điểm</span>
                            ) : (
                              <span className={r.correct ? 'badge badge-success' : 'badge badge-danger'}>
                                {r.correct ? 'Đúng' : 'Sai'}
                              </span>
                            )}
                            {r.pending ? (
                              <span className="badge">chưa có điểm</span>
                            ) : (
                              <span className="badge">+{r.earned} điểm</span>
                            )}
                            {r.tfDetail && (
                              <span
                                className={
                                  r.tfDetail.fraction === 1
                                    ? 'badge badge-success'
                                    : 'badge badge-warning'
                                }
                              >
                                Đúng {r.tfDetail.correctCount}/{r.tfDetail.total} ý
                              </span>
                            )}
                            <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                              Câu {r.order}
                            </span>
                            {r.code && (
                              <span
                                className="mono"
                                style={{ fontSize: 11, color: 'var(--color-muted)' }}
                                title="Mã câu hỏi"
                              >
                                #{r.code}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 14, marginBottom: 6 }}>
                            <LatexRenderer content={r.content} />
                          </div>
                          {r.pending ? (
                            r.aiFeedback ? (
                              <div style={{ fontSize: 13, padding: 8, background: 'color-mix(in oklch, var(--color-accent) 8%, var(--color-paper))', borderRadius: 6 }}>
                                <strong style={{ color: 'var(--color-accent)' }}>
                                  📝 Thầy cô nhận xét (sơ bộ — chờ chốt điểm):
                                </strong>
                                <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{r.aiFeedback}</div>
                                {r.images?.length > 0 && (
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                    {r.images.map((url: string, i: number) => (
                                      <img key={i} src={url} alt={`Ảnh ${i + 1}`} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6 }} />
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : null
                          ) : r.finalScore !== null && r.finalScore !== undefined ? (
                            <div style={{ fontSize: 13, padding: 8, background: 'color-mix(in oklch, var(--color-success) 8%, var(--color-paper))', borderRadius: 6 }}>
                              <strong style={{ color: 'var(--color-success)' }}>
                                ✅ Đã chốt: {r.finalScore} điểm — 📝 Thầy cô nhận xét:
                              </strong>
                              <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
                                {r.finalComment || 'Không có nhận xét thêm.'}
                              </div>
                              {r.images?.length > 0 && (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                  {r.images.map((url: string, i: number) => (
                                    <img key={i} src={url} alt={`Ảnh ${i + 1}`} style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6 }} />
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12.5 }}>
                              {/* MCQ — hiện toàn bộ phương án, tô màu lựa chọn của mình */}
                              {r.type === 'MCQ' && Array.isArray(r.options) && r.options.length > 0 && (
                                <div style={{ margin: '4px 0 8px' }}>
                                  <div
                                    style={{
                                      marginBottom: 6,
                                      fontWeight: 800,
                                      fontSize: 12.5,
                                      color: r.correct ? 'var(--color-success)' : 'var(--color-danger)',
                                    }}
                                  >
                                    {r.correct ? '✅ Bạn chọn đúng' : '❌ Bạn chọn sai'}
                                    {' — '}
                                    <span style={{ fontWeight: 700 }}>
                                      Bạn chọn:{' '}
                                      <span className="mono">{formatAnswer(r.studentAnswer) || 'bỏ trống'}</span>
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {r.options.map((opt: any) => {
                                      const norm = (v: any) =>
                                        String(v ?? '')
                                          .replace(/[^a-zA-Z0-9]/g, '')
                                          .toLowerCase();
                                      const chosen = norm(r.studentAnswer) !== '' && norm(r.studentAnswer) === norm(opt.id);
                                      const isCorrect = norm(r.correctAnswer) !== '' && norm(r.correctAnswer) === norm(opt.id);
                                      const good = chosen && isCorrect;
                                      const bad = chosen && !isCorrect;
                                      return (
                                        <div
                                          key={opt.id}
                                          style={{
                                            display: 'flex',
                                            gap: 8,
                                            alignItems: 'flex-start',
                                            padding: '6px 10px',
                                            borderRadius: 8,
                                            background: good
                                              ? 'color-mix(in oklch, var(--color-success) 16%, var(--color-paper))'
                                              : bad
                                                ? 'color-mix(in oklch, var(--color-danger) 14%, var(--color-paper))'
                                                : isCorrect
                                                  ? 'color-mix(in oklch, var(--color-success) 8%, var(--color-paper))'
                                                  : 'transparent',
                                            border: `1.5px solid ${
                                              good || isCorrect
                                                ? 'var(--color-success)'
                                                : bad
                                                  ? 'var(--color-danger)'
                                                  : 'transparent'
                                            }`,
                                          }}
                                        >
                                          <span
                                            className="stt-badge"
                                            style={{
                                              background:
                                                good || isCorrect
                                                  ? 'var(--color-success)'
                                                  : bad
                                                    ? 'var(--color-danger)'
                                                    : undefined,
                                              color: good || isCorrect || bad ? '#fff' : undefined,
                                              borderColor:
                                                good || isCorrect
                                                  ? 'var(--color-success)'
                                                  : bad
                                                    ? 'var(--color-danger)'
                                                    : undefined,
                                            }}
                                          >
                                            {String(opt.id).toLowerCase()}
                                          </span>
                                          <span style={{ flex: 1, minWidth: 0, fontWeight: good || isCorrect ? 700 : undefined }}>
                                            <LatexRenderer content={opt.text} />
                                          </span>
                                          {chosen && isCorrect && (
                                            <span style={{ color: 'var(--color-success)', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                              ✓ Bạn chọn
                                            </span>
                                          )}
                                          {chosen && !isCorrect && (
                                            <span style={{ color: 'var(--color-danger)', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                              ✗ Bạn chọn
                                            </span>
                                          )}
                                          {!chosen && isCorrect && (
                                            <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap' }}>
                                              Đáp án đúng
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* TRUE_FALSE — bảng từng mệnh đề */}
                              {r.type === 'TRUE_FALSE' && Array.isArray(r.options) && r.options.length > 0 && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', margin: '4px 0 8px', fontSize: 12.5 }}>
                                  <thead>
                                    <tr style={{ background: 'var(--color-track)' }}>
                                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>Mệnh đề</th>
                                      <th style={{ padding: '6px 8px', width: 72 }}>Bạn chọn</th>
                                      <th style={{ padding: '6px 8px', width: 72 }}>Đáp án</th>
                                      <th style={{ padding: '6px 8px', width: 52 }}>KQ</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.options.map((opt: any) => {
                                      const picked = r.studentAnswer?.[opt.id];
                                      const right = r.correctAnswer?.[opt.id] === true;
                                      const ok = picked !== undefined && picked === right;
                                      return (
                                        <tr
                                          key={opt.id}
                                          style={{
                                            borderTop: '1px solid var(--color-rule-2)',
                                            background: ok
                                              ? 'color-mix(in oklch, var(--color-success) 8%, transparent)'
                                              : picked !== undefined
                                                ? 'color-mix(in oklch, var(--color-danger) 8%, transparent)'
                                                : undefined,
                                          }}
                                        >
                                          <td style={{ padding: '6px 8px' }}>
                                            <strong>{String(opt.id).toUpperCase()}.</strong>{' '}
                                            <LatexRenderer content={opt.text} />
                                          </td>
                                          <td
                                            style={{
                                              padding: '6px 8px',
                                              textAlign: 'center',
                                              fontWeight: 800,
                                              color:
                                                picked === undefined
                                                  ? 'var(--color-muted)'
                                                  : ok
                                                    ? 'var(--color-success)'
                                                    : 'var(--color-danger)',
                                            }}
                                          >
                                            {picked === undefined ? '—' : picked ? 'Đ' : 'S'}
                                          </td>
                                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>
                                            {right ? 'Đ' : 'S'}
                                          </td>
                                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>{ok ? '✅' : '❌'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}

                              {/* Trả lời ngắn */}
                              {r.type === 'SHORT_ANSWER' && (
                                <div style={{ marginBottom: 6 }}>
                                  <span>
                                    {r.correct ? '✅ Đúng' : '❌ Sai'} · Bạn trả lời:{' '}
                                    <b className="mono">{formatAnswer(r.studentAnswer) || '—'}</b>
                                  </span>
                                  <span style={{ color: 'var(--color-muted)', marginLeft: 8 }}>
                                    · Đáp án: <b className="mono">{formatAnswer(r.correctAnswer) || '—'}</b>
                                  </span>
                                </div>
                              )}

                              {r.tfDetail && (
                                <div style={{ color: 'var(--color-muted)', marginBottom: 4 }}>
                                  Đúng {r.tfDetail.correctCount}/{r.tfDetail.total} ý
                                </div>
                              )}

                              {r.solution && (
                                <div style={{ color: 'var(--color-muted)', marginTop: 4 }}>
                                  <strong style={{ color: 'var(--color-success)' }}>Lời giải:</strong>{' '}
                                  <LatexRenderer content={r.solution} />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
