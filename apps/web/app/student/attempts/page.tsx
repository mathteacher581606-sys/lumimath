'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import LatexRenderer from '@/components/LatexRenderer';
import { formatAnswer } from '@/lib/answer';
import BackButton from '@/components/BackButton';

export default function AttemptHistoryPage() {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

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
        <p>Đang tải…</p>
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
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      <span className="badge badge-accent">Điểm: {detail.score}/{detail.totalScore}</span>
                      <span className={detail.score >= detail.totalScore * 0.5 ? 'badge badge-success' : 'badge badge-danger'}>
                        {detail.score >= detail.totalScore * 0.5 ? 'Đạt' : 'Chưa đạt'}
                      </span>
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
                          </div>
                          <div style={{ fontSize: 14, marginBottom: 6 }}>
                            <LatexRenderer content={r.content} />
                          </div>
                          {r.options && Array.isArray(r.options) && r.options.length > 0 && (
                            <div style={{ fontSize: 13, paddingLeft: 10, marginBottom: 6, color: 'var(--color-muted)' }}>
                              {r.options.map((opt: any) => (
                                <div key={opt.id} style={{ display: 'flex', gap: 6 }}>
                                  <strong>{opt.id}.</strong>
                                  <span style={{ flex: 1, minWidth: 0 }}>
                                    <LatexRenderer content={opt.text} />
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
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
                            <div style={{ fontSize: 13, padding: 8, background: 'color-mix(in oklch, var(--color-success) 8%, var(--color-paper))', borderRadius: 6 }}>
                              <strong style={{ color: 'var(--color-success)' }}>Đáp án đúng:</strong>{' '}
                              <LatexRenderer content={formatAnswer(r.correctAnswer)} />
                              {r.solution && (
                                <div style={{ marginTop: 4 }}>
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
