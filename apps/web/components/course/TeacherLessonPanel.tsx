'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import LessonComments from '@/components/LessonComments';
import LessonBody, { lessonMaterials, lessonVideos } from '@/components/course/LessonBody';

// Bảng chi tiết MỘT bài giảng phía giáo viên: xem trước như học sinh + ai đã xem/chưa xem + bài tập + hỏi đáp

function fmt(d: any) {
  return d
    ? new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : '';
}

export default function TeacherLessonPanel({
  courseId,
  lesson,
  index,
  isFirst,
  isLast,
  stats,
  assignments,
  onEdit,
  onMove,
  onToggleHidden,
  onDelete,
  toast,
}: {
  courseId: string;
  lesson: any;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  stats?: { viewed: number; completed: number };
  assignments: any[];
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  toast: (m: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [viewers, setViewers] = useState<any>(null);
  const [showViewers, setShowViewers] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [quiz, setQuiz] = useState<any>(null);

  useEffect(() => {
    setViewers(null);
    setShowViewers(false);
    setQuiz(null);
    apiFetch(`/courses/${courseId}/lessons/${lesson.id}/quiz`).then(setQuiz).catch(() => {});
  }, [courseId, lesson.id]);

  // Đóng menu ⋯ khi bấm ra ngoài / Esc
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);

  async function loadViewers() {
    try {
      setViewers(await apiFetch(`/courses/${courseId}/lessons/${lesson.id}/viewers`));
    } catch (e: any) {
      toast(e.message);
    }
  }

  async function remind() {
    setReminding(true);
    try {
      const r = await apiFetch(`/courses/${courseId}/lessons/${lesson.id}/remind`, { method: 'POST' });
      toast(r.sent ? `Đã nhắc ${r.sent} học sinh chưa xem bài` : 'Tất cả học sinh đã xem bài này');
    } catch (e: any) {
      toast(e.message);
    } finally {
      setReminding(false);
    }
  }

  const scheduled = lesson.publishAt && new Date(lesson.publishAt).getTime() > Date.now();
  const vids = lessonVideos(lesson);
  const mats = lessonMaterials(lesson);

  return (
    <article className="cl-lesson">
      {lesson.chapter && <div className="cl-crumb">{lesson.chapter}</div>}
      <div className="cl-title-row">
        <h2 className="cl-title">
          Bài {index + 1}. {lesson.title}
        </h2>
        <div className="tl-actions">
          <button type="button" className="btn btn-outline cl-btn" onClick={onEdit}>
            Sửa bài
          </button>
          <div className="tl-menu" ref={menuRef}>
            <button
              type="button"
              className="btn btn-outline cl-btn"
              aria-haspopup="menu"
              aria-expanded={menu}
              aria-label="Thao tác khác"
              onClick={() => setMenu(!menu)}
            >
              ⋯
            </button>
            {menu && (
              <div className="tl-menu-list" role="menu">
                <button type="button" role="menuitem" disabled={isFirst} onClick={() => { setMenu(false); onMove(-1); }}>
                  Chuyển lên trên
                </button>
                <button type="button" role="menuitem" disabled={isLast} onClick={() => { setMenu(false); onMove(1); }}>
                  Chuyển xuống dưới
                </button>
                <button type="button" role="menuitem" onClick={() => { setMenu(false); onToggleHidden(); }}>
                  {lesson.hidden ? 'Hiện cho học sinh' : 'Ẩn (chuyển thành bài nháp)'}
                </button>
                <Link role="menuitem" href={`/student/courses/${courseId}?lesson=${lesson.id}`} target="_blank">
                  Xem như học sinh ↗
                </Link>
                <hr />
                <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenu(false); onDelete(); }}>
                  Xoá bài giảng…
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="cl-meta">
        {lesson.hidden && <span className="cl-state is-warn">Bài nháp — học sinh chưa thấy</span>}
        {scheduled && <span className="cl-state is-todo">Hẹn mở {fmt(lesson.publishAt)}</span>}
        {lesson.isPreviewFree && <span className="cl-tag">Xem thử miễn phí</span>}
        {vids.length > 0 && <span>{vids.length} video</span>}
        {mats.length > 0 && <span>{mats.length} tài liệu</span>}
        {lesson.deadline && <span>Hạn BTVN {fmt(lesson.deadline)}</span>}
      </div>

      {/* Ai đã xem bài */}
      <div className="tl-reach">
        <button
          type="button"
          className="tl-reach-btn"
          aria-expanded={showViewers}
          onClick={() => {
            setShowViewers(!showViewers);
            if (!viewers) loadViewers();
          }}
        >
          <b>{stats?.viewed ?? 0}</b> học sinh đã xem · <b>{stats?.completed ?? 0}</b> hoàn thành
          <span className="cl-muted"> — {showViewers ? 'ẩn danh sách' : 'xem ai chưa học'}</span>
        </button>
        {showViewers && (
          <div className="tl-viewers">
            {!viewers ? (
              <p className="cl-muted">Đang tải…</p>
            ) : !viewers.total ? (
              <p className="cl-muted">Khóa học chưa có học sinh.</p>
            ) : (
              <>
                <div className="tl-viewers-head">
                  <span>
                    {viewers.notViewed} chưa xem · {viewers.viewed - viewers.completed} đang học · {viewers.completed} xong
                  </span>
                  {viewers.notViewed > 0 && !lesson.hidden && !scheduled && (
                    <button type="button" className="btn sh-btn-accent cl-btn" disabled={reminding} onClick={remind}>
                      {reminding ? 'Đang gửi…' : `Nhắc ${viewers.notViewed} em chưa xem`}
                    </button>
                  )}
                </div>
                <ul>
                  {viewers.rows.map((r: any) => (
                    <li key={r.student.id} className={`is-${r.status}`}>
                      <span className="cl-dot" />
                      <span className="tl-v-name">{r.student.fullName}</span>
                      <span className="cl-muted">{r.student.className || ''}</span>
                      <span className="tl-v-st">
                        {r.status === 'NOT_VIEWED' ? 'Chưa xem' : r.status === 'COMPLETED' ? 'Đã xong' : 'Đã mở'}
                        {r.at ? ` · ${fmt(r.at)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <LessonBody lesson={lesson} />

      {/* Bài tập của bài */}
      <section className="cl-sec">
        <div className="cl-sec-head">
          <h3 className="cl-h3">Bài tập của bài này</h3>
          <Link
            href={`/teacher/courses/${courseId}/assignments?new=1&lessonId=${lesson.id}`}
            className="btn btn-outline cl-btn"
          >
            + Giao bài tập
          </Link>
        </div>
        {!lesson.exam && !assignments.length && !quiz ? (
          <p className="cl-muted">
            Chưa có bài tập. Bấm “+ Giao bài tập” để chọn đề từ kho đề, câu tự luận từ ngân hàng hoặc tự gõ đề.
          </p>
        ) : (
          <ul className="cl-tasks">
            {lesson.exam && (
              <li className="cl-task">
                <div className="cl-task-main">
                  <span className="cl-tag">BTVN đề online</span>
                  <b>{lesson.exam.title}</b>
                  <span className="cl-muted">
                    {lesson.exam.duration} phút · {lesson.exam.totalScore} điểm
                  </span>
                </div>
                <div className="cl-task-act">
                  <Link href={`/teacher/exams/${lesson.exam.id}`} className="btn btn-outline cl-btn">
                    Xem đề & kết quả
                  </Link>
                </div>
              </li>
            )}
            {quiz && (
              <li className="cl-task">
                <div className="cl-task-main">
                  <span className="cl-tag">Luyện nhanh</span>
                  <b>
                    {quiz.questionCount} câu trắc nghiệm · đạt từ {quiz.passingPercent}%
                  </b>
                  <span className="cl-muted">
                    {(quiz.summary || []).filter((s: any) => s.attempts > 0).length} em đã làm ·{' '}
                    {(quiz.summary || []).filter((s: any) => s.passed).length} em đạt
                  </span>
                </div>
              </li>
            )}
            {assignments.map((a) => (
              <li key={a.id} className="cl-task">
                <div className="cl-task-main">
                  <span className="cl-tag">
                    {a.kind === 'EXAM' ? 'Đề thi' : a.kind === 'TULUAN' ? 'Tự luận' : 'Tự gõ đề'}
                  </span>
                  <b>{a.title}</b>
                  <span className="cl-muted">
                    {a.submissionCount ?? 0} bài nộp{a.dueDate ? ` · hạn ${fmt(a.dueDate)}` : ''}
                  </span>
                </div>
                <div className="cl-task-act">
                  <Link
                    href={`/teacher/courses/${courseId}/assignments/${a.id}/grade`}
                    className="btn sh-btn-accent cl-btn"
                  >
                    Chấm bài
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cl-sec">
        <h3 className="cl-h3" style={{ marginBottom: 10 }}>
          Hỏi đáp của học sinh
        </h3>
        <LessonComments courseId={courseId} lessonId={lesson.id} />
      </section>
    </article>
  );
}
