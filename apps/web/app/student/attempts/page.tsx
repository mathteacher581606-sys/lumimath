'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import AttemptReview from '@/components/AttemptReview';
import BackButton from '@/components/BackButton';
import { SkeletonRows } from '@/components/Skeleton';

export default function AttemptHistoryPage() {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [pdfMsg, setPdfMsg] = useState<{ id: string; text: string } | null>(null);

  // Tải PDF "ĐÁP ÁN & LỜI GIẢI" của 1 bài làm (server tự sửa lỗi LaTeX khi biên dịch)
  async function downloadAnswersPdf(examId: string, attemptId: string, title: string) {
    setPdfBusyId(attemptId);
    setPdfMsg(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/exams/${examId}/attempts/${attemptId}/answers-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPdfMsg({ id: attemptId, text: String(err.message || 'Không tạo được PDF đáp án').slice(-300) });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const el = document.createElement('a');
      el.href = url;
      el.download = `dap-an-${String(title || 'de-thi').slice(0, 40)}.pdf`;
      document.body.appendChild(el);
      el.click();
      el.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) {
      setPdfMsg({ id: attemptId, text: e?.message || 'Lỗi tải PDF' });
    } finally {
      setPdfBusyId(null);
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
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    className={a.passed ? 'badge badge-success' : 'badge badge-danger'}
                  >
                    {a.score}/{a.totalScore}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ width: 'auto', minHeight: 40, padding: '0 14px', fontSize: 13 }}
                    disabled={pdfBusyId === a.id}
                    onClick={() => downloadAnswersPdf(a.examId, a.id, a.examTitle)}
                    title="Tải PDF đáp án & lời giải của bài làm này"
                  >
                    {pdfBusyId === a.id ? 'Đang tạo PDF…' : 'Tải đáp án PDF'}
                  </button>
                  <button
                    type="button"
                    className="btn sh-btn-accent"
                    style={{ width: 'auto', minHeight: 40, padding: '0 14px', fontSize: 13 }}
                    aria-expanded={detail?.attemptId === a.id}
                    onClick={() => openDetail(a)}
                  >
                    {detail?.attemptId === a.id ? 'Đóng' : 'Xem lại bài làm'}
                  </button>
                </div>
              </div>
              {pdfMsg && pdfMsg.id === a.id && (
                <p className="sh-error" role="alert" style={{ marginTop: 8 }}>
                  {pdfMsg.text}
                </p>
              )}

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

                    <AttemptReview results={detail.results || []} answersVisible={detail.answersVisible !== false} />
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
