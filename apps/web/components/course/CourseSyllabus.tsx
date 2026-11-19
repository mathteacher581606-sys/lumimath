'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

// Mục lục khóa học dùng chung cho học sinh & giáo viên:
// chương gập/mở được + tiến độ chương, mỗi bài có chấm trạng thái.
export type LessonStatus =
  | 'done' // đã hoàn thành
  | 'viewed' // đã mở, chưa xong
  | 'todo' // chưa mở
  | 'locked' // bị khoá (tuần tự / chưa ghi danh)
  | 'scheduled' // hẹn giờ mở
  | 'hidden'; // bài nháp (chỉ GV thấy)

const STATUS_LABEL: Record<LessonStatus, string> = {
  done: 'Đã học xong',
  viewed: 'Đang học',
  todo: 'Chưa học',
  locked: 'Đang khoá',
  scheduled: 'Hẹn giờ mở',
  hidden: 'Bài nháp',
};

export function groupByChapter(lessons: any[]) {
  const groups: { name: string; lessons: { lesson: any; index: number }[] }[] = [];
  lessons.forEach((l, index) => {
    const name = l.chapter || 'Bài giảng chung';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.lessons.push({ lesson: l, index });
    else groups.push({ name, lessons: [{ lesson: l, index }] });
  });
  return groups;
}

export default function CourseSyllabus({
  lessons,
  currentId,
  onSelect,
  statusOf,
  meta,
  showProgress = true,
  title = 'Mục lục',
  headerAction,
}: {
  lessons: any[];
  currentId: string | null;
  onSelect: (lesson: any) => void;
  statusOf: (lesson: any) => LessonStatus;
  meta?: (lesson: any) => ReactNode;
  showProgress?: boolean;
  title?: string;
  headerAction?: ReactNode;
}) {
  const groups = useMemo(() => groupByChapter(lessons), [lessons]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Luôn mở chương chứa bài đang xem
  useEffect(() => {
    const g = groups.find((x) => x.lessons.some((y) => y.lesson.id === currentId));
    if (g && collapsed[g.name]) setCollapsed((c) => ({ ...c, [g.name]: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  return (
    <nav className="cl-syl" aria-label="Mục lục khóa học">
      <div className="cl-syl-head">
        <span>{title}</span>
        {headerAction}
      </div>
      {groups.map((g, gi) => {
        const done = g.lessons.filter((x) => statusOf(x.lesson) === 'done').length;
        const isCollapsed = !!collapsed[g.name];
        return (
          <section key={`${g.name}-${gi}`} className="cl-syl-ch">
            <button
              type="button"
              className="cl-syl-ch-head"
              aria-expanded={!isCollapsed}
              onClick={() => setCollapsed((c) => ({ ...c, [g.name]: !isCollapsed }))}
            >
              <span className="cl-syl-caret" aria-hidden>
                {isCollapsed ? '›' : '⌄'}
              </span>
              <span className="cl-syl-ch-name">{g.name}</span>
              {showProgress && (
                <span className="cl-syl-ch-count">
                  {done}/{g.lessons.length}
                </span>
              )}
            </button>
            {showProgress && (
              <div className="cl-syl-bar" aria-hidden>
                <i style={{ transform: `scaleX(${g.lessons.length ? done / g.lessons.length : 0})` }} />
              </div>
            )}
            {!isCollapsed && (
              <ol className="cl-syl-list">
                {g.lessons.map(({ lesson, index }) => {
                  const st = statusOf(lesson);
                  const cur = lesson.id === currentId;
                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        className={`cl-syl-item is-${st}${cur ? ' is-current' : ''}`}
                        aria-current={cur ? 'true' : undefined}
                        onClick={() => onSelect(lesson)}
                        title={`${lesson.title} — ${STATUS_LABEL[st]}`}
                      >
                        <span className="cl-dot" aria-label={STATUS_LABEL[st]} />
                        <span className="cl-syl-title">
                          <span className="cl-syl-no">{index + 1}.</span> {lesson.title}
                        </span>
                        {meta && <span className="cl-syl-meta">{meta(lesson)}</span>}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </nav>
  );
}
