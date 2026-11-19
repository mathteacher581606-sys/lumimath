'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, getUser } from '@/lib/api';

export default function StudentDashboard() {
  const [me, setMe] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [practice, setPractice] = useState<any>(null);
  const [quests, setQuests] = useState<any>(null);
  const [weekly, setWeekly] = useState<any>(null);
  const [achievements, setAchievements] = useState<any>(null);
  const [creatingPractice, setCreatingPractice] = useState(false);

  // Cấp độ theo kiểu quân đội
  const RANKS = [
    'Binh Bét', 'Binh Nhì', 'Binh Nhất', 'Hạ Sĩ', 'Trung Sĩ', 'Thượng Sĩ',
    'Thiếu Úy', 'Trung Úy', 'Thượng Úy', 'Đại Úy',
    'Thiếu Tá', 'Trung Tá', 'Thượng Tá', 'Đại Tá',
    'Thiếu Tướng', 'Trung Tướng', 'Thượng Tướng', 'Đại Tướng',
    'Nguyên Soái', 'Huyền Thoại',
  ];

  useEffect(() => {
    setMe(getUser());
    apiFetch('/exams/dashboard').then(setDash).catch(() => {});
    apiFetch('/exams/practice/recommend').then(setPractice).catch(() => {});
    apiFetch('/gamification/daily-quests').then(setQuests).catch(() => {});
    apiFetch('/gamification/achievements').then(setAchievements).catch(() => {});
    apiFetch('/courses/my-weekly-tasks').then(setWeekly).catch(() => {});
  }, []);

  async function createPractice() {
    setCreatingPractice(true);
    try {
      const data = await apiFetch('/exams/practice', {
        method: 'POST',
        body: JSON.stringify({ count: 10 }),
      });
      window.location.href = `/student/exams/${data.examId}/take`;
    } catch (e: any) {
      alert(e.message);
      setCreatingPractice(false);
    }
  }

  // Thanh tiến độ level
  const xp = me?.xp ?? 0;
  const level = me?.level ?? 1;
  const xpInLevel = xp % 100;
  const xpNext = 100;
  const pct = Math.min(100, Math.round((xpInLevel / xpNext) * 100));
  const rank = RANKS[Math.min(level, RANKS.length) - 1] || 'Huyền Thoại';

  return (
    <div className="page-container" data-theme="maroon">
      {/* ===== HỒ SƠ TRANG CHỦ ===== */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: 'hidden',
          borderRadius: 18,
          marginBottom: 18,
          background: 'linear-gradient(120deg, #7b1113 0%, #be123c 55%, #d97706 100%)',
          color: '#fff',
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
        }}
      >
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', padding: 22 }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              border: '3px solid rgba(255,255,255,0.6)',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {me?.avatarUrl ? (
              <img src={me.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              '🧑‍🎓'
            )}
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              {me?.fullName || 'Học sinh'}
              {me?.className && (
                <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.85, marginLeft: 10 }}>
                  Lớp {me.className}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 999, fontWeight: 700, fontSize: 13 }}>
                🎖️ {rank}
              </span>
              <span style={{ fontSize: 13, opacity: 0.9 }}>
                Level {level} · {xp} XP
              </span>
              {dash?.streakDays ? (
                <span style={{ fontSize: 13, opacity: 0.9 }}>🔥 {dash.streakDays} ngày</span>
              ) : null}
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden', marginTop: 12, maxWidth: 420 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: '#ffd27a', borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
              {xpNext - xpInLevel} XP nữa → Level {level + 1} ({RANKS[Math.min(level + 1, RANKS.length) - 1]})
            </div>
          </div>
        </div>
      </div>

      {/* Nội dung Trang chủ (tab "Khóa học của tôi" đã tách sang /student/my-courses) */}
      <>

      {/* 📅 Nhiệm vụ tuần này */}
      {weekly && (weekly.upcoming?.length > 0 || weekly.todo?.length > 0) && (
        <div className="card" style={{ marginBottom: 24, padding: 16, borderLeft: '4px solid var(--color-warning, #d97706)' }}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>📅 Nhiệm vụ tuần này</h3>
          {weekly.upcoming?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-warning, #d97706)', marginBottom: 4 }}>
                ⏰ BTVN sắp hết hạn:
              </div>
              {weekly.upcoming.map((t: any) => (
                <div key={t.lessonId + 'up'} style={{ fontSize: 13, padding: '4px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--color-muted)' }}>{t.courseTitle}</span>
                  <Link href={`/student/courses/${t.courseId}`} style={{ fontWeight: 600 }}>
                    📝 {t.examTitle || t.title}
                  </Link>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--color-danger)' }}>
                    hạn {new Date(t.deadline).toLocaleDateString('vi-VN')}
                  </span>
                </div>
              ))}
            </div>
          )}
          {weekly.todo?.length > 0 && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-muted)', marginBottom: 4 }}>
                📖 Bài chưa học ({weekly.totalTodo}):
              </div>
              {weekly.todo.map((t: any) => (
                <div key={t.lessonId + 'td'} style={{ fontSize: 13, padding: '4px 0', display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--color-muted)' }}>{t.courseTitle}</span>
                  <Link href={`/student/courses/${t.courseId}`} style={{ fontWeight: 600 }}>
                    {t.title}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Thẻ XP / Level */}
      <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ textAlign: 'center', minWidth: 90 }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Level
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>
            {level}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span className="mono" style={{ fontWeight: 700, color: 'var(--color-accent)' }}>
              {xp} XP
            </span>
            <span className="mono" style={{ color: 'var(--color-muted)' }}>
              {xpNext - xpInLevel} XP nữa → Level {level + 1}
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--color-rule)', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: 'var(--color-accent)',
                borderRadius: 4,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <Link
              href="/student/leaderboard"
              style={{ fontSize: 13, color: 'var(--color-accent)', textUnderlineOffset: 3 }}
            >
              Xem bảng xếp hạng →
            </Link>
          </div>
        </div>
      </div>

      {/* ===== Ôn tập AI + lịch hạn nộp + streak ===== */}
      {/* align-items: start → thẻ ngắn không bị kéo cao bằng thẻ dài nhất */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 24, alignItems: 'start' }}>
        {/* Ôn tập cá nhân hóa */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>🎯 Ôn tập thông minh</h3>
          {!practice ? (
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Đang phân tích…</p>
          ) : practice.weakTopics?.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>{practice.message}</p>
          ) : (
            <>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <strong>Chủ đề cần luyện:</strong>
                <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                  {practice.weakTopics.map((t: any) => (
                    <li key={t.topicId}>
                      {t.name} <span style={{ color: 'var(--color-danger)' }}>(sai {t.wrong}/{t.total})</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
                {practice.available} câu hỏi sẵn có · GV {practice.teacher?.fullName || ''}
              </p>
              <button
                className="btn"
                style={{ width: '100%' }}
                disabled={creatingPractice || practice.available < 3}
                onClick={createPractice}
              >
                {creatingPractice ? 'Đang tạo đề…' : `⚡ Tạo đề luyện (10 câu)`}
              </button>
            </>
          )}
        </div>

        {/* Lịch hạn nộp BTVN */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>⏰ Bài tập đến hạn</h3>
          {!dash ? (
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Đang tải…</p>
          ) : dash.upcoming.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Không có bài tập nào sắp đến hạn. 🎉</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dash.upcoming.map((u: any, i: number) => (
                <div key={i} style={{ fontSize: 13 }}>
                  <strong>{u.examTitle}</strong>
                  <div style={{ color: 'var(--color-muted)', fontSize: 12 }}>
                    {u.courseTitle} · hạn {new Date(u.deadline).toLocaleString('vi-VN')}
                  </div>
                  {u.examId && (
                    <Link href={`/student/exams/${u.examId}/take`} style={{ fontSize: 12, color: 'var(--color-accent)' }}>
                      Làm ngay →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Streak + hoạt động */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>🔥 Chuỗi học tập</h3>
          {!dash ? (
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Đang tải…</p>
          ) : (
            <>
              <div style={{ fontSize: 26, fontWeight: 700 }}>
                🔥 {dash.streakDays} ngày liên tiếp
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '6px 0 10px' }}>
                Học và làm bài mỗi ngày để duy trì chuỗi!
              </p>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {Array.from({ length: 14 }, (_, i) => {
                  const d = new Date(Date.now() - (13 - i) * 86400000);
                  const key = d.toISOString().slice(0, 10);
                  const active = dash.activeDays?.includes(key);
                  return (
                    <div
                      key={i}
                      title={d.toLocaleDateString('vi-VN')}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        background: active ? 'var(--color-success)' : 'color-mix(in oklch, var(--color-rule) 60%, var(--color-paper))',
                        color: active ? '#fff' : 'var(--color-muted)',
                      }}
                    >
                      {active ? '✓' : ''}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Nhiệm vụ hằng ngày */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>🎯 Nhiệm vụ hôm nay</h3>
          {!quests ? (
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Đang tải…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {quests.quests.map((q: any) => (
                <div
                  key={q.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    padding: '7px 10px',
                    borderRadius: 8,
                    background: q.claimed
                      ? 'color-mix(in oklch, var(--color-success) 10%, var(--color-paper))'
                      : q.done
                        ? 'color-mix(in oklch, var(--color-warning, #d97706) 12%, var(--color-paper))'
                        : 'color-mix(in oklch, var(--color-rule) 35%, var(--color-paper))',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{q.icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {q.label}
                    <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      {' '}
                      +{q.bonus} XP
                    </span>
                  </span>
                  {q.claimed ? (
                    <span style={{ color: 'var(--color-success)', fontSize: 12, fontWeight: 700 }}>✓ Đã nhận</span>
                  ) : q.done ? (
                    <span style={{ color: 'var(--color-warning, #b45309)', fontSize: 12, fontWeight: 700 }}>
                      ✓ Hoàn thành
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>Chưa xong</span>
                  )}
                </div>
              ))}
              {quests.bonusToday > 0 && (
                <p style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600 }}>
                  🎉 +{quests.bonusToday} XP thưởng hôm nay!
                </p>
              )}
            </div>
          )}
        </div>

        {/* Huy hiệu đã đạt */}
        {achievements?.all && (
          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>🏅 Huy hiệu của bạn</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {achievements.all.map((a: any) => (
                <div
                  key={a.code}
                  title={a.name}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--color-rule)',
                    background: a.earned ? '#fff7e0' : 'var(--color-paper)',
                    opacity: a.earned ? 1 : 0.45,
                    minWidth: 76,
                  }}
                >
                  <span style={{ fontSize: 24 }}>{a.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>
                    {a.name}
                  </span>
                  {a.earned && (
                    <span style={{ fontSize: 10, color: 'var(--color-success)', fontWeight: 700 }}>✓</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </>
    </div>
  );
}
