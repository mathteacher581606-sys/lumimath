'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { formatAnswer } from '@/lib/answer';
import LatexRenderer from '@/components/LatexRenderer';
import ImageUploader, { UpImage } from '@/components/ImageUploader';
import AttemptReview from '@/components/AttemptReview';

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
  // Phòng thi: câu đang xem + câu đánh dấu (flag)
  const [current, setCurrent] = useState(0);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  // Hạn nộp tính theo đồng hồ thật (không trôi khi tab bị trình duyệt làm chậm)
  const deadlineRef = useRef<number>(0);
  // Cảnh báo chống gian lận hiển thị ngay trong trang (không dùng alert chặn màn hình)
  const [warnMsg, setWarnMsg] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');

  function toggleMark(itemId: string) {
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  answersRef.current = answers;
  const examRef = useRef<any>(null);
  examRef.current = exam;

  useEffect(() => {
    startExam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startExam() {
    try {
      const data = await apiFetch(`/exams/${examId}/start`, { method: 'POST' });
      setExam(data);
      // Làm tiếp bài dở: chỉ còn phần thời gian chưa dùng
      const totalSec = (data.duration || 45) * 60;
      const usedSec = data.resume ? Math.max(0, data.savedTimeSpent || 0) : 0;
      const remain = Math.max(0, totalSec - usedSec);
      deadlineRef.current = Date.now() + remain * 1000;
      setTimeLeft(remain);
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
      setLoadError(e.message || 'Không mở được đề thi');
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
            answers: withEssayText(answersRef.current),
            timeSpent: Math.round((Date.now() - startTimeRef.current) / 1000),
          }),
        });
      } catch (e) {
        /* lỗi mạng — bỏ qua, lần sau thử lại */
      }
    };
    const t = setInterval(autosave, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, result]);

  // Chấm ngay 1 câu (chế độ luyện tập): gọi API rồi lưu kết quả hiển thị
  // Chỉ câu trắc nghiệm 1 đáp án được chấm ngay; Đúng/Sai, nhiều đáp án, trả lời ngắn
  // chấm sau khi nộp bài (chấm giữa chừng sẽ lộ đáp án các ý còn lại).
  async function checkItem(itemId: string, value: any) {
    if (!exam || !(exam.practiceMode || exam.answersAtEnd === false)) return;
    const q = exam.questions.find((x: any) => x.itemId === itemId);
    if (!q || q.type !== 'MCQ') return;
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
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(t);
        doSubmitRef.current();
      }
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, result]);

  // Chống gian lận: phát hiện chuyển tab + thoát toàn màn hình (không áp dụng khi luyện tập)
  useEffect(() => {
    if (!exam || result || exam.practiceMode) return;
    const strike = (reason: string) => {
      if (submittedRef.current) return; // đã nộp (vd. thoát toàn màn hình sau khi nộp)
      setWarnings((w) => {
        const nw = w + 1;
        if (nw >= 3) {
          setWarnMsg(`${reason} quá 3 lần — bài thi đang được tự động nộp.`);
          doSubmitRef.current();
        } else {
          setWarnMsg(`Cảnh báo ${nw}/3: ${reason}. Lần thứ 3 bài sẽ tự nộp.`);
        }
        return nw;
      });
    };
    const onVisibility = () => {
      if (document.hidden) strike('Em đã rời khỏi trang làm bài');
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && document.fullscreenEnabled) {
        strike('Em đã thoát chế độ toàn màn hình');
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      setWarnMsg('Không được sao chép nội dung đề khi đang làm bài.');
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

  // Trắc nghiệm NHIỀU đáp án: bật/tắt một lựa chọn (mảng)
  function toggleMulti(itemId: string, optId: string) {
    const cur: string[] = Array.isArray(answers[itemId])
      ? answers[itemId]
      : answers[itemId]
        ? [answers[itemId]]
        : [];
    const next = cur.includes(optId)
      ? cur.filter((x) => x !== optId)
      : [...cur, optId];
    setAnswer(itemId, next);
  }

  function setTrueFalse(itemId: string, key: string, value: boolean) {
    const next = { ...(answersRef.current[itemId] || {}), [key]: value };
    answersRef.current = { ...answersRef.current, [itemId]: next };
    setAnswers((prev: any) => ({ ...prev, [itemId]: next }));
  }

  // Ảnh cho câu tự luận (giữ file + xem trước, nộp mới tải lên)
  const [essayTexts, setEssayTexts] = useState<Record<string, string>>({});
  const [essayFiles, setEssayFiles] = useState<Record<string, UpImage[]>>({});
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);
  // Ref luôn giữ bản mới nhất — tránh mất bài tự luận khi tự nộp lúc hết giờ
  const essayTextsRef = useRef<Record<string, string>>({});
  const essayFilesRef = useRef<Record<string, UpImage[]>>({});
  essayTextsRef.current = essayTexts;
  essayFilesRef.current = essayFiles;

  // Gộp chữ tự luận vào đáp án (để tự lưu và khôi phục được cả bài tự luận)
  function withEssayText(base: any) {
    const out: any = { ...base };
    for (const [itemId, text] of Object.entries(essayTextsRef.current)) {
      if (text) out[itemId] = { text, images: [] };
    }
    return out;
  }

  async function doSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
      // Câu tự luận: tải ảnh (đúng thứ tự) + gộp chữ thành object { text, images }
      const finalAnswers: any = { ...answersRef.current };
      const token = localStorage.getItem('token');
      const essayTextsNow = essayTextsRef.current;
      for (const [itemId, files] of Object.entries(essayFilesRef.current)) {
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
          text: essayTextsNow[itemId] || '',
          images,
        };
      }
      for (const [itemId, text] of Object.entries(essayTextsNow)) {
        if (!finalAnswers[itemId]) {
          finalAnswers[itemId] = { text, images: [] };
        }
      }
      const data = await apiFetch(`/exams/${examId}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          attemptId: examRef.current.attemptId,
          answers: finalAnswers,
          timeSpent,
        }),
      });
      setResult(data);
      // Nộp xong thì thoát toàn màn hình để học sinh xem kết quả thoải mái
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});

      // ===== TỰ ĐỘNG NỘP ĐIỂM vào bài tập (nếu đề được giao trong khóa học) =====
      // Học sinh không cần bấm "Nộp kết quả" nữa — điểm tự đồng bộ lên web.
      try {
        await apiFetch(`/exam-assignments/${examId}/sync`, { method: 'POST' });
      } catch (e) {
        /* đề không thuộc bài giao nào → bỏ qua */
      }
    } catch (e: any) {
      setSubmitError(e.message || 'Nộp bài không thành công, em thử lại nhé');
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
      setUploadingItem(null);
    }
  }
  const doSubmitRef = useRef(doSubmit);
  doSubmitRef.current = doSubmit;

  // ===== TỰ ĐỘNG NỘP BÀI khi học sinh THỰC SỰ thoát ra (đóng tab / rời trang) =====
  // KHÔNG nộp khi chỉ chuyển tab (học sinh thường mở máy tính/ghi chú) — tránh nộp non.
  useEffect(() => {
    if (!exam || result) return;
    const token = localStorage.getItem('token');
    const submitNow = () => {
      if (submittedRef.current || result) return;
      submittedRef.current = true;
      const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
      const body = JSON.stringify({
        attemptId: exam.attemptId,
        answers: withEssayText(answersRef.current),
        timeSpent,
      });
      try {
        fetch(`/api/exams/${examId}/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body,
          keepalive: true,
        });
      } catch (e) {
        /* bỏ qua — đã có autosave */
      }
    };
    window.addEventListener('beforeunload', submitNow);
    return () => {
      window.removeEventListener('beforeunload', submitNow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, result, examId]);

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
            answersVisible: detail.answersVisible,
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

  // Tải PDF đáp án & lời giải của chính bài vừa nộp (server tự sửa lỗi LaTeX khi biên dịch)
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');
  async function downloadAnswersPdf() {
    if (!result?.attemptId) return;
    setPdfBusy(true);
    setPdfMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/exams/${examId}/attempts/${result.attemptId}/answers-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPdfMsg(String(err.message || 'Không tạo được PDF đáp án').slice(-300));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dap-an-${String(exam?.title || 'de-thi').slice(0, 40)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e: any) {
      setPdfMsg(e?.message || 'Lỗi tải PDF');
    } finally {
      setPdfBusy(false);
    }
  }

  // ============ KẾT QUẢ ============
  if (result) {
    return (
      <div className="page-container" style={{ maxWidth: 900 }}>
        <div className="card ex-result" style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            className="sh-ring ex-result-ring"
            role="img"
            aria-label={`Đạt ${result.score} trên ${result.totalScore} điểm`}
            style={{ ['--p' as any]: `${result.totalScore ? Math.round((result.score / result.totalScore) * 100) : 0}%` }}
          >
            <div className="sh-ring-inner">
              <span className="ex-result-score">{result.score}</span>
              <span className="sh-ring-cap">/ {result.totalScore}</span>
            </div>
          </div>
          <h1 style={{ fontSize: 26 }}>{result.passed ? 'Hoàn thành tốt!' : 'Đã nộp bài'}</h1>
          {result.passMark != null && (
            <p
              style={{
                marginTop: 6,
                fontSize: 14,
                fontWeight: 700,
                color: result.passed ? 'var(--color-success)' : 'var(--color-danger)',
              }}
            >
              {result.passed ? 'ĐẠT' : 'CHƯA ĐẠT'} · điểm chuẩn {result.passMark}/{result.totalScore}
            </p>
          )}
          {result.late && (
            <p style={{ fontSize: 12.5, color: 'var(--color-warning)', marginTop: 4 }}>Đã nộp sau hạn</p>
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
            Về danh sách đề thi
          </button>
          {result.answersVisible !== false && (
            <button
              className="btn btn-outline"
              style={{ width: 'auto', marginTop: 16, marginLeft: 10 }}
              disabled={pdfBusy}
              onClick={downloadAnswersPdf}
            >
              {pdfBusy ? 'Đang tạo PDF…' : 'Tải đáp án PDF'}
            </button>
          )}
          {pdfMsg && (
            <p className="sh-error" role="alert" style={{ marginTop: 10 }}>
              {pdfMsg}
            </p>
          )}
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

        {result.answersVisible === false && exam?.oneTimeResults ? (
          <AttemptReview
            results={result.results || []}
            answersVisible={false}
            lockedMessage="Đáp án của đề này chỉ được xem đúng 1 lần — em đã xem rồi. Em vẫn xem được câu nào đúng, câu nào sai."
          />
        ) : (
          <AttemptReview results={result.results || []} answersVisible={result.answersVisible !== false} />
        )}
      </div>
    );
  }

  // ============ LÀM BÀI ============
  if (loadError) {
    return (
      <div className="page-container ex-msg-page">
        <div className="sh-box">
          <h1 style={{ fontSize: 22 }}>Không mở được đề thi</h1>
          <p className="sh-muted">{loadError}</p>
          <button type="button" className="btn" style={{ width: 'auto' }} onClick={() => router.push('/student/exams')}>
            Về danh sách đề thi
          </button>
        </div>
      </div>
    );
  }
  if (!exam) {
    return (
      <div className="page-container ex-msg-page" aria-busy="true">
        <div className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-card)' }} />
        <div className="skeleton" style={{ height: 260, borderRadius: 'var(--radius-card)' }} />
        <span className="sr-only">Đang tải đề thi…</span>
      </div>
    );
  }

  const isAnswered = (qq: any) => {
    const a = answers[qq.itemId];
    if (qq.type === 'ESSAY') {
      return !!(essayTexts[qq.itemId] || '').trim() || (essayFiles[qq.itemId] || []).length > 0;
    }
    if (qq.type === 'TRUE_FALSE') {
      return !!a && (qq.options || []).every((o: any) => typeof a[o.id] === 'boolean');
    }
    return a !== undefined && a !== '' && !(Array.isArray(a) && a.length === 0);
  };
  const total = exam.questions.length;
  const doneCount = exam.questions.filter(isAnswered).length;
  const unanswered = exam.questions
    .map((qq: any, i: number) => ({ n: i + 1, qq }))
    .filter((x: any) => !isAnswered(x.qq));
  const timerCls = timeLeft < 60 ? 'is-danger' : timeLeft < 300 ? 'is-warn' : '';

  function goTo(i: number) {
    setCurrent(i);
    setNavOpen(false);
    document
      .getElementById(`q-${exam.questions[i].itemId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const navGrid = (
    <div className="ex-nav-grid" role="list">
      {exam.questions.map((qq: any, i: number) => {
        const done = isAnswered(qq);
        const isMarked = marked.has(qq.itemId);
        const state = `${done ? 'đã làm' : 'chưa làm'}${isMarked ? ', đánh dấu xem lại' : ''}`;
        return (
          <button
            key={qq.itemId}
            type="button"
            role="listitem"
            onClick={() => goTo(i)}
            aria-label={`Câu ${i + 1}: ${state}`}
            aria-current={current === i ? 'true' : undefined}
            className={`ex-nav-btn${done ? ' is-done' : ''}${isMarked ? ' is-marked' : ''}${current === i ? ' is-current' : ''}`}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="page-container ex">
      {/* ===== Thanh trên cùng: tên đề, tiến độ, đồng hồ, nộp bài ===== */}
      <header className="ex-bar">
        <div className="ex-bar-info">
          <strong className="ex-bar-title">{exam.title}</strong>
          <span className="ex-bar-sub">
            {doneCount}/{total} câu đã làm · {exam.totalScore} điểm
          </span>
          <div className="ex-progress" aria-hidden="true">
            <span style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className={`ex-timer ${timerCls}`} role="timer" aria-label={`Thời gian còn lại ${formatTime(timeLeft)}`}>
          <span className="ex-timer-num">{formatTime(timeLeft)}</span>
          <span className="ex-timer-cap">
            {timeLeft < 60 ? 'Sắp hết giờ' : timeLeft < 300 ? 'Còn dưới 5 phút' : 'Còn lại'}
          </span>
        </div>
        <button type="button" className="btn sh-btn-accent ex-submit-top" onClick={() => setConfirmOpen(true)} disabled={submitting}>
          Nộp bài
        </button>
      </header>

      {warnMsg && (
        <div className="ex-alert is-warn" role="alert">
          <span>{warnMsg}</span>
          <button type="button" className="ex-alert-x" aria-label="Đóng cảnh báo" onClick={() => setWarnMsg('')}>
            ×
          </button>
        </div>
      )}
      {submitError && (
        <div className="ex-alert is-danger" role="alert">
          <span>{submitError}</span>
          <button type="button" className="ex-alert-x" aria-label="Đóng thông báo lỗi" onClick={() => setSubmitError('')}>
            ×
          </button>
        </div>
      )}
      {exam.resume && (
        <div className="ex-alert is-ok">
          <span>
            <strong>Đã khôi phục bài làm dở.</strong> Đáp án và thời gian đã làm được giữ nguyên, bài được tự lưu mỗi 15 giây.
          </span>
        </div>
      )}
      {exam.practiceMode && (
        <div className="ex-alert">
          <span>
            <strong>Chế độ luyện tập:</strong> câu trắc nghiệm chọn xong là biết đúng/sai và xem lời giải ngay; câu Đúng/Sai, trả lời ngắn được chấm khi nộp bài. Không tính điểm.
          </span>
        </div>
      )}
      {!exam.practiceMode && exam.answersAtEnd === false && (
        <div className="ex-alert">
          <span>
            <strong>Xem đáp án từng câu:</strong> câu trắc nghiệm biết đúng/sai ngay khi chọn; câu Đúng/Sai, trả lời ngắn được chấm khi nộp bài.
          </span>
        </div>
      )}

      <div className="ex-layout">
        {/* ===== Câu hỏi ===== */}
        <div className="ex-questions">
          {exam.questions.map((q: any, idx: number) => {
            const ck = checks[q.itemId];
            return (
              <section
                key={q.itemId}
                id={`q-${q.itemId}`}
                className={`ex-q${marked.has(q.itemId) ? ' is-marked' : ''}`}
                aria-labelledby={`q-h-${q.itemId}`}
                onFocusCapture={() => setCurrent(idx)}
              >
                <div className="ex-q-head">
                  <h2 id={`q-h-${q.itemId}`} className="ex-q-num">
                    Câu {idx + 1}
                  </h2>
                  <span className="chip">{PART_LABEL[q.part] || 'Phần'}</span>
                  <span className="ex-q-score">{q.score} điểm</span>
                  <button
                    type="button"
                    className={`ex-flag${marked.has(q.itemId) ? ' is-on' : ''}`}
                    aria-pressed={marked.has(q.itemId)}
                    onClick={() => toggleMark(q.itemId)}
                  >
                    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 21V4h11l-1.5 4L16 12H5" />
                    </svg>
                    {marked.has(q.itemId) ? 'Đã đánh dấu' : 'Xem lại sau'}
                  </button>
                </div>

                <div className="ex-q-content">
                  <LatexRenderer content={q.content} />
                </div>

                {q.type === 'MCQ' && q.options && (
                  <div className="ex-opts" role="radiogroup" aria-labelledby={`q-h-${q.itemId}`}>
                    {q.options.map((opt: any) => {
                      const sel = answers[q.itemId] === opt.id;
                      const right = ck && ck.answer === opt.id;
                      const wrong = ck && sel && !ck.correct;
                      return (
                        <label
                          key={opt.id}
                          className={`ex-opt${sel ? ' is-sel' : ''}${right ? ' is-right' : ''}${wrong ? ' is-wrong' : ''}`}
                        >
                          <input
                            type="radio"
                            className="sr-only"
                            name={`q-${q.itemId}`}
                            checked={sel}
                            onChange={() => setAnswer(q.itemId, opt.id)}
                          />
                          <span className="ex-opt-key" aria-hidden="true">
                            {opt.id}
                          </span>
                          <span className="ex-opt-text">
                            <span className="sr-only">{opt.id}. </span>
                            <LatexRenderer content={opt.text} />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {q.type === 'MULTI_ANSWER' && q.options && (
                  <div className="ex-opts">
                    <p className="ex-hint">Chọn tất cả các đáp án đúng (có thể chọn nhiều)</p>
                    {q.options.map((opt: any) => {
                      const selected = Array.isArray(answers[q.itemId])
                        ? answers[q.itemId].includes(opt.id)
                        : answers[q.itemId] === opt.id;
                      return (
                        <label key={opt.id} className={`ex-opt is-multi${selected ? ' is-sel' : ''}`}>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={selected}
                            onChange={() => toggleMulti(q.itemId, opt.id)}
                          />
                          <span className="ex-opt-key" aria-hidden="true">
                            {opt.id}
                          </span>
                          <span className="ex-opt-text">
                            <span className="sr-only">{opt.id}. </span>
                            <LatexRenderer content={opt.text} />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {q.type === 'TRUE_FALSE' && q.options && (
                  <div className="ex-tf">
                    {q.options.map((opt: any) => {
                      const cur = answers[q.itemId] || {};
                      const val: boolean | undefined = cur[opt.id];
                      return (
                        <div key={opt.id} className="ex-tf-row" role="group" aria-label={`Mệnh đề ${opt.id}`}>
                          <div className="ex-tf-text">
                            <strong>{opt.id})</strong> <LatexRenderer content={opt.text} />
                          </div>
                          <div className="ex-tf-btns">
                            <button
                              type="button"
                              className={`ex-tf-btn is-true${val === true ? ' is-on' : ''}`}
                              aria-pressed={val === true}
                              onClick={() => setTrueFalse(q.itemId, opt.id, true)}
                            >
                              Đúng
                            </button>
                            <button
                              type="button"
                              className={`ex-tf-btn is-false${val === false ? ' is-on' : ''}`}
                              aria-pressed={val === false}
                              onClick={() => setTrueFalse(q.itemId, opt.id, false)}
                            >
                              Sai
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <p className="ex-hint">
                      Chấm bậc thang: đúng 4/4 ý = trọn điểm, 3/4 = 50%, 2/4 = 25%, 1/4 = 10%
                    </p>
                  </div>
                )}

                {q.type === 'SHORT_ANSWER' && (
                  <div className="st-field">
                    <label htmlFor={`sa-${q.itemId}`} className="sr-only">
                      Đáp án câu {idx + 1}
                    </label>
                    <input
                      id={`sa-${q.itemId}`}
                      className="ex-input"
                      value={answers[q.itemId] || ''}
                      onChange={(e) => setAnswer(q.itemId, e.target.value)}
                      placeholder="Nhập đáp án…"
                      inputMode="decimal"
                      autoComplete="off"
                    />
                  </div>
                )}

                {q.type === 'ESSAY' && (
                  <div className="ex-essay">
                    <label htmlFor={`es-${q.itemId}`} className="sr-only">
                      Bài làm câu {idx + 1}
                    </label>
                    <textarea
                      id={`es-${q.itemId}`}
                      className="ex-input"
                      value={essayTexts[q.itemId] || ''}
                      onChange={(e) => setEssayTexts((prev) => ({ ...prev, [q.itemId]: e.target.value }))}
                      rows={6}
                      placeholder="Viết bài làm (hoặc chụp ảnh bài làm và tải lên bên dưới)…"
                    />
                    <ImageUploader
                      images={essayFiles[q.itemId] || []}
                      onChange={(next) => setEssayFiles((prev) => ({ ...prev, [q.itemId]: next }))}
                      disabled={uploadingItem === q.itemId || submitting}
                    />
                  </div>
                )}

                {ck && (
                  <div className={`ex-check ${ck.correct ? 'is-right' : 'is-wrong'}`} role="status">
                    <strong>{ck.correct ? 'Chính xác!' : 'Chưa đúng'}</strong>
                    <span className="mono"> · Đáp án: {formatAnswer(ck.answer)}</span>
                    {ck.solution && (
                      <div className="ex-check-sol">
                        <LatexRenderer content={ck.solution} />
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}

          <div className="ex-end">
            <p className="sh-muted">
              Em đã làm {doneCount}/{total} câu{marked.size ? ` · ${marked.size} câu đánh dấu xem lại` : ''}.
            </p>
            <button type="button" className="sh-cta" onClick={() => setConfirmOpen(true)} disabled={submitting}>
              {submitting ? 'Đang nộp bài…' : 'Nộp bài'}
            </button>
          </div>
        </div>

        {/* ===== Bảng điều hướng: cột phải trên máy tính, ngăn kéo dưới trên điện thoại ===== */}
        <aside className={`ex-nav${navOpen ? ' is-open' : ''}`} aria-label="Danh sách câu hỏi">
          <div className="ex-nav-head">
            <strong>Danh sách câu</strong>
            <span className="sh-muted sh-small">
              {doneCount}/{total} đã làm · {marked.size} đánh dấu
            </span>
          </div>
          {navGrid}
          <ul className="ex-legend" aria-hidden="true">
            <li><span className="ex-nav-btn is-done" />Đã làm</li>
            <li><span className="ex-nav-btn is-marked" />Xem lại</li>
            <li><span className="ex-nav-btn" />Chưa làm</li>
          </ul>
        </aside>
      </div>

      {/* Thanh dưới cho điện thoại */}
      <div className="ex-mobilebar">
        <button type="button" className="btn btn-outline" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>
          Câu {current + 1}/{total}
        </button>
        <button type="button" className="btn sh-btn-accent" onClick={() => setConfirmOpen(true)} disabled={submitting}>
          Nộp bài
        </button>
      </div>

      {/* ===== Hộp xác nhận nộp bài ===== */}
      {confirmOpen && (
        <div className="ex-modal-backdrop" onClick={() => !submitting && setConfirmOpen(false)}>
          <div
            className="ex-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ex-confirm-h"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !submitting) setConfirmOpen(false);
            }}
          >
            <h2 id="ex-confirm-h">Nộp bài ngay?</h2>
            {unanswered.length > 0 ? (
              <p>
                Em còn <strong>{unanswered.length} câu chưa làm</strong>:{' '}
                {unanswered.slice(0, 12).map((x: any, k: number) => (
                  <span key={x.n}>
                    {k > 0 && ', '}
                    <button
                      type="button"
                      className="ex-link"
                      onClick={() => {
                        setConfirmOpen(false);
                        goTo(x.n - 1);
                      }}
                    >
                      {x.n}
                    </button>
                  </span>
                ))}
                {unanswered.length > 12 ? '…' : ''}
              </p>
            ) : (
              <p>Em đã làm đủ {total} câu.</p>
            )}
            {marked.size > 0 && <p className="sh-muted">{marked.size} câu đang được đánh dấu xem lại.</p>}
            <p className="sh-muted">Sau khi nộp, em không sửa được bài nữa.</p>
            <div className="st-actions">
              <button type="button" className="btn btn-outline" autoFocus disabled={submitting} onClick={() => setConfirmOpen(false)}>
                Làm tiếp
              </button>
              <button
                type="button"
                className="btn sh-btn-accent"
                disabled={submitting}
                onClick={async () => {
                  await doSubmit();
                  setConfirmOpen(false);
                }}
              >
                {submitting ? (uploadingItem ? 'Đang tải ảnh…' : 'Đang nộp…') : 'Nộp bài'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
