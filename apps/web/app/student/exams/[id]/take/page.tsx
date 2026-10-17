'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { formatAnswer } from '@/lib/answer';
import LatexRenderer from '@/components/LatexRenderer';
import ImageUploader, { UpImage } from '@/components/ImageUploader';

const PART_LABEL: Record<number, string> = {
  1: 'Trắc nghiệm',
  2: 'Đúng/Sai',
  3: 'Trả lời ngắn',
  4: 'Tự luận',
};

export default function TakeExam() {
  const params = useParams();
  const router = useRouter();
  const examId = params.id as string;

  const [exam, setExam] = useState<any>(null);
  const [answers, setAnswers] = useState<any>({});
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [warnings, setWarnings] = useState(0);
  const startTimeRef = useRef<number>(Date.now());
  const submittedRef = useRef(false);
  const answersRef = useRef<any>({});
  // Chấm ngay từng câu (chế độ luyện tập / xem đáp án từng câu)
  const [checks, setChecks] = useState<Record<string, any>>({});

  answersRef.current = answers;

  useEffect(() => {
    startExam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startExam() {
    try {
      const data = await apiFetch(`/exams/${examId}/start`, { method: 'POST' });
      setExam(data);
      setTimeLeft((data.duration || 45) * 60);
      // RESUME: khôi phục đáp án + thời gian đã làm dở
      if (data.resume && data.savedAnswers) {
        setAnswers(data.savedAnswers);
        const et: Record<string, string> = {};
        for (const [k, v] of Object.entries(data.savedAnswers)) {
          if (v && typeof v === 'object' && (v as any).text) {
            et[k] = (v as any).text;
          }
        }
        setEssayTexts(et);
        startTimeRef.current = Date.now() - (data.savedTimeSpent || 0) * 1000;
      }
      // Bật toàn màn hình khi bắt đầu thi (trừ chế độ luyện tập)
      if (!data.practiceMode) {
        try {
          await document.documentElement.requestFullscreen?.();
        } catch (e) {
          /* trình duyệt không hỗ trợ */
        }
      }
    } catch (e: any) {
      alert(e.message);
      router.push('/student/exams');
    }
  }

  // ===== TỰ LƯU TIẾN TRÌNH MỖI 15 GIÂY (resume nếu mất mạng/tắt máy) =====
  useEffect(() => {
    if (!exam || result) return;
    const autosave = async () => {
      if (submittedRef.current) return;
      try {
        await apiFetch(`/exams/${exam.examId}/attempts/${exam.attemptId}/autosave`, {
          method: 'POST',
          body: JSON.stringify({
            answers: answersRef.current,
            timeSpent: Math.round((Date.now() - startTimeRef.current) / 1000),
          }),
        });
      } catch (e) {
        /* lỗi mạng — bỏ qua, lần sau thử lại */
      }
    };
    const t = setInterval(autosave, 15000);
    const onUnload = () => {
      // autosave cuối khi rời trang (fire-and-forget)
      const token = localStorage.getItem('token');
      navigator.sendBeacon?.(
        `/api/exams/${exam.examId}/attempts/${exam.attemptId}/autosave`,
        new Blob(
          [
            JSON.stringify({
              answers: answersRef.current,
              timeSpent: Math.round((Date.now() - startTimeRef.current) / 1000),
            }),
          ],
          { type: 'application/json' },
        ),
      );
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(t);
      window.removeEventListener('beforeunload', onUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, result]);

  // Chấm ngay 1 câu (chế độ luyện tập): gọi API rồi lưu kết quả hiển thị
  async function checkItem(itemId: string, value: any) {
    if (!exam || !(exam.practiceMode || exam.answersAtEnd === false)) return;
    try {
      const r = await apiFetch(`/exams/${exam.examId}/check`, {
        method: 'POST',
        body: JSON.stringify({ itemId, answer: value }),
      });
      setChecks((p) => ({ ...p, [itemId]: r }));
    } catch (e) {
      /* bỏ qua */
    }
  }

  // Đồng hồ đếm ngược
  useEffect(() => {
    if (!exam || result) return;
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          doSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, result]);

  // Chống gian lận: phát hiện chuyển tab + thoát toàn màn hình
  useEffect(() => {
    if (!exam || result) return;
    const onVisibility = () => {
      if (document.hidden) {
        setWarnings((w) => {
          const nw = w + 1;
          if (nw >= 3) {
            alert('Bạn đã chuyển tab quá 3 lần. Bài thi sẽ tự động nộp!');
            doSubmit();
          } else {
            alert(`⚠️ Cảnh báo ${nw}/3: Không được chuyển tab khi đang làm bài!`);
          }
          return nw;
        });
      }
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setWarnings((w) => {
          const nw = w + 1;
          if (nw >= 3) {
            alert('Bạn đã thoát chế độ toàn màn hình quá 3 lần. Bài thi sẽ tự động nộp!');
            doSubmit();
          } else {
            alert(`⚠️ Cảnh báo ${nw}/3: Đã thoát toàn màn hình! Hãy quay lại chế độ làm bài (F11 hoặc nút phía dưới).`);
            // Thử bật lại fullscreen
            document.documentElement.requestFullscreen?.().catch(() => {});
          }
          return nw;
        });
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      alert('⚠️ Không được sao chép khi đang làm bài!');
    };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('copy', onCopy);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('copy', onCopy);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, result]);

  function setAnswer(itemId: string, value: any) {
    setAnswers((prev: any) => ({ ...prev, [itemId]: value }));
    checkItem(itemId, value);
  }

  function setTrueFalse(itemId: string, key: string, value: boolean) {
    setAnswers((prev: any) => {
      const current = { ...(prev[itemId] || {}) };
      current[key] = value;
      return { ...prev, [itemId]: current };
    });
    // Chấm ngay cho câu Đúng/Sai khi bật xem đáp án từng câu
    checkItem(itemId, answersRef.current[itemId]);
  }

  // Ảnh cho câu tự luận (giữ file + xem trước, nộp mới tải lên)
  const [essayTexts, setEssayTexts] = useState<Record<string, string>>({});
  const [essayFiles, setEssayFiles] = useState<Record<string, UpImage[]>>({});
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);

  async function doSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
      // Câu tự luận: tải ảnh (đúng thứ tự) + gộp chữ thành object { text, images }
      const finalAnswers: any = { ...answersRef.current };
      const token = localStorage.getItem('token');
      for (const [itemId, files] of Object.entries(essayFiles)) {
        if (files.length === 0) continue;
        setUploadingItem(itemId);
        const images: string[] = [];
        for (const f of files) {
          const res = await fetch('/api/uploads/image', {
            method: 'POST',
            headers: {
              'Content-Type': f.file.type || 'image/png',
              Authorization: `Bearer ${token}`,
            },
            body: f.file,
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ message: 'Không tải được ảnh' }));
            throw new Error(err.message || 'Không tải được ảnh');
          }
          const data = await res.json();
          images.push(data.url);
        }
        finalAnswers[itemId] = {
          text: essayTexts[itemId] || '',
          images,
        };
      }
      for (const [itemId, text] of Object.entries(essayTexts)) {
        if (!finalAnswers[itemId]) {
          finalAnswers[itemId] = { text, images: [] };
        }
      }
      const data = await apiFetch(`/exams/${examId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          attemptId: exam.attemptId,
          answers: finalAnswers,
          timeSpent,
        }),
      });
      setResult(data);
    } catch (e: any) {
      alert(e.message);
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Chờ AI chấm tự luận + phân tích điểm mạnh/yếu (chạy nền sau khi nộp)
  const [analysisReady, setAnalysisReady] = useState(false);
  useEffect(() => {
    if (!result?.pending || !result?.attemptId) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      try {
        const detail = await apiFetch(
          `/exams/${result.examId}/attempts/${result.attemptId}`,
        );
        if (detail.aiAnalysis) {
          clearInterval(timer);
          setAnalysisReady(true);
          setResult((prev: any) => ({
            ...prev,
            score: detail.score,
            passed: detail.score >= detail.totalScore * 0.5,
            results: detail.results,
            aiAnalysis: detail.aiAnalysis,
          }));
        }
      } catch (e) {
        /* thử lại */
      }
      if (tries >= 12) clearInterval(timer); // tối đa ~60 giây
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.pending, result?.attemptId]);

  // Tải đáp án PDF (chỉ sau khi nộp bài)
  async function downloadAnswersPdf(id: string) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/exams/${id}/answers-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || '').slice(-400));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dap_an.pdf';
      a.click();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // ============ KẾT QUẢ ============
  if (result) {
    return (
      <div className="page-container" style={{ maxWidth: 900 }}>
        <div className="card" style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>
            {result.passed ? '🎉' : '😅'}
          </div>
          <h1 style={{ fontSize: 28 }}>
            {result.score} / {result.totalScore} điểm
          </h1>
          {result.passMark != null && (
            <p
              style={{
                marginTop: 6,
                fontSize: 14,
                fontWeight: 700,
                color: result.passed ? 'var(--color-success)' : 'var(--color-danger)',
              }}
            >
              {result.passed ? '✅ ĐẠT' : '❌ CHƯA ĐẠT'} — điểm chuẩn {result.passMark}/{result.totalScore}
            </p>
          )}
          {result.late && (
            <p style={{ fontSize: 12.5, color: '#b45309', marginTop: 4 }}>⏰ Đã nộp sau hạn</p>
          )}

          {/* Thưởng XP + level */}
          {result.xp && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 14,
                marginTop: 12,
                padding: '8px 18px',
                border: '1px solid var(--color-rule)',
                borderRadius: 8,
                background: 'var(--color-paper)',
              }}
            >
              <span className="mono" style={{ fontWeight: 700, color: 'var(--color-accent)' }}>
                +{result.xp.xpEarned} XP
              </span>
              <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                Level {result.xp.level} · Tổng {result.xp.xp} XP
              </span>
            </div>
          )}

          {/* Thành tích mới */}
          {result.xp?.newAchievements?.length > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                border: '1px solid color-mix(in oklch, var(--color-accent) 40%, transparent)',
                borderRadius: 8,
                background: 'color-mix(in oklch, var(--color-accent) 8%, var(--color-paper))',
              }}
            >
              <strong style={{ color: 'var(--color-accent)' }}>
                Thành tích mới mở khóa!
              </strong>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                {result.xp.newAchievements.map((a: any) => (
                  <span key={a.code} className="badge badge-accent">
                    {a.icon} {a.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p style={{ color: 'var(--color-muted)', marginTop: 8 }}>
            {result.passed
              ? 'Chúc mừng! Bạn đã hoàn thành bài thi.'
              : 'Cố gắng luyện tập thêm nhé!'}
          </p>
          <button
            className="btn"
            style={{ width: 'auto', marginTop: 16 }}
            onClick={() => router.push('/student/exams')}
          >
            ← Về danh sách đề thi
          </button>
          <button
            className="btn btn-outline"
            style={{ width: 'auto', marginTop: 16, marginLeft: 10 }}
            onClick={() => downloadAnswersPdf(examId)}
          >
            Tải đáp án PDF
          </button>
        </div>

        {/* Đang chấm AI tự luận + phân tích */}
        {result.pending && !analysisReady && (
          <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 20 }}>
            <p style={{ fontSize: 14 }}>
              🤖 AI đang chấm câu tự luận và phân tích điểm mạnh/yếu…
            </p>
            <p className="mono" style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
              Kết quả sẽ tự cập nhật trong vài giây. Bạn có thể xem trước các câu trắc nghiệm bên dưới.
            </p>
          </div>
        )}

        {/* Phân tích điểm mạnh/yếu */}
        {result.aiAnalysis && (
          <div className="card" style={{ marginBottom: 16, padding: 18 }}>
            <h2 style={{ fontSize: 16, marginBottom: 10 }}>📈 Phân tích năng lực (AI)</h2>
            {result.aiAnalysis.strengths?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <strong style={{ color: 'var(--color-success)', fontSize: 14 }}>Điểm mạnh:</strong>
                <ul style={{ paddingLeft: 20, marginTop: 4, fontSize: 14 }}>
                  {result.aiAnalysis.strengths.map((s: string, i: number) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.aiAnalysis.weaknesses?.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <strong style={{ color: 'var(--color-danger)', fontSize: 14 }}>Cần cải thiện:</strong>
                <ul style={{ paddingLeft: 20, marginTop: 4, fontSize: 14 }}>
                  {result.aiAnalysis.weaknesses.map((w: string, i: number) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.aiAnalysis.advice && (
              <div
                style={{
                  fontSize: 14,
                  padding: 10,
                  background: 'color-mix(in oklch, var(--color-accent) 8%, var(--color-paper))',
                  borderRadius: 8,
                  marginTop: 6,
                }}
              >
                <strong>💡 Lời khuyên:</strong> {result.aiAnalysis.advice}
              </div>
            )}
          </div>
        )}

        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Xem lại bài làm</h2>
        {result.answersVisible === false ? (
          <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--color-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
            <p>
              {exam?.oneTimeResults
                ? 'Đáp án của đề này chỉ được xem đúng 1 lần — bạn đã xem rồi.'
                : 'Đáp án đã bị khóa (giáo viên đặt thời hạn hoặc chưa đến thời gian công bố).'}
            </p>
          </div>
        ) : (
        <div>
        {result.results.map((r: any) => (
          <div key={r.itemId} className="card" style={{ marginBottom: 12, padding: 18 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              {r.pending ? (
                <span className="badge badge-warning">⏳ Tự luận — đang chờ chấm</span>
              ) : r.finalScore !== null && r.finalScore !== undefined ? (
                <span className="badge badge-success">Đã chốt điểm</span>
              ) : (
                <span
                  className={r.correct ? 'badge badge-success' : 'badge badge-danger'}
                >
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
              <span className="mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                Câu {r.order}
              </span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <LatexRenderer content={r.content} />
            </div>
            {r.options && Array.isArray(r.options) && (
              <div style={{ fontSize: 14, marginBottom: 8, paddingLeft: 16 }}>
                {r.options.map((opt: any) => (
                  <div key={opt.id} style={{ marginBottom: 4 }}>
                    <strong>{opt.id}.</strong> <LatexRenderer content={opt.text} />
                  </div>
                ))}
              </div>
            )}
            {r.pending ? (
              r.aiFeedback ? (
                <div style={{ fontSize: 13, background: 'var(--color-paper)', padding: 10, borderRadius: 6, border: '1px solid var(--color-rule)' }}>
                  <strong style={{ color: 'var(--color-success)' }}>
                    📝 Thầy cô nhận xét (sơ bộ — chờ chốt điểm):
                  </strong>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>
                    {r.aiFeedback}
                  </div>
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
              <div style={{ fontSize: 13, background: 'color-mix(in oklch, var(--color-success) 8%, var(--color-paper))', padding: 10, borderRadius: 6, border: '1px solid var(--color-rule)' }}>
                <strong style={{ color: 'var(--color-success)' }}>
                  ✅ Đã chốt điểm: {r.finalScore} — 📝 Thầy cô nhận xét:
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
              <div style={{ fontSize: 13, background: 'var(--color-paper)', padding: 10, borderRadius: 6, border: '1px solid var(--color-rule)' }}>
                <span style={{ color: 'var(--color-muted)' }}>Đáp án đúng: </span>
                <LatexRenderer content={formatAnswer(r.correctAnswer)} />
                {r.solution && (
                  <div style={{ marginTop: 6 }}>
                    <strong style={{ color: 'var(--color-success)' }}>Lời giải:</strong>{' '}
                    <LatexRenderer content={r.solution} />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        </div>
        )}
      </div>
    );
  }

  // ============ LÀM BÀI ============
  if (!exam) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-muted)' }}>
        Đang tải đề thi...
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: 900 }}>
      {/* Thanh thông tin + timer */}
      <div
        className="card"
        style={{
          position: 'sticky',
          top: 16,
          zIndex: 100,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <strong>{exam.title}</strong>
          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {exam.questions.length} câu · {exam.totalScore} điểm
            {warnings > 0 && (
              <span style={{ color: '#d97706', marginLeft: 8 }}>
                ⚠️ {warnings}/3 cảnh báo chuyển tab
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: timeLeft < 60 ? '#dc2626' : '#4f46e5',
              fontFamily: 'monospace',
            }}
          >
            ⏱ {formatTime(timeLeft)}
          </div>
        </div>
      </div>

      {exam.resume && (
        <div className="card" style={{ marginBottom: 16, padding: 12, borderLeft: '4px solid var(--color-success)', background: '#ecfdf3' }}>
          <strong style={{ color: 'var(--color-success)' }}>💾 Đã khôi phục bài làm dở</strong>{' '}
          <span style={{ fontSize: 13 }}>— đáp án đã gõ và thời gian đã làm được giữ nguyên. Hệ thống tự lưu mỗi 15 giây.</span>
        </div>
      )}
      {exam.practiceMode && (
        <div className="card" style={{ marginBottom: 16, padding: 12, borderLeft: '4px solid var(--lm-amber)', background: '#fff7e0' }}>
          <strong>🎯 Chế độ LUYỆN TẬP</strong>{' '}
          <span style={{ fontSize: 13 }}>— chọn đáp án là biết đúng/sai + xem lời giải ngay. Làm lại thoải mái, không tính điểm.</span>
        </div>
      )}
      {!exam.practiceMode && exam.answersAtEnd === false && (
        <div className="card" style={{ marginBottom: 16, padding: 12, borderLeft: '4px solid var(--lm-amber)', background: '#fff7e0' }}>
          <strong>👀 Xem đáp án từng câu</strong>{' '}
          <span style={{ fontSize: 13 }}>— giáo viên cho phép biết đúng/sai ngay khi chọn.</span>
        </div>
      )}

      {/* Câu hỏi */}
      {exam.questions.map((q: any, idx: number) => (
        <div key={q.itemId} className="card" style={{ marginBottom: 16, padding: 20 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <span className="badge badge-accent">Câu {idx + 1}</span>
            <span className="badge">{PART_LABEL[q.part] || 'Phần'}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--color-muted)', alignSelf: 'center' }}>
              +{q.score} điểm
            </span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <LatexRenderer content={q.content} />
          </div>

          {q.type === 'MCQ' && q.options && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {q.options.map((opt: any) => (
                <label
                  key={opt.id}
                  style={{
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '10px 14px',
                    border: '1.5px solid var(--color-rule)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background:
                      answers[q.itemId] === opt.id
                        ? 'color-mix(in oklch, var(--color-accent) 12%, var(--color-paper))'
                        : checks[q.itemId]?.answer === opt.id
                          ? '#ecfdf3'
                          : 'transparent',
                    borderColor:
                      checks[q.itemId]?.answer === opt.id
                        ? 'var(--color-success)'
                        : undefined,
                  }}
                >
                  <input
                    type="radio"
                    name={`q-${q.itemId}`}
                    checked={answers[q.itemId] === opt.id}
                    onChange={() => setAnswer(q.itemId, opt.id)}
                    style={{ marginTop: 4 }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong>{opt.id}.</strong> <LatexRenderer content={opt.text} />
                  </span>
                </label>
              ))}
            </div>
          )}
          {checks[q.itemId] && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 8,
                background: checks[q.itemId].correct ? '#ecfdf3' : '#fef2f2',
                border: `1.5px solid ${checks[q.itemId].correct ? 'var(--color-success)' : 'var(--color-danger)'}`,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 13.5, color: checks[q.itemId].correct ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {checks[q.itemId].correct ? '✅ Chính xác!' : '❌ Chưa đúng'}
                <span className="mono" style={{ marginLeft: 8 }}>
                  Đáp án: {formatAnswer(checks[q.itemId].answer)}
                </span>
              </div>
              {checks[q.itemId].solution && (
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  💡 <LatexRenderer content={checks[q.itemId].solution} />
                </div>
              )}
            </div>
          )}

          {q.type === 'TRUE_FALSE' && q.options && (
            <div>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 14,
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>
                      Mệnh đề
                    </th>
                    <th style={{ padding: '8px 12px', width: 90, textAlign: 'center', fontWeight: 600 }}>
                      Đúng
                    </th>
                    <th style={{ padding: '8px 12px', width: 90, textAlign: 'center', fontWeight: 600 }}>
                      Sai
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.options.map((opt: any) => {
                    const cur = answers[q.itemId] || {};
                    const val: boolean | undefined = cur[opt.id];
                    return (
                      <tr key={opt.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <strong>{opt.id}.</strong> <LatexRenderer content={opt.text} />
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setTrueFalse(q.itemId, opt.id, true)}
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              border: val === true ? '2.5px solid var(--color-success)' : '2px solid #cbd5e1',
                              background: val === true ? 'var(--color-success)' : '#fff',
                              color: val === true ? '#fff' : 'transparent',
                              cursor: 'pointer',
                              fontSize: 16,
                              fontWeight: 700,
                              lineHeight: 1,
                            }}
                            title="Tích chọn Đúng"
                          >
                            ✓
                          </button>
                        </td>
                        <td style={{ padding: 8, textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setTrueFalse(q.itemId, opt.id, false)}
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              border: val === false ? '2.5px solid var(--color-danger)' : '2px solid #cbd5e1',
                              background: val === false ? 'var(--color-danger)' : '#fff',
                              color: val === false ? '#fff' : 'transparent',
                              cursor: 'pointer',
                              fontSize: 16,
                              fontWeight: 700,
                              lineHeight: 1,
                            }}
                            title="Tích chọn Sai"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 6 }}>
                Tích chọn Đúng (✓ xanh) hoặc Sai (✕ đỏ) cho từng mệnh đề · Chấm bậc thang: đúng 4/4 = trọn điểm, 3/4 = 50%, 2/4 = 25%, 1/4 = 10%
              </p>
            </div>
          )}

          {q.type === 'SHORT_ANSWER' && (
            <input
              value={answers[q.itemId] || ''}
              onChange={(e) => setAnswer(q.itemId, e.target.value)}
              placeholder="Nhập đáp án..."
              style={{
                width: '100%',
                padding: 12,
                border: '1.5px solid #e2e8f0',
                borderRadius: 10,
                fontSize: 15,
              }}
            />
          )}

          {q.type === 'ESSAY' && (
            <div>
              <textarea
                value={essayTexts[q.itemId] || ''}
                onChange={(e) =>
                  setEssayTexts((prev) => ({ ...prev, [q.itemId]: e.target.value }))
                }
                rows={5}
                placeholder="Viết bài làm của bạn (hoặc tải ảnh bài làm bên dưới)..."
                style={{
                  width: '100%',
                  padding: 12,
                  border: '1.5px solid #e2e8f0',
                  borderRadius: 10,
                  fontSize: 15,
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ marginTop: 8 }}>
                <ImageUploader
                  images={essayFiles[q.itemId] || []}
                  onChange={(next) =>
                    setEssayFiles((prev) => ({ ...prev, [q.itemId]: next }))
                  }
                  disabled={uploadingItem === q.itemId || submitting}
                />
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        className="btn"
        style={{ padding: 14, fontSize: 16 }}
        onClick={doSubmit}
        disabled={submitting}
      >
        {submitting ? 'Đang nộp bài...' : '📤 Nộp bài'}
      </button>
    </div>
  );
}
