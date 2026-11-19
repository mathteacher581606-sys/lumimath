'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import LatexRenderer from '@/components/LatexRenderer';
import DeadlineBadge from '@/components/DeadlineBadge';
import LessonComments from '@/components/LessonComments';
import CourseSyllabus, { LessonStatus } from '@/components/course/CourseSyllabus';
import LessonBody, { lessonMaterials, lessonVideos } from '@/components/course/LessonBody';

// Trang học của học sinh: Mục lục (trái) + đúng MỘT bài đang học (phải)

const LOCK_TEXT: Record<string, string> = {
  sequential: 'Khóa học tuần tự — hoàn thành bài trước để mở bài này.',
  enroll: 'Đăng ký khóa học để học bài này.',
  scheduled: 'Bài này chưa đến giờ mở.',
};

function fmtDate(d: any) {
  if (!d) return '';
  return new Date(d).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function StudentCoursePage() {
  const params = useParams();
  const courseId = params.id as string;

  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [certLoading, setCertLoading] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // ===== Tải dữ liệu =====
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [c, p, a] = await Promise.all([
          apiFetch(`/courses/${courseId}`),
          apiFetch(`/courses/${courseId}/progress`).catch(() => null),
          apiFetch(`/courses/${courseId}/assignments`).catch(() => null),
        ]);
        if (!alive) return;
        setCourse(c);
        setProgress(p);
        setAssignments(Array.isArray(a?.assignments) ? a.assignments : []);
        // Bài mở đầu: ?lesson= → bài xem gần nhất ("Học tiếp") → bài chưa xong đầu tiên → bài đầu
        const lessons: any[] = c?.lessons || [];
        const want = new URLSearchParams(window.location.search).get('lesson');
        const open = (id?: string | null) => lessons.find((l) => l.id === id && !l.locked);
        const done = new Set<string>(p?.completedLessonIds || []);
        const first =
          open(want) ||
          open(p?.lastLessonId) ||
          lessons.find((l) => !l.locked && !done.has(l.id)) ||
          lessons.find((l) => !l.locked) ||
          lessons[0];
        if (first) setCurrentId(first.id);
      } catch (e: any) {
        if (alive) setLoadError(e.message || 'Không tải được khóa học');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [courseId]);

  const lessons: any[] = useMemo(() => course?.lessons || [], [course]);
  const curIndex = lessons.findIndex((l) => l.id === currentId);
  const lesson = curIndex >= 0 ? lessons[curIndex] : null;
  const doneSet = useMemo(() => new Set<string>(progress?.completedLessonIds || []), [progress]);
  const viewedSet = useMemo(() => new Set<string>(progress?.viewedLessonIds || []), [progress]);

  const statusOf = useCallback(
    (l: any): LessonStatus => {
      if (l.locked) return l.lockReason === 'scheduled' ? 'scheduled' : 'locked';
      if (doneSet.has(l.id)) return 'done';
      if (viewedSet.has(l.id)) return 'viewed';
      return 'todo';
    },
    [doneSet, viewedSet],
  );

  // Ghi nhận "đã mở bài" để thầy biết ai chưa xem
  useEffect(() => {
    if (!lesson || lesson.locked || !course?.enrolled) return;
    if (viewedSet.has(lesson.id)) return;
    apiFetch(`/courses/${courseId}/lessons/${lesson.id}/view`, { method: 'POST' })
      .then(() =>
        setProgress((p: any) =>
          p ? { ...p, viewedLessonIds: [...(p.viewedLessonIds || []), lesson.id] } : p,
        ),
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id, course?.enrolled]);

  function selectLesson(l: any) {
    setCurrentId(l.id);
    setTocOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set('lesson', l.id);
    window.history.replaceState(null, '', url.toString());
    document.getElementById('cl-main')?.scrollIntoView({ block: 'start' });
  }

  async function setComplete(l: any, completed: boolean) {
    setMarking(true);
    try {
      const data = await apiFetch(`/courses/${courseId}/lessons/${l.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ completed }),
      });
      setProgress((p: any) => {
        const ids = new Set<string>(p?.completedLessonIds || []);
        if (completed) ids.add(l.id);
        else ids.delete(l.id);
        return { ...(p || {}), ...data, completedLessonIds: Array.from(ids) };
      });
      // Học tuần tự: bài kế có thể vừa mở khoá → tải lại danh sách bài
      if (course?.sequential) setCourse(await apiFetch(`/courses/${courseId}`));
      return true;
    } catch (e: any) {
      showToast(e.message);
      return false;
    } finally {
      setMarking(false);
    }
  }

  async function goNext() {
    if (!lesson) return;
    if (!doneSet.has(lesson.id) && !lesson.seqPending) {
      const ok = await setComplete(lesson, true);
      if (!ok) return;
    }
    // đọc lại danh sách sau khi mở khoá
    const fresh: any[] = course?.sequential
      ? (await apiFetch(`/courses/${courseId}`).catch(() => course))?.lessons || lessons
      : lessons;
    const next = fresh[curIndex + 1];
    if (next) selectLesson(next);
  }

  async function downloadCertificate() {
    setCertLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/courses/${courseId}/certificate`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(String(err.message || 'Chưa thể tạo chứng chỉ').slice(-300));
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chung-chi-${course?.title || 'khoa-hoc'}.pdf`;
      a.click();
    } finally {
      setCertLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container cl-page" aria-busy="true">
        <div className="cl-head skeleton" style={{ height: 96 }} />
        <div className="cl-layout">
          <div className="skeleton" style={{ height: 420 }} />
          <div className="skeleton" style={{ height: 520 }} />
        </div>
      </div>
    );
  }
  if (loadError || !course) {
    return (
      <div className="page-container cl-page">
        <div className="cl-empty">
          <p>{loadError || 'Không tìm thấy khóa học.'}</p>
          <Link href="/student/my-courses" className="btn btn-outline cl-btn">
            ← Về khóa học của tôi
          </Link>
        </div>
      </div>
    );
  }

  const pct = Math.round((progress?.progress || 0) * 100);
  const pending = assignments.filter((a) => !a.mySubmission).length;
  const lessonAsg = lesson ? assignments.filter((a) => a.lessonId === lesson.id) : [];
  const cover = course.coverUrl || course.bannerUrl;

  return (
    <div className="page-container cl-page">
      {/* ===== ĐẦU TRANG GỌN ===== */}
      <header className="cl-head">
        <Link href="/student/my-courses" className="cl-back" aria-label="Về khóa học của tôi">
          ←
        </Link>
        {cover && <img src={cover} alt="" className="cl-cover" />}
        <div className="cl-head-text">
          <h1>{course.title}</h1>
          <p>
            {course.teacher?.fullName || 'Giáo viên'} · {lessons.length} bài giảng
            {course.sequential ? ' · Học tuần tự' : ''}
          </p>
          {course.enrolled && progress && (
            <div className="cl-prog" title={`${progress.done}/${progress.total} bài`}>
              <div className="cl-prog-bar" aria-hidden>
                <i style={{ transform: `scaleX(${pct / 100})` }} />
              </div>
              <span>
                {progress.done}/{progress.total} bài · {pct}%
              </span>
            </div>
          )}
        </div>
        <div className="cl-head-actions">
          {pct >= 100 && (
            <button type="button" className="btn btn-outline cl-btn" disabled={certLoading} onClick={downloadCertificate}>
              {certLoading ? 'Đang tạo…' : 'Tải chứng chỉ'}
            </button>
          )}
          <Link href={`/student/courses/${courseId}/announcements`} className="btn btn-outline cl-btn">
            Bảng tin
          </Link>
          <Link href={`/student/courses/${courseId}/assignments`} className="btn sh-btn-accent cl-btn">
            Bài tập
            {pending > 0 && <span className="cl-badge">{pending}</span>}
          </Link>
        </div>
      </header>

      {course.enrolled === false && (
        <div className="cl-note">
          <span>
            Bạn đang <b>xem thử</b> — chỉ mở được các bài có đánh dấu xem thử.
          </span>
          <Link href="/student/courses" className="btn sh-btn-accent cl-btn">
            Đăng ký để học toàn bộ
          </Link>
        </div>
      )}

      {!lessons.length ? (
        <div className="cl-empty">
          <p>Khóa học chưa có bài giảng nào.</p>
        </div>
      ) : (
        <div className="cl-layout">
          <button type="button" className="cl-toc-btn" aria-expanded={tocOpen} onClick={() => setTocOpen(!tocOpen)}>
            Mục lục · Bài {curIndex + 1}/{lessons.length}
          </button>
          <div className={`cl-aside${tocOpen ? ' is-open' : ''}`}>
            <CourseSyllabus
              lessons={lessons}
              currentId={currentId}
              onSelect={selectLesson}
              statusOf={statusOf}
              showProgress={!!course.enrolled}
            />
          </div>

          <main id="cl-main" className="cl-main">
            {lesson && (
              <LessonView
                key={lesson.id}
                courseId={courseId}
                course={course}
                lesson={lesson}
                index={curIndex}
                total={lessons.length}
                prev={curIndex > 0 ? lessons[curIndex - 1] : null}
                next={curIndex < lessons.length - 1 ? lessons[curIndex + 1] : null}
                done={doneSet.has(lesson.id)}
                marking={marking}
                assignments={lessonAsg}
                onToggleDone={() => setComplete(lesson, !doneSet.has(lesson.id))}
                onPrev={() => selectLesson(lessons[curIndex - 1])}
                onNext={goNext}
                toast={showToast}
              />
            )}
          </main>
        </div>
      )}

      {course.enrolled && <CourseReviews courseId={courseId} toast={showToast} />}

      {toast && (
        <div className="cl-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

// ================== MỘT BÀI GIẢNG ==================
function LessonView({
  courseId,
  course,
  lesson,
  index,
  total,
  prev,
  next,
  done,
  marking,
  assignments,
  onToggleDone,
  onPrev,
  onNext,
  toast,
}: {
  courseId: string;
  course: any;
  lesson: any;
  index: number;
  total: number;
  prev: any;
  next: any;
  done: boolean;
  marking: boolean;
  assignments: any[];
  onToggleDone: () => void;
  onPrev: () => void;
  onNext: () => void;
  toast: (m: string) => void;
}) {
  const [helpDraft, setHelpDraft] = useState('');

  if (lesson.locked) {
    return (
      <article className="cl-lesson">
        {lesson.chapter && <div className="cl-crumb">{lesson.chapter}</div>}
        <h2 className="cl-title">
          Bài {index + 1}. {lesson.title}
        </h2>
        <div className="cl-locked">
          <p>{LOCK_TEXT[lesson.lockReason] || 'Bài này đang khoá.'}</p>
          {lesson.lockReason === 'scheduled' && lesson.publishAt && (
            <p className="cl-muted">Mở lúc {fmtDate(lesson.publishAt)}</p>
          )}
          {lesson.lockReason === 'sequential' && prev && (
            <button type="button" className="btn btn-outline cl-btn" onClick={onPrev}>
              ← Quay lại bài {index}
            </button>
          )}
        </div>
      </article>
    );
  }

  const vids = lessonVideos(lesson);
  const mats = lessonMaterials(lesson);
  const hasPractice = !!lesson.exam || assignments.length > 0;

  return (
    <article className="cl-lesson">
      {lesson.chapter && <div className="cl-crumb">{lesson.chapter}</div>}
      <div className="cl-title-row">
        <h2 className="cl-title">
          Bài {index + 1}. {lesson.title}
        </h2>
        {course.enrolled && (
          <button
            type="button"
            className={`cl-done-btn${done ? ' is-done' : ''}`}
            aria-pressed={done}
            disabled={marking || (!done && lesson.seqPending)}
            title={!done && lesson.seqPending ? 'Hoàn thành các bài trước để đánh dấu bài này' : undefined}
            onClick={onToggleDone}
          >
            {marking ? 'Đang lưu…' : done ? '✓ Đã học xong' : 'Đánh dấu đã học'}
          </button>
        )}
      </div>
      <div className="cl-meta">
        {vids.length > 0 && <span>{vids.length} video</span>}
        {mats.length > 0 && <span>{mats.length} tài liệu</span>}
        {(assignments.length > 0 || lesson.exam) && (
          <span>{assignments.length + (lesson.exam ? 1 : 0)} bài tập</span>
        )}
        {lesson.deadline && <DeadlineBadge deadline={lesson.deadline} />}
      </div>

      {course.enrolled && lesson.seqPending && !done && (
        <div className="cl-note">
          <span>
            Em đang <b>xem trước</b>. Khóa học tuần tự: hoàn thành các bài trước rồi mới đánh dấu xong bài này.
          </span>
        </div>
      )}

      <LessonBody lesson={lesson} />

      {course.enrolled && (
        <>
          <LessonQuiz courseId={courseId} lessonId={lesson.id} toast={toast} />

          {hasPractice && (
            <section className="cl-sec">
              <h3 className="cl-h3">Bài tập của bài này</h3>
              <ul className="cl-tasks">
                {lesson.exam && (
                  <li className="cl-task">
                    <div className="cl-task-main">
                      <span className="cl-tag">Đề online</span>
                      <b>{lesson.exam.title}</b>
                      <span className="cl-muted">
                        {lesson.exam.duration} phút · {lesson.exam.totalScore} điểm
                      </span>
                    </div>
                    <div className="cl-task-act">
                      <Link href={`/student/exams/${lesson.exam.id}/take`} className="btn sh-btn-accent cl-btn">
                        Làm bài
                      </Link>
                      <Link href="/student/attempts" className="btn btn-outline cl-btn">
                        Kết quả & đáp án
                      </Link>
                    </div>
                  </li>
                )}
                {assignments.map((a) => {
                  const my = a.mySubmission;
                  const status = !my
                    ? { t: 'Chưa nộp', c: 'is-todo' }
                    : my.published && my.score != null
                      ? { t: `Đã chấm · ${my.score} điểm`, c: 'is-done' }
                      : my.status === 'RETURNED'
                        ? { t: 'Cần nộp lại', c: 'is-warn' }
                        : { t: 'Đã nộp', c: 'is-sent' };
                  return (
                    <li key={a.id} className="cl-task">
                      <div className="cl-task-main">
                        <span className={`cl-state ${status.c}`}>{status.t}</span>
                        <b>{a.title}</b>
                        {a.dueDate && <span className="cl-muted">Hạn {fmtDate(a.dueDate)}</span>}
                      </div>
                      <div className="cl-task-act">
                        <Link
                          href={`/student/courses/${courseId}/assignments?open=${a.id}`}
                          className={`btn cl-btn ${my ? 'btn-outline' : 'sh-btn-accent'}`}
                        >
                          {my ? 'Xem bài' : 'Làm bài'}
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <LessonNote courseId={courseId} lessonId={lesson.id} toast={toast} />
        </>
      )}

      {/* Điều hướng bài */}
      <nav className="cl-pager" aria-label="Chuyển bài">
        {prev ? (
          <button type="button" className="cl-page-btn" onClick={onPrev}>
            <small>← Bài trước</small>
            <span>{prev.title}</span>
          </button>
        ) : (
          <span />
        )}
        {next ? (
          <button type="button" className="cl-page-btn is-next" onClick={onNext} disabled={marking}>
            <small>
              {course.enrolled && !done && !lesson.seqPending ? 'Hoàn thành & học bài tiếp →' : 'Bài tiếp theo →'}
            </small>
            <span>{next.title}</span>
          </button>
        ) : (
          <span className="cl-muted cl-end">
            {index + 1 === total ? 'Đây là bài cuối của khóa học.' : ''}
          </span>
        )}
      </nav>

      {course.enrolled && (
        <section className="cl-sec" id="thao-luan">
          <div className="cl-sec-head">
            <h3 className="cl-h3">Hỏi đáp</h3>
            <button
              type="button"
              className="btn btn-outline cl-btn"
              onClick={() => setHelpDraft(`Em cần hỏi về bài "${lesson.title}": `)}
            >
              Hỏi thầy về bài này
            </button>
          </div>
          <LessonComments courseId={courseId} lessonId={lesson.id} prefill={helpDraft} />
        </section>
      )}
    </article>
  );
}

// ================== QUIZ CỦNG CỐ ==================
function LessonQuiz({
  courseId,
  lessonId,
  toast,
}: {
  courseId: string;
  lessonId: string;
  toast: (m: string) => void;
}) {
  const [quiz, setQuiz] = useState<any>(null);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setQuiz(await apiFetch(`/courses/${courseId}/lessons/${lessonId}/quiz`));
    } catch {
      setQuiz(null); // bài không có quiz
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  if (!quiz || !quiz.questions?.length) return null;
  const outOfTurns = quiz.maxAttempts > 0 && quiz.remaining === 0;

  async function submit() {
    const left = quiz.questions.filter((q: any) => !answers[q.id]).length;
    if (left && !confirm(`Còn ${left} câu chưa chọn. Nộp luôn?`)) return;
    setBusy(true);
    try {
      setResult(
        await apiFetch(`/courses/${courseId}/lessons/${lessonId}/quiz/submit`, {
          method: 'POST',
          body: JSON.stringify({ answers, token: quiz.token }),
        }),
      );
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setResult(null);
    setAnswers({});
    setStarted(true);
    await load(); // bộ câu mới (trộn lại)
  }

  return (
    <section className="cl-sec cl-quiz">
      <div className="cl-sec-head">
        <h3 className="cl-h3">Luyện nhanh</h3>
        <span className="cl-muted">
          {quiz.questionCount} câu trắc nghiệm · đạt từ {quiz.passingPercent}%
          {quiz.negativeMarking ? ` · sai trừ ${quiz.negativeWeight} điểm` : ''}
          {quiz.maxAttempts > 0 ? ` · còn ${quiz.remaining}/${quiz.maxAttempts} lượt` : ''}
          {quiz.bestScore != null ? ` · cao nhất ${quiz.bestScore}%` : ''}
        </span>
      </div>

      {!started && !result && (
        <button type="button" className="btn sh-btn-accent cl-btn" disabled={outOfTurns} onClick={() => setStarted(true)}>
          {outOfTurns ? 'Đã hết lượt làm' : quiz.history?.length ? 'Làm lại' : 'Bắt đầu'}
        </button>
      )}

      {started && !result && (
        <ol className="cl-qlist">
          {quiz.questions.map((q: any, qi: number) => (
            <li key={q.id} className="cl-q">
              <div className="cl-q-text">
                <b>Câu {qi + 1}.</b> <LatexRenderer content={q.content} />
              </div>
              <div className="cl-q-opts" role="radiogroup">
                {(q.options || []).map((o: any) => (
                  <label key={o.id} className={`cl-opt${answers[q.id] === o.id ? ' is-on' : ''}`}>
                    <input
                      type="radio"
                      name={`quiz-${q.id}`}
                      checked={answers[q.id] === o.id}
                      onChange={() => setAnswers((p) => ({ ...p, [q.id]: o.id }))}
                    />
                    <b>{o.id}.</b>
                    <span>
                      <LatexRenderer content={o.text} />
                    </span>
                  </label>
                ))}
              </div>
            </li>
          ))}
          <li className="cl-q-submit">
            <button type="button" className="btn sh-btn-accent cl-btn" disabled={busy} onClick={submit}>
              {busy ? 'Đang chấm…' : 'Nộp bài'}
            </button>
          </li>
        </ol>
      )}

      {result && (
        <div>
          <p className={`cl-qres ${result.passed ? 'is-pass' : 'is-fail'}`}>
            {result.passed ? 'Đạt' : 'Chưa đạt'} — {result.score}% ({result.correct}/{result.total} câu đúng)
            {result.penalty > 0 ? ` · trừ ${result.penalty} điểm do ${result.wrong} câu sai` : ''}
          </p>
          <ol className="cl-qlist">
            {result.results.map((r: any, ri: number) => {
              const q = quiz.questions.find((x: any) => x.id === r.id);
              return (
                <li key={r.id} className={`cl-q ${r.correct ? 'is-right' : 'is-wrong'}`}>
                  <div className="cl-q-text">
                    <b>Câu {ri + 1}.</b> <LatexRenderer content={q?.content || ''} />
                  </div>
                  <div className="cl-q-ans">
                    Đáp án đúng: <b>{r.answer}</b>
                    {!r.correct && (r.your ? ` · Em chọn: ${r.your}` : ' · Em chưa chọn')}
                  </div>
                  {r.solution && (
                    <div className="cl-q-sol">
                      <LatexRenderer content={r.solution} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {!(quiz.maxAttempts > 0 && quiz.remaining <= 1) && (
            <button type="button" className="btn btn-outline cl-btn" onClick={retry}>
              Làm lại với bộ câu khác
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ================== GHI CHÚ CÁ NHÂN ==================
function LessonNote({ courseId, lessonId, toast }: { courseId: string; lessonId: string; toast: (m: string) => void }) {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch(`/courses/${courseId}/lessons/${lessonId}/note`)
      .then((d) => {
        setText(d?.content || '');
        setSaved(d?.content || '');
      })
      .catch(() => {});
  }, [courseId, lessonId]);

  async function save() {
    setBusy(true);
    try {
      await apiFetch(`/courses/${courseId}/lessons/${lessonId}/note`, {
        method: 'PUT',
        body: JSON.stringify({ content: text }),
      });
      setSaved(text);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="cl-sec cl-notebox" open={!!saved}>
      <summary className="cl-h3">Ghi chú của em {saved ? '' : '(chỉ em thấy)'}</summary>
      <textarea
        rows={4}
        value={text}
        maxLength={20000}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ghi lại công thức cần nhớ, chỗ chưa hiểu…"
      />
      <button type="button" className="btn btn-outline cl-btn" disabled={busy || text === saved} onClick={save}>
        {busy ? 'Đang lưu…' : text === saved && saved ? 'Đã lưu' : 'Lưu ghi chú'}
      </button>
    </details>
  );
}

// ================== ĐÁNH GIÁ KHÓA HỌC ==================
function CourseReviews({ courseId, toast }: { courseId: string; toast: (m: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch(`/courses/${courseId}/reviews`)
      .then((d) => {
        setData(d);
        setRating(d.myRating ?? 0);
      })
      .catch(() => {});
  }, [courseId]);

  if (!data) return null;

  async function submit() {
    if (!rating) return;
    setBusy(true);
    try {
      await apiFetch(`/courses/${courseId}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment }),
      });
      const d = await apiFetch(`/courses/${courseId}/reviews`);
      setData(d);
      toast('Cảm ơn em đã đánh giá!');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="cl-reviews">
      <summary>
        <span className="cl-h3">Đánh giá khóa học</span>
        <span className="cl-muted">
          {data.avg ?? '—'} / 5 · {data.count} lượt
        </span>
      </summary>
      <div className="cl-stars" role="radiogroup" aria-label="Chấm sao">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} sao`}
            className={n <= rating ? 'is-on' : ''}
            onClick={() => setRating(n)}
          >
            ★
          </button>
        ))}
      </div>
      <div className="cl-review-form">
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Nhận xét (không bắt buộc)…" />
        <button type="button" className="btn sh-btn-accent cl-btn" disabled={busy || !rating} onClick={submit}>
          {busy ? 'Đang gửi…' : 'Gửi'}
        </button>
      </div>
      {data.reviews.slice(0, 10).map((r: any) => (
        <div key={r.id} className="cl-review">
          <b>{r.student.fullName}</b> <span className="cl-review-stars">{'★'.repeat(r.rating)}</span>
          {r.comment && <p>{r.comment}</p>}
        </div>
      ))}
    </details>
  );
}
