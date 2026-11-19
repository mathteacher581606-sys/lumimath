'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import LatexRenderer from '@/components/LatexRenderer';
import BackButton from '@/components/BackButton';
import DeadlineBadge from '@/components/DeadlineBadge';
import LessonComments from '@/components/LessonComments';
import ImageUploader, { UpImage } from '@/components/ImageUploader';

function getYoutubeEmbed(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /youtu\.be\/([^/?&]+)/,
    /youtube\.com\/watch\?.*v=([^&]+)/,
    /youtube\.com\/embed\/([^/?&]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) {
      // youtube-nocookie: không lưu cookie theo dõi; modestbranding: ẨN logo YouTube;
      // rel=0: không gợi ý video liên quan; iv_load_policy=3: ẩn chú thích;
      // disablekb=1: tắt phím tắt bàn phím; playsinline: phát tại chỗ trên mobile
      return `https://www.youtube-nocookie.com/embed/${m[1]}?modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&playsinline=1`;
    }
  }
  return null;
}

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params.id as string;
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [openLesson, setOpenLesson] = useState<string | null>(null);

  // Bài tập tự luận
  const [exercisesByLesson, setExercisesByLesson] = useState<Record<string, any[]>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submittingEx, setSubmittingEx] = useState<string | null>(null);
  const [exError, setExError] = useState<string | null>(null);

  useEffect(() => {
    loadCourse();
    loadProgress();
    loadAssignmentInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Thông tin bài tập của khóa: tổng số bài giao + số bài CHƯA NỘP (hiện badge trên nút lớn)
  const [asgInfo, setAsgInfo] = useState<{ total: number; pending: number } | null>(null);

  async function loadAssignmentInfo() {
    try {
      const data = await apiFetch(`/courses/${courseId}/assignments`);
      const list: any[] = Array.isArray(data?.assignments) ? data.assignments : [];
      const pending = list.filter((a) => !a.mySubmission).length;
      setAsgInfo({ total: list.length, pending });
    } catch {
      setAsgInfo(null);
    }
  }

  // Tiến độ học tập
  const [progress, setProgress] = useState<any>(null);
  const [certLoading, setCertLoading] = useState(false);

  async function downloadCertificate() {
    setCertLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/courses/${courseId}/certificate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || 'Chưa thể tạo chứng chỉ').slice(-300));
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chung-chi-${course?.title || 'khoa-hoc'}.pdf`;
      a.click();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCertLoading(false);
    }
  }
  const [markingId, setMarkingId] = useState<string | null>(null);

  async function loadProgress() {
    try {
      const data = await apiFetch(`/courses/${courseId}/progress`);
      setProgress(data);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function toggleComplete(lessonId: string, completed: boolean) {
    setMarkingId(lessonId);
    try {
      const data = await apiFetch(
        `/courses/${courseId}/lessons/${lessonId}/complete`,
        { method: 'POST', body: JSON.stringify({ completed }) },
      );
      setProgress({ ...data, completedLessonIds: completed ? [...(progress?.completedLessonIds || []).filter((id: string) => id !== lessonId), lessonId] : (progress?.completedLessonIds || []).filter((id: string) => id !== lessonId) });
    } catch (e: any) {
      console.error(e);
    } finally {
      setMarkingId(null);
    }
  }

  function isDone(lessonId: string): boolean {
    return !!progress?.completedLessonIds?.includes(lessonId);
  }

  function showExToast(msg: string) {
    setExError(msg);
    setTimeout(() => setExError(null), 4000);
  }

  // Đánh giá khóa học
  const [reviews, setReviews] = useState<any>(null);
  const [myRating, setMyRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    apiFetch(`/courses/${courseId}/reviews`)
      .then((data) => {
        setReviews(data);
        setMyRating(data.myRating ?? 0);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function submitReview() {
    if (!myRating) return;
    setSavingReview(true);
    try {
      await apiFetch(`/courses/${courseId}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating: myRating, comment: reviewComment }),
      });
      const data = await apiFetch(`/courses/${courseId}/reviews`);
      setReviews(data);
      setMyRating(data.myRating ?? myRating);
      showExToast('Cảm ơn bạn đã đánh giá!');
    } catch (e: any) {
      showExToast(e.message);
    } finally {
      setSavingReview(false);
    }
  }

  async function loadCourse() {
    setLoading(true);
    try {
      const data = await apiFetch(`/courses/${courseId}`);
      setCourse(data);
      // Tự mở bài giảng đầu tiên KHẢ DỤNG (không bị khóa)
      const first =
        data.lessons?.find((l: any) => !l.locked) || data.lessons?.[0];
      if (first) {
        setOpenLesson(first.id);
        loadExercises(first.id);
        loadQuiz(first.id);
        loadNote(first.id);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadExercises(lessonId: string) {
    try {
      const data = await apiFetch(`/courses/${courseId}/lessons/${lessonId}/exercises`);
      setExercisesByLesson((prev) => ({ ...prev, [lessonId]: data }));
    } catch (e: any) {
      console.error(e);
    }
  }

  // ===== Ghi chú cá nhân trong bài giảng =====
  const [note, setNote] = useState('');
  const [noteLoaded, setNoteLoaded] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);

  async function loadNote(lessonId: string) {
    try {
      const data = await apiFetch(`/courses/${courseId}/lessons/${lessonId}/note`);
      setNote(data?.content || '');
      setNoteLoaded(lessonId);
    } catch {
      setNote('');
      setNoteLoaded(lessonId);
    }
  }

  async function saveNote(lessonId: string) {
    setNoteSaving(true);
    try {
      await apiFetch(`/courses/${courseId}/lessons/${lessonId}/note`, {
        method: 'PUT',
        body: JSON.stringify({ content: note }),
      });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setNoteSaving(false);
    }
  }
  const [noteSaved, setNoteSaved] = useState(false);
  const [helpDraft, setHelpDraft] = useState('');

  // Bài tiếp theo: đánh dấu hoàn thành bài hiện tại rồi mở bài sau
  async function goNextLesson(lesson: any, i: number) {
    if (!isDone(lesson.id)) {
      await toggleComplete(lesson.id, true);
    }
    const next = course.lessons[i + 1];
    if (next) toggleLesson(next.id);
  }

  function toggleLesson(lessonId: string) {
    const opening = openLesson !== lessonId;
    setOpenLesson(opening ? lessonId : null);
    if (opening) {
      loadExercises(lessonId);
      loadQuiz(lessonId);
      loadNote(lessonId);
    }
  }

  // ===== Quiz củng cố trong bài giảng =====
  const [quizData, setQuizData] = useState<any>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<any>(null);
  const [quizBusy, setQuizBusy] = useState(false);

  async function loadQuiz(lessonId: string) {
    setQuizData(null);
    setQuizResult(null);
    setQuizAnswers({});
    try {
      const data = await apiFetch(`/courses/${courseId}/lessons/${lessonId}/quiz`);
      setQuizData(data);
    } catch {
      /* bài không có quiz */
    }
  }

  function startQuiz() {
    setQuizResult(null);
    setQuizAnswers({});
  }

  async function submitQuiz(lessonId: string) {
    if (!quizData) return;
    const unanswered = quizData.questions.filter(
      (q: any) => !quizAnswers[q.id],
    ).length;
    if (unanswered) {
      if (!confirm(`Còn ${unanswered} câu chưa trả lời. Nộp luôn?`)) return;
    }
    setQuizBusy(true);
    try {
      const data = await apiFetch(
        `/courses/${courseId}/lessons/${lessonId}/quiz/submit`,
        { method: 'POST', body: JSON.stringify({ answers: quizAnswers }) },
      );
      setQuizResult(data);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setQuizBusy(false);
    }
  }

  // Ảnh bài làm theo từng bài tập (giữ file + xem trước, nộp mới tải lên)
  const [exFiles, setExFiles] = useState<Record<string, UpImage[]>>({});
  const [uploadingEx, setUploadingEx] = useState<string | null>(null);
  const [pdfUrlByExercise, setPdfUrlByExercise] = useState<Record<string, string>>({});
  const [uploadingPdfEx, setUploadingPdfEx] = useState<string | null>(null);

  async function onPickPdf(exerciseId: string, file: File | null) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setExError('PDF quá lớn — tối đa 10MB');
      return;
    }
    setExError(null);
    setUploadingPdfEx(exerciseId);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/uploads/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${token}` },
        body: file,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Không tải được PDF' }));
        throw new Error(err.message || 'Không tải được PDF');
      }
      const data = await res.json();
      setPdfUrlByExercise((prev) => ({ ...prev, [exerciseId]: data.url }));
      if (data.compressed) {
        setExError(
          `📄 Đã nén PDF: ${Math.round(data.originalSize / 1024)}KB → ${Math.round(data.savedSize / 1024)}KB`,
        );
      } else {
        setExError('📄 Đã đính kèm PDF bài làm');
      }
    } catch (e: any) {
      setExError(e.message);
    } finally {
      setUploadingPdfEx(null);
    }
  }

  async function submitExercise(exerciseId: string, lessonId: string) {
    const content = answers[exerciseId] || '';
    const files = exFiles[exerciseId] || [];
    const pdfUrl = pdfUrlByExercise[exerciseId] || '';
    if (!content.trim() && files.length === 0 && !pdfUrl) {
      setExError('Vui lòng viết bài làm, tải ảnh hoặc tải PDF trước khi nộp');
      return;
    }
    setExError(null);
    setSubmittingEx(exerciseId);
    try {
      // Tải từng ảnh lên (giữ đúng thứ tự đã sắp xếp)
      const images: string[] = [];
      for (const f of files) {
        setUploadingEx(exerciseId);
        const token = localStorage.getItem('token');
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

      const data = await apiFetch(`/exercises/${exerciseId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ content, images, pdfUrl: pdfUrl || null }),
      });
      // Hiển thị kết quả: cập nhật danh sách bài tập
      const list = (exercisesByLesson[lessonId] || []).map((ex) =>
        ex.id === exerciseId
          ? { ...ex, submissions: [data.submission, ...(ex.submissions || [])] }
          : ex,
      );
      setExercisesByLesson((prev) => ({ ...prev, [lessonId]: list }));
      setExFiles((prev) => ({ ...prev, [exerciseId]: [] }));
      setPdfUrlByExercise((prev) => ({ ...prev, [exerciseId]: '' }));
    } catch (e: any) {
      setExError(e.message);
    } finally {
      setUploadingEx(null);
      setSubmittingEx(null);
    }
  }

  // Tải đáp án PDF (chỉ được sau khi đã nộp bài thi)
  async function downloadAnswersPdf(examId: string) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/exams/${examId}/answers-pdf`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
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

  if (loading) return <div className="page-container">Đang tải…</div>;
  if (!course) return <div className="page-container">Không tìm thấy khóa học.</div>;

  return (
    <div className="page-container" style={{ maxWidth: 1600 }}>
      {/* Header khóa học — phong cách đỏ đô */}
      <div className="lm-band">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>
            <BackButton to="/student" label="Về khóa học của tôi" />
            📚 {course.title}
          </h2>
          {course.description && <p className="lm-band-sub">{course.description}</p>}
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }}>
              {course.teacher?.fullName || 'Giáo viên'}
            </span>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }}>
              {course.lessons?.length || 0} bài giảng
            </span>
            {course.sequential && (
              <span className="badge" style={{ background: 'rgba(240,179,85,0.3)', color: '#fff' }}>🔒 Học tuần tự</span>
            )}
          </div>
        </div>
      </div>

      {/* Banner khóa học (bannerUrl) — fallback ảnh đại diện/gradient */}
      <div
        style={{
          borderRadius: 18,
          overflow: 'hidden',
          position: 'relative',
          height: 180,
          marginTop: 16,
          background: course.bannerUrl || course.coverUrl
            ? '#000'
            : 'linear-gradient(120deg, #7b1113 0%, #be123c 40%, #d97706 85%, #f59e0b 100%)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        }}
      >
        {(course.bannerUrl || course.coverUrl) && (
          <img
            src={course.bannerUrl || course.coverUrl}
            alt={course.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent 55%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: 14,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 15, textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
            {course.coverUrl ? '📚 ' : ''}{course.title}
          </span>
          <span className="badge" style={{ background: 'rgba(255,255,255,0.24)', color: '#fff' }}>
            👨‍🏫 {course.teacher?.fullName || 'Giáo viên'}
          </span>
          <span className="badge" style={{ background: 'rgba(255,255,255,0.24)', color: '#fff' }}>
            📖 {course.lessons?.length || 0} bài giảng
          </span>
        </div>
      </div>

      {/* ===== THANH HÀNH ĐỘNG LỚN: Bài tập (nổi bật) + Bảng tin ===== */}
      <div className="lm-course-actions">
        <Link
          href={`/student/courses/${courseId}/assignments`}
          className="lm-cta-assignments"
          title="Vào làm bài tập của khóa học"
        >
          <span className="lm-cta-icon">📚</span>
          <span className="lm-cta-text">
            <b>BÀI TẬP</b>
            <small>
              {asgInfo
                ? asgInfo.pending > 0
                  ? `${asgInfo.pending} bài chưa nộp · ${asgInfo.total} bài được giao`
                  : `${asgInfo.total} bài được giao · đã nộp đủ`
                : 'Xem và làm bài tập của khóa học'}
            </small>
          </span>
          {asgInfo && asgInfo.pending > 0 && (
            <span className="lm-cta-badge">{asgInfo.pending}</span>
          )}
          <span className="lm-cta-arrow">→</span>
        </Link>
        <Link
          href={`/student/courses/${courseId}/announcements`}
          className="lm-cta-news"
          title="Xem bảng tin của lớp"
        >
          📣 Bảng tin
        </Link>
      </div>

      {course.enrolled === false && (
        <div
          className="card"
          style={{
            marginTop: 20,
            padding: 14,
            borderLeft: '4px solid var(--lm-amber)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 13.5 }}>
            🔒 Bạn đang ở chế độ <b>xem thử</b> — chỉ xem được các bài đánh dấu "👁️ Xem thử miễn phí".
          </div>
          <Link
            href="/student/courses"
            className="btn-lm amber"
            style={{ textDecoration: 'none', width: 'auto', padding: '8px 16px', fontSize: 13 }}
          >
            Đăng ký để học toàn bộ →
          </Link>
        </div>
      )}

      {/* Thanh tiến độ học tập */}
      {progress && course.lessons && course.lessons.length > 0 && (
        <div className="card" style={{ marginTop: 20, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
            <strong>Tiến độ học tập</strong>
            <span className="mono">
              {progress.done}/{progress.total} bài · {Math.round(progress.progress * 100)}%
            </span>
          </div>
          <div
            style={{
              height: 10,
              background: 'color-mix(in oklch, var(--color-rule) 60%, var(--color-paper))',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.round(progress.progress * 100)}%`,
                height: '100%',
                background: 'var(--color-success)',
                borderRadius: 999,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          {progress.progress >= 1 && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 13, color: 'var(--color-success)', margin: 0 }}>
                🎉 Chúc mừng! Bạn đã hoàn thành khóa học!
              </p>
              <button
                className="btn btn-outline"
                style={{ width: 'auto', padding: '6px 14px', fontSize: 12.5, fontWeight: 700 }}
                disabled={certLoading}
                onClick={downloadCertificate}
              >
                {certLoading ? '⏳ Đang tạo…' : '🎓 Tải chứng chỉ (PDF)'}
              </button>
            </div>
          )}
        </div>
      )}

      {!course.lessons || course.lessons.length === 0 ? (
        <p style={{ color: 'var(--color-muted)' }}>Chưa có bài giảng nào.</p>
      ) : (
        <div className="lm-course-layout">
          {/* ===== SIDEBAR GIÁO TRÌNH CỐ ĐỊNH (kiểu Udemy) ===== */}
          <aside className="lm-course-sidebar">
            <div style={{ fontWeight: 800, color: 'var(--lm-maroon)', fontSize: 13.5, padding: '4px 10px 8px' }}>
              📖 Nội dung khóa học
            </div>
            {course.lessons.map((l: any, idx: number) => {
              const prevL = idx > 0 ? course.lessons[idx - 1] : null;
              const chapterRow =
                (l.chapter || '') !== (prevL?.chapter || '')
                  ? l.chapter || 'Chung'
                  : null;
              const doneL = isDone(l.id);
              const isCur = openLesson === l.id;
              const lockedL =
                !!l.locked ||
                (!!course.sequential && idx > 0 && !isDone(prevL.id));
              return (
                <div key={l.id}>
                  {chapterRow && (
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--color-warning)', padding: '8px 10px 4px' }}>
                      📚 {chapterRow}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`lm-side-lesson${isCur ? ' current' : ''}${doneL ? ' done' : ''}`}
                    onClick={() => {
                      if (!lockedL) toggleLesson(l.id);
                    }}
                  >
                    <span
                      className="tick"
                      style={{
                        color: doneL
                          ? 'var(--color-success)'
                          : lockedL
                            ? 'var(--color-muted)'
                            : 'var(--lm-amber)',
                      }}
                    >
                      {lockedL ? '🔒' : doneL ? '✓' : '›'}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {idx + 1}. {l.title}
                    </span>
                  </button>
                </div>
              );
            })}
          </aside>

          {/* ===== NỘI DUNG BÀI ĐANG HỌC ===== */}
          <div style={{ minWidth: 0 }}>
            {course.lessons.map((lesson: any, i: number) => {
            const embed = getYoutubeEmbed(lesson.youtubeUrl);
            const isOpen = openLesson === lesson.id;
            const exercises = exercisesByLesson[lesson.id] || [];
            const prev: any = i > 0 ? course.lessons[i - 1] : null;
            // Học tuần tự: bài sau khóa đến khi hoàn thành bài trước
            const locked =
              !!lesson.locked ||
              (!!course.sequential && i > 0 && !isDone(prev.id));
            const chapterChanged =
              lesson.chapter && lesson.chapter !== (prev?.chapter || null);
            return (
              <div key={lesson.id}>
                {chapterChanged && (
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: 'var(--color-accent)',
                      padding: '6px 4px',
                      borderBottom: '2px solid var(--color-accent)',
                      marginBottom: 10,
                    }}
                  >
                    📚 {lesson.chapter}
                  </div>
                )}
              <div
                className="card"
                style={{ padding: 18, opacity: locked ? 0.6 : 1, display: isOpen ? 'block' : 'none' }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: locked ? 'not-allowed' : 'pointer',
                    gap: 10,
                  }}
                  onClick={() => {
                    if (!locked) toggleLesson(lesson.id);
                  }}
                >
                  <h4 style={{ fontSize: 15, flex: 1, minWidth: 0 }}>
                    {locked ? '🔒 ' : isDone(lesson.id) ? '✅ ' : '📘 '}Bài {i + 1}: {lesson.title}
                    {locked && (
                      <span style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 500 }}>
                        {' '}— hoàn thành "Bài {i}" để mở
                      </span>
                    )}
                  </h4>
                  <span style={{ color: 'var(--color-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                </div>
                {!locked && (
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className={isDone(lesson.id) ? 'btn' : 'btn btn-outline'}
                    style={{ width: 'auto', padding: '6px 14px', fontSize: 12 }}
                    disabled={markingId === lesson.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleComplete(lesson.id, !isDone(lesson.id));
                    }}
                  >
                    {markingId === lesson.id
                      ? 'Đang lưu…'
                      : isDone(lesson.id)
                        ? '✓ Đã học xong'
                        : 'Đánh dấu đã học'}
                  </button>
                </div>
                )}

                {isOpen && (
                  <div style={{ marginTop: 12 }}>
                    {(() => {
                      const vids =
                        Array.isArray(lesson.videos) && lesson.videos.length
                          ? lesson.videos.filter((v: any) => v?.url)
                          : embed
                            ? [{ title: lesson.title, url: lesson.youtubeUrl }]
                            : [];
                      if (!vids.length) return null;
                      return (
                        <div style={{ marginBottom: 12 }}>
                          {vids.map((v: any, vi: number) => {
                            const emb = getYoutubeEmbed(v.url);
                            return (
                              <div key={vi} style={{ marginBottom: 12 }}>
                                {v.title && (
                                  <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6, color: 'var(--lm-maroon)' }}>
                                    🎬 {v.title}
                                  </div>
                                )}
                                {emb ? (
                                  <div
                                    style={{
                                      position: 'relative',
                                      aspectRatio: '16 / 9',
                                      width: '100%',
                                      background: '#000',
                                      borderRadius: 12,
                                      overflow: 'hidden',
                                      boxShadow: '0 6px 22px rgba(0,0,0,0.18)',
                                    }}
                                  >
                                    <iframe
                                      width="100%"
                                      height="100%"
                                      src={emb}
                                      title={v.title || lesson.title}
                                      allowFullScreen
                                      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                                      sandbox="allow-scripts allow-same-origin allow-presentation allow-autoplay"
                                      style={{ border: 'none', position: 'absolute', inset: 0 }}
                                    />
                                    <div
                                      aria-hidden
                                      onContextMenu={(e) => e.preventDefault()}
                                      style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        height: 56,
                                        background: 'transparent',
                                        zIndex: 5,
                                        cursor: 'default',
                                      }}
                                    />
                                  </div>
                                ) : (
                                  <video controls src={v.url} style={{ width: '100%', borderRadius: 12 }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {lesson.content && (
                      <div style={{ marginBottom: 12, lineHeight: 1.7 }}>
                        <LatexRenderer content={lesson.content} />
                      </div>
                    )}
                    {(() => {
                      const mats =
                        Array.isArray(lesson.materials) && lesson.materials.length
                          ? lesson.materials.filter((m: any) => m?.url)
                          : [];
                      const legacy = (lesson.pdfLinks || []).map(
                        (l: string, j: number) => ({ title: `Tài liệu ${j + 1}`, url: l }),
                      );
                      const all = [
                        ...mats,
                        ...legacy.filter(
                          (x: any) => !mats.some((m: any) => m.url === x.url),
                        ),
                      ];
                      if (!all.length) return null;
                      return (
                        <div style={{ marginBottom: 12 }}>
                          <strong style={{ fontSize: 13 }}>📎 Tài liệu bài giảng:</strong>
                          <ul style={{ marginTop: 8, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {all.map((m: any, j: number) => (
                              <li key={j}>
                                <a
                                  href={m.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: 'var(--color-accent)', fontWeight: 700 }}
                                >
                                  📄 {m.title || `Tài liệu ${j + 1}`}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}

                    {/* ===== QUIZ CỦNG CỐ TRONG BÀI GIẢNG ===== */}
                    {quizData && (
                      <div
                        style={{
                          marginBottom: 12,
                          border: '1.5px solid var(--lm-amber)',
                          borderRadius: 10,
                          padding: 14,
                          background: 'var(--color-paper-2)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span className="badge badge-warning" style={{ fontWeight: 800 }}>🧩 Quiz củng cố</span>
                          <span style={{ fontSize: 13 }}>{quizData.questionCount} câu trắc nghiệm · trộn ngẫu nhiên</span>
                          <span style={{ fontSize: 13 }}>· Đạt ≥ {quizData.passingPercent}%</span>
                          {quizData.negativeMarking && (
                            <span className="badge" style={{ background: 'var(--color-danger-wash)', color: '#b91c1c' }}>
                              🔴 Trừ {quizData.negativeWeight} điểm/câu sai
                            </span>
                          )}
                          {quizData.bestScore != null && (
                            <span className="badge badge-success">Điểm cao nhất: {quizData.bestScore}%</span>
                          )}
                          {quizData.maxAttempts > 0 ? (
                            <span className="badge" style={{ background: '#eef2ff', color: '#3730a3' }}>
                              🔁 Còn {quizData.remaining} / {quizData.maxAttempts} lượt
                            </span>
                          ) : (
                            <span className="badge" style={{ background: '#eef2ff', color: '#3730a3' }}>🔁 Không giới hạn lượt</span>
                          )}
                        </div>

                        {quizData.history?.length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-muted)' }}>
                            📜 Lịch sử làm: {quizData.history.map((h: any) => (
                              <span
                                key={h.createdAt}
                                className="mono"
                                style={{
                                  marginRight: 8,
                                  color: h.passed ? 'var(--color-success)' : 'var(--color-danger)',
                                }}
                              >
                                {h.score}%{h.passed ? ' ✓' : ' ✗'}
                              </span>
                            ))}
                          </div>
                        )}

                        {quizResult === null ? (
                          <div style={{ marginTop: 12 }}>
                            {quizAnswers && Object.keys(quizAnswers).length > 0 && !quizBusy ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {quizData.questions.map((q: any, qi: number) => (
                                  <div key={q.id} style={{ background: 'var(--color-surface)', borderRadius: 8, padding: 10, border: '1px solid #e8d5a8' }}>
                                    <div style={{ fontSize: 13.5, marginBottom: 6 }}>
                                      <b>Câu {qi + 1}.</b> <LatexRenderer content={q.content} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {(q.options || []).map((o: any) => (
                                        <label key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13.5 }}>
                                          <input
                                            type="radio"
                                            name={`quiz-${q.id}`}
                                            checked={quizAnswers[q.id] === o.id}
                                            onChange={() => setQuizAnswers((p) => ({ ...p, [q.id]: o.id }))}
                                            style={{ width: 'auto', marginTop: 4 }}
                                          />
                                          <span><b>{o.id}.</b> <LatexRenderer content={o.text} /></span>
                                        </label>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                                <button className="btn" disabled={quizBusy} onClick={() => submitQuiz(lesson.id)}>
                                  {quizBusy ? '⏳ Đang chấm…' : '📤 Nộp bài'}
                                </button>
                              </div>
                            ) : (
                              <button className="btn" style={{ marginTop: 10 }} onClick={startQuiz}>
                                ▶ Bắt đầu làm quiz
                              </button>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: quizResult.passed ? 'var(--color-success)' : 'var(--color-danger)' }}>
                              {quizResult.passed ? '🎉 ĐẠT!' : '😅 Chưa đạt'} — {quizResult.score}% ({quizResult.correct}/{quizResult.total} câu đúng)
                              {quizResult.penalty > 0 && (
                                <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>
                                  {' '}(đã trừ {quizResult.penalty} điểm do {quizResult.wrong} câu sai)
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                              {quizResult.results.map((r: any) => {
                                const q = quizData.questions.find((x: any) => x.id === r.id);
                                return (
                                  <div key={r.id} style={{ background: 'var(--color-surface)', borderRadius: 8, padding: 10, border: `1.5px solid ${r.correct ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
                                    <div style={{ fontSize: 13.5 }}>
                                      {r.correct ? '✅' : '❌'} <LatexRenderer content={q?.content || ''} />
                                    </div>
                                    <div style={{ fontSize: 12.5, marginTop: 4 }}>
                                      <span style={{ color: 'var(--color-success)' }}>Đáp án đúng: {r.answer}</span>
                                      {!r.correct && r.your ? <span style={{ color: 'var(--color-danger)' }}> · Bạn chọn: {r.your}</span> : null}
                                    </div>
                                    {r.solution && (
                                      <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--color-muted)' }}>
                                        💡 <LatexRenderer content={r.solution} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={startQuiz}>
                              🔄 Làm lại
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ===== BTVN: đề thi online gán vào bài giảng ===== */}
                    {lesson.exam && (
                      <div
                        style={{
                          padding: 14,
                          border: '1px solid color-mix(in oklch, var(--color-accent) 45%, transparent)',
                          borderRadius: 8,
                          background: 'color-mix(in oklch, var(--color-accent) 7%, var(--color-paper))',
                          marginBottom: 12,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <span className="badge badge-accent">BTVN</span>
                          <strong style={{ fontSize: 14 }}>{lesson.exam.title}</strong>
                        </div>
                        <div className="mono" style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
                          {lesson.exam.duration} phút · {lesson.exam.totalScore} điểm
                          {lesson.exam.difficulty ? ` · ${lesson.exam.difficulty}` : ''}
                        </div>
                        {lesson.deadline && (
                          <DeadlineBadge deadline={lesson.deadline} />
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Link
                            href={`/student/exams/${lesson.exam.id}/take`}
                            className="btn"
                            style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}
                          >
                            Làm bài tập về nhà
                          </Link>
                          <button
                            className="btn btn-outline"
                            style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}
                            onClick={() => downloadAnswersPdf(lesson.exam.id)}
                          >
                            Tải đáp án PDF
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ===== Bài tập tự luận (AI chấm) ===== */}
                    {exercises.length > 0 && (
                      <div
                        style={{
                          borderTop: '1px solid var(--color-rule)',
                          paddingTop: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                        }}
                      >
                        <strong style={{ fontSize: 14 }}>Bài tập tự luận</strong>
                        {exercises.map((ex: any) => {
                          const mySub = ex.submissions?.[0] || null;
                          return (
                            <div
                              key={ex.id}
                              style={{
                                padding: 12,
                                border: '1px solid var(--color-rule)',
                                borderRadius: 8,
                                background: 'var(--color-paper)',
                              }}
                            >
                              <div style={{ fontSize: 14, marginBottom: 6 }}>
                                <LatexRenderer content={ex.prompt} />
                              </div>
                              <div className="mono" style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 10 }}>
                                Thang điểm: {ex.maxScore} · Thầy cô chấm điểm
                              </div>

                              {mySub ? (
                                <div>
                                  <div
                                    style={{
                                      display: 'flex',
                                      gap: 8,
                                      alignItems: 'center',
                                      marginBottom: 6,
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    {mySub.teacherScore !== null && mySub.teacherScore !== undefined ? (
                                      <>
                                        <span className="badge badge-success">
                                          Điểm (đã chốt): {mySub.teacherScore}/{ex.maxScore}
                                        </span>
                                        <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                                          Đã được thầy cô chấm
                                        </span>
                                      </>
                                    ) : mySub.aiScore !== null && mySub.aiScore !== undefined ? (
                                      <>
                                        <span className="badge badge-accent">
                                          Điểm (sơ bộ): {mySub.aiScore}/{ex.maxScore}
                                        </span>
                                        <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                                          Đang chờ thầy cô chốt điểm
                                        </span>
                                      </>
                                    ) : (
                                      <span className="badge badge-warning">Đang chờ chấm</span>
                                    )}
                                  </div>
                                  {mySub.imageUrls?.length > 0 && (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                      {mySub.imageUrls.map((url: string, i: number) => (
                                        <img
                                          key={i}
                                          src={url}
                                          alt={`Ảnh ${i + 1}`}
                                          style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-rule)' }}
                                        />
                                      ))}
                                    </div>
                                  )}
                                  {mySub.annotatedUrls?.length > 0 && (
                                    <div style={{ marginBottom: 6 }}>
                                      <div style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600, marginBottom: 4 }}>
                                        📝 Thầy cô đã sửa bài của bạn:
                                      </div>
                                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {mySub.annotatedUrls.map((url: string, i: number) => (
                                          <a key={i} href={url} target="_blank" rel="noreferrer">
                                            <img
                                              src={url}
                                              alt={`Đã sửa ${i + 1}`}
                                              style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6, border: '2px solid var(--color-success)' }}
                                            />
                                          </a>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {(mySub.teacherNote || mySub.aiFeedback) && (
                                    <div
                                      style={{
                                        fontSize: 13,
                                        padding: 10,
                                        background: 'color-mix(in oklch, var(--color-success) 8%, var(--color-paper))',
                                        borderRadius: 6,
                                        whiteSpace: 'pre-wrap',
                                        lineHeight: 1.6,
                                      }}
                                    >
                                      <strong style={{ color: 'var(--color-success)' }}>
                                        📝 Thầy cô nhận xét
                                        {mySub.teacherScore === null || mySub.teacherScore === undefined ? ' (sơ bộ)' : ''}:
                                      </strong>
                                      <div style={{ marginTop: 4 }}>
                                        {mySub.teacherNote || mySub.aiFeedback}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <textarea
                                    value={answers[ex.id] || ''}
                                    onChange={(e) =>
                                      setAnswers((prev) => ({ ...prev, [ex.id]: e.target.value }))
                                    }
                                    rows={5}
                                    placeholder="Viết bài làm của bạn (thầy cô sẽ chấm điểm và góp ý)..."
                                    style={{
                                      width: '100%',
                                      padding: 10,
                                      border: '1px solid var(--color-rule)',
                                      borderRadius: 6,
                                      fontSize: 14,
                                      fontFamily: 'var(--font-body)',
                                      background: 'var(--color-paper)',
                                      color: 'var(--color-ink)',
                                    }}
                                  />

                                  {/* Ảnh bài làm: kéo thả + sắp xếp + xoay */}
                                  <div style={{ marginTop: 8 }}>
                                    <ImageUploader
                                      images={exFiles[ex.id] || []}
                                      onChange={(next) =>
                                        setExFiles((prev) => ({ ...prev, [ex.id]: next }))
                                      }
                                      disabled={uploadingEx === ex.id || submittingEx === ex.id}
                                    />
                                  </div>

                                  {/* Nộp bài dạng PDF (nén + giới hạn 10MB) */}
                                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <label
                                      className="btn btn-outline"
                                      style={{
                                        width: 'auto',
                                        padding: '6px 12px',
                                        fontSize: 12.5,
                                        cursor: 'pointer',
                                        margin: 0,
                                      }}
                                    >
                                      {uploadingPdfEx === ex.id ? '⏳ Đang tải PDF…' : '📄 Tải PDF bài làm'}
                                      <input
                                        type="file"
                                        accept="application/pdf"
                                        hidden
                                        onChange={(e) => onPickPdf(ex.id, e.target.files?.[0] || null)}
                                      />
                                    </label>
                                    {pdfUrlByExercise[ex.id] && (
                                      <a
                                        href={pdfUrlByExercise[ex.id]}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ fontSize: 12.5, color: 'var(--color-accent)' }}
                                      >
                                        ✅ Đã đính kèm (xem)
                                      </a>
                                    )}
                                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                                      (tối đa 10MB, tự nén)
                                    </span>
                                  </div>

                                  <button
                                    className="btn"
                                    style={{ width: 'auto', marginTop: 10 }}
                                    onClick={() => submitExercise(ex.id, lesson.id)}
                                    disabled={
                                      submittingEx === ex.id ||
                                      uploadingEx === ex.id ||
                                      uploadingPdfEx === ex.id
                                    }
                                  >
                                    {submittingEx === ex.id
                                      ? 'Đang nộp…'
                                      : uploadingEx === ex.id
                                        ? '⏳ Đang tải ảnh…'
                                        : 'Nộp bài'}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 📝 Ghi chú cá nhân */}
                    <div
                      style={{
                        marginBottom: 12,
                        border: '1px dashed #e0c48c',
                        borderRadius: 8,
                        padding: 10,
                        background: 'var(--color-paper-2)',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-warning)', marginBottom: 6 }}>
                        📝 Ghi chú của bạn (chỉ mình bạn thấy)
                      </div>
                      <textarea
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Ghi lại công thức cần nhớ, ý chưa hiểu…"
                        style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #e0c48c', fontSize: 13 }}
                      />
                      <button
                        className="btn btn-outline"
                        style={{ width: 'auto', padding: '4px 14px', fontSize: 12, marginTop: 6 }}
                        disabled={noteSaving}
                        onClick={() => saveNote(lesson.id)}
                      >
                        {noteSaving ? 'Đang lưu…' : noteSaved ? '✅ Đã lưu' : '💾 Lưu ghi chú'}
                      </button>
                    </div>

                    {/* Bài tiếp theo + hỏi thầy */}
                    <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-outline"
                        style={{ width: 'auto', padding: '8px 14px', fontSize: 12.5, fontWeight: 700 }}
                        onClick={() => {
                          setHelpDraft(`Em cần hỏi về bài "${lesson.title}": `);
                          setTimeout(() => {
                            document
                              .getElementById('thao-luan')
                              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 100);
                        }}
                      >
                        🆘 Cần hỏi thầy
                      </button>
                      {i < course.lessons.length - 1 && (
                        <button
                          className="btn"
                          style={{ width: 'auto', padding: '8px 18px', fontSize: 13.5, fontWeight: 700 }}
                          onClick={() => goNextLesson(lesson, i)}
                        >
                          Bài tiếp theo: {course.lessons[i + 1].title} →
                        </button>
                      )}
                    </div>

                    {/* Thảo luận bài giảng */}
                    <LessonComments
                      courseId={courseId as string}
                      lessonId={lesson.id}
                      prefill={helpDraft}
                    />
                  </div>
                )}
              </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* ===== Đánh giá khóa học ===== */}
      <div className="card" style={{ marginTop: 28, padding: 18 }}>
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>⭐ Đánh giá khóa học</h2>
        {reviews === null ? (
          <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Đang tải…</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 700 }}>
                {reviews.avg ?? '—'}
              </span>
              <div>
                <div style={{ color: 'var(--color-warning, #d97706)', fontSize: 16 }}>
                  {'★'.repeat(Math.round(reviews.avg ?? 0))}
                  {'☆'.repeat(5 - Math.round(reviews.avg ?? 0))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {reviews.count} lượt đánh giá
                </div>
              </div>
            </div>

            {/* Form đánh giá */}
            <div style={{ padding: 12, background: 'var(--color-paper-2)', borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>Đánh giá của bạn:</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMyRating(n)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: 26,
                      cursor: 'pointer',
                      color: n <= myRating ? 'var(--color-warning, #d97706)' : 'var(--color-rule)',
                    }}
                  >
                    ★
                  </button>
                ))}
              </div>
              <input
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Nhận xét về khóa học (tùy chọn)…"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-rule)', borderRadius: 8, fontSize: 13, marginBottom: 8, background: 'var(--color-paper)' }}
              />
              <button
                className="btn"
                style={{ width: 'auto', padding: '8px 16px', fontSize: 13 }}
                disabled={savingReview || !myRating}
                onClick={submitReview}
              >
                {savingReview ? 'Đang gửi…' : 'Gửi đánh giá'}
              </button>
            </div>

            {/* Danh sách đánh giá */}
            {reviews.reviews.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                Chưa có đánh giá nào.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reviews.reviews.slice(0, 10).map((r: any) => (
                  <div key={r.id} style={{ fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--color-rule)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{r.student.fullName}</strong>
                      <span style={{ color: 'var(--color-warning, #d97706)' }}>
                        {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                      </span>
                    </div>
                    {r.comment && <div style={{ marginTop: 2, color: 'var(--color-neutral)' }}>{r.comment}</div>}
                    <div className="mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                      {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {exError && <div className="error" style={{ marginTop: 16 }}>{exError}</div>}
    </div>
  );
}
