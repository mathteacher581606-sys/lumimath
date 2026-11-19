'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, getUser } from '@/lib/api';

// Cấp độ theo kiểu quân đội
const RANKS = [
  'Binh Bét', 'Binh Nhì', 'Binh Nhất', 'Hạ Sĩ', 'Trung Sĩ', 'Thượng Sĩ',
  'Thiếu Úy', 'Trung Úy', 'Thượng Úy', 'Đại Úy',
  'Thiếu Tá', 'Trung Tá', 'Thượng Tá', 'Đại Tá',
  'Thiếu Tướng', 'Trung Tướng', 'Thượng Tướng', 'Đại Tướng',
  'Nguyên Soái', 'Huyền Thoại',
];

type Task = {
  key: string;
  kind: 'exam' | 'homework' | 'lesson';
  title: string;
  course: string;
  deadline: number | null;
  href: string;
};

function rankOf(level: number) {
  return RANKS[Math.min(Math.max(level, 1), RANKS.length) - 1] || 'Huyền Thoại';
}

// "còn 3 giờ 12 phút" / "còn 2 ngày" / "đã quá hạn"
function timeLeft(deadline: number, now: number) {
  const ms = deadline - now;
  if (ms <= 0) return 'đã quá hạn';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `còn ${min} phút`;
  const h = Math.floor(min / 60);
  if (h < 24) return `còn ${h} giờ ${min % 60} phút`;
  return `còn ${Math.floor(h / 24)} ngày`;
}

function deadlineLabel(deadline: number, now: number) {
  const d = new Date(deadline);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const hm = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Hạn ${hm} hôm nay`;
  const tomorrow = new Date(now + 86400000);
  if (d.toDateString() === tomorrow.toDateString()) return `Hạn ${hm} ngày mai`;
  return `Hạn ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}`;
}

function greeting(now: number) {
  const h = new Date(now).getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export default function StudentDashboard() {
  const [me, setMe] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [practice, setPractice] = useState<any>(null);
  const [quests, setQuests] = useState<any>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [achievements, setAchievements] = useState<any>(null);
  const [creatingPractice, setCreatingPractice] = useState(false);
  const [practiceError, setPracticeError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMe(getUser());
    apiFetch('/exams/dashboard').then(setDash).catch(() => setDash({ upcoming: [], streakDays: 0, activeDays: [] }));
    apiFetch('/exams/practice/recommend').then(setPractice).catch(() => setPractice({ weakTopics: [], message: 'Chưa phân tích được.' }));
    apiFetch('/gamification/daily-quests').then(setQuests).catch(() => setQuests({ quests: [] }));
    apiFetch('/gamification/achievements').then(setAchievements).catch(() => {});
    apiFetch('/courses/my-weekly-tasks').then(setWeekly).catch(() => setWeekly({ upcoming: [], todo: [] }));
    // Cập nhật đồng hồ đếm ngược mỗi phút
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  async function createPractice() {
    setCreatingPractice(true);
    setPracticeError('');
    try {
      const data = await apiFetch('/exams/practice', {
        method: 'POST',
        body: JSON.stringify({ count: 10 }),
      });
      window.location.href = `/student/exams/${data.examId}/take`;
    } catch (e: any) {
      setPracticeError(e.message || 'Không tạo được đề luyện');
      setCreatingPractice(false);
    }
  }

  // Gộp bài thi + BTVN sắp đến hạn + bài chưa học thành 1 danh sách, xếp theo hạn
  const tasks: Task[] = useMemo(() => {
    const list: Task[] = [];
    const seen = new Set<string>();
    for (const u of dash?.upcoming || []) {
      const dl = u.deadline ? new Date(u.deadline).getTime() : null;
      const k = `${u.examTitle}|${dl}`;
      if (seen.has(k)) continue;
      seen.add(k);
      list.push({
        key: 'd' + k,
        kind: 'exam',
        title: u.examTitle,
        course: u.courseTitle,
        deadline: dl,
        href: u.examId ? `/student/exams/${u.examId}/take` : '/student/exams',
      });
    }
    for (const t of weekly?.upcoming || []) {
      const title = t.examTitle || t.title;
      const dl = t.deadline ? new Date(t.deadline).getTime() : null;
      const k = `${title}|${dl}`;
      if (seen.has(k)) continue;
      seen.add(k);
      list.push({
        key: 'w' + t.lessonId,
        kind: 'homework',
        title,
        course: t.courseTitle,
        deadline: dl,
        href: `/student/courses/${t.courseId}`,
      });
    }
    list.sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity));
    for (const t of weekly?.todo || []) {
      list.push({
        key: 't' + t.lessonId,
        kind: 'lesson',
        title: t.title,
        course: t.courseTitle,
        deadline: null,
        href: `/student/courses/${t.courseId}`,
      });
    }
    return list;
  }, [dash, weekly]);

  const loadingTasks = !dash || !weekly;
  const lead = tasks.find((t) => t.kind !== 'lesson') || null;
  const rest = tasks.filter((t) => t !== lead).slice(0, 4);
  const urgent = !!lead?.deadline && lead.deadline - now < 24 * 3600000;

  const xp = me?.xp ?? 0;
  const level = me?.level ?? 1;
  const xpInLevel = xp % 100;
  const pct = Math.min(100, Math.round(xpInLevel));
  const firstName = (me?.fullName || 'bạn').trim().split(/\s+/).pop();
  const streak = dash?.streakDays ?? 0;

  return (
    <div className="page-container sh">
      {/* ===== Lời chào + level ===== */}
      <section className="sh-hello" aria-labelledby="sh-hello-title">
        <div
          className="sh-ring"
          role="img"
          aria-label={`Level ${level}, đạt ${pct}% để lên level tiếp theo`}
          style={{ ['--p' as any]: `${pct}%` }}
        >
          <div className="sh-ring-inner">
            <span className="sh-ring-cap">LEVEL</span>
            <span className="sh-ring-num">{level}</span>
          </div>
        </div>
        <div className="sh-hello-text">
          <h1 id="sh-hello-title">
            {greeting(now)}, {firstName}!
          </h1>
          <p>
            {me?.className ? `Lớp ${me.className} · ` : ''}còn {100 - xpInLevel} XP nữa là lên{' '}
            {rankOf(level + 1)}
          </p>
        </div>
        <div className="sh-chips">
          <span className="chip">{rankOf(level)}</span>
          {streak > 0 && <span className="chip chip-hot">Chuỗi {streak} ngày</span>}
          <span className="chip">{xp} XP</span>
        </div>
      </section>

      {/* ===== Nhắc bài cỡ lớn ===== */}
      {loadingTasks ? (
        <div className="sh-lead skeleton" style={{ height: 220 }} aria-hidden="true" />
      ) : lead ? (
        <section className={`sh-lead ${urgent ? 'is-urgent' : ''}`} aria-labelledby="sh-lead-title">
          <p className="sh-lead-kicker">
            {lead.deadline ? (
              <>
                {deadlineLabel(lead.deadline, now)} · {timeLeft(lead.deadline, now)}
              </>
            ) : (
              'Việc cần làm'
            )}
          </p>
          <h2 id="sh-lead-title" className="sh-lead-title">
            {lead.kind === 'exam' ? 'Bài thi' : 'Bài tập'} “{lead.title}” đang chờ em
          </h2>
          <p className="sh-lead-sub">{lead.course}</p>
          <Link href={lead.href} className="sh-cta">
            {lead.kind === 'exam' ? 'Làm bài ngay' : 'Mở bài tập'}
          </Link>
        </section>
      ) : (
        <section className="sh-lead is-calm" aria-labelledby="sh-lead-title">
          <p className="sh-lead-kicker">Hôm nay</p>
          <h2 id="sh-lead-title" className="sh-lead-title">Em không có bài nào sắp đến hạn</h2>
          <p className="sh-lead-sub">Tranh thủ luyện thêm một đề để giữ chuỗi học tập nhé.</p>
          <Link href="/student/practice" className="sh-cta">
            Vào phòng luyện đề
          </Link>
        </section>
      )}

      {/* ===== Các việc tiếp theo ===== */}
      {rest.length > 0 && (
        <section aria-label="Việc tiếp theo" className="sh-cards">
          {rest.map((t) => (
            <Link key={t.key} href={t.href} className="sh-task">
              <span className="sh-task-meta">
                {t.kind === 'lesson'
                  ? 'Bài học chưa xem'
                  : t.deadline
                    ? `${t.kind === 'exam' ? 'Bài thi' : 'BTVN'} · ${deadlineLabel(t.deadline, now)}`
                    : t.kind === 'exam'
                      ? 'Bài thi'
                      : 'BTVN'}
              </span>
              <span className="sh-task-title">{t.title}</span>
              <span className="sh-task-course">{t.course}</span>
              <span className="sh-task-btn">{t.kind === 'lesson' ? 'Học bài' : 'Mở bài'}</span>
            </Link>
          ))}
        </section>
      )}

      <div className="sh-grid">
        {/* Nhiệm vụ hằng ngày */}
        <section className="sh-box" aria-labelledby="sh-q">
          <h2 id="sh-q">Nhiệm vụ hằng ngày</h2>
          {!quests ? (
            <div className="skeleton" style={{ height: 90 }} aria-hidden="true" />
          ) : quests.quests?.length === 0 ? (
            <p className="sh-muted">Hôm nay chưa có nhiệm vụ.</p>
          ) : (
            <ul className="sh-quests">
              {quests.quests.map((q: any) => (
                <li key={q.key} className={q.done || q.claimed ? 'is-done' : ''}>
                  <span className="sh-check" aria-hidden="true">
                    {(q.done || q.claimed) && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </span>
                  <span className="sh-quest-label">
                    {q.label}
                    <span className="sr-only">{q.done || q.claimed ? ' (đã xong)' : ' (chưa xong)'}</span>
                  </span>
                  <span className="sh-quest-xp">+{q.bonus}</span>
                </li>
              ))}
            </ul>
          )}
          {quests?.bonusToday > 0 && (
            <p className="sh-bonus">+{quests.bonusToday} XP thưởng hôm nay</p>
          )}
        </section>

        {/* Ôn tập thông minh */}
        <section className="sh-box" aria-labelledby="sh-p">
          <h2 id="sh-p">Ôn tập thông minh</h2>
          {!practice ? (
            <div className="skeleton" style={{ height: 90 }} aria-hidden="true" />
          ) : !practice.weakTopics?.length ? (
            <p className="sh-muted">{practice.message || 'Làm thêm vài bài để LumiMath tìm chủ đề em cần ôn.'}</p>
          ) : (
            <>
              <p className="sh-muted">Em hay sai ở các chủ đề này</p>
              <div className="sh-topics">
                {practice.weakTopics.map((t: any) => (
                  <span key={t.topicId} className="chip chip-hot">
                    {t.name} {t.wrong}/{t.total}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="btn sh-btn-accent"
                disabled={creatingPractice || practice.available < 3}
                onClick={createPractice}
              >
                {creatingPractice ? 'Đang tạo đề…' : 'Tạo đề luyện 10 câu'}
              </button>
              {practice.available < 3 && (
                <p className="sh-muted sh-small">Chưa đủ câu hỏi để tạo đề ({practice.available} câu).</p>
              )}
              {practiceError && (
                <p className="sh-error" role="alert">
                  {practiceError}
                </p>
              )}
            </>
          )}
        </section>

        {/* Chuỗi học tập */}
        <section className="sh-box" aria-labelledby="sh-s">
          <h2 id="sh-s">Chuỗi học tập{dash ? ` · ${streak} ngày` : ''}</h2>
          {!dash ? (
            <div className="skeleton" style={{ height: 90 }} aria-hidden="true" />
          ) : (
            <div className="sh-streak" role="list" aria-label="14 ngày gần nhất">
              {Array.from({ length: 14 }, (_, i) => {
                const d = new Date(now - (13 - i) * 86400000);
                const key = d.toISOString().slice(0, 10);
                const active = dash.activeDays?.includes(key);
                const label = `${d.toLocaleDateString('vi-VN')}${active ? ': có học' : ': chưa học'}`;
                return <span key={i} role="listitem" title={label} aria-label={label} className={active ? 'on' : ''} />;
              })}
            </div>
          )}
        </section>

        {/* Huy hiệu */}
        {achievements?.all && (
          <section className="sh-box" aria-labelledby="sh-b">
            <div className="sh-box-head">
              <h2 id="sh-b">Huy hiệu</h2>
              <Link href="/student/leaderboard">Bảng xếp hạng</Link>
            </div>
            <ul className="sh-badges">
              {achievements.all.map((a: any) => (
                <li key={a.code} className={a.earned ? '' : 'is-locked'} title={a.name}>
                  <span className="sh-badge-icon" aria-hidden="true">
                    {a.earned ? a.icon : '?'}
                  </span>
                  <span>{a.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
