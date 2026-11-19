'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '@/lib/api';
import { SkeletonRows } from '@/components/Skeleton';

export default function LeaderboardPage() {
  const [tab, setTab] = useState<'rank' | 'achievements'>('rank');
  const [board, setBoard] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    setMe(getUser());
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [boardData, achData] = await Promise.all([
        apiFetch('/gamification/leaderboard'),
        apiFetch('/gamification/achievements'),
      ]);
      setBoard(boardData);
      setAchievements(achData);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading)
    return (
      <div className="page-container">
        <h1 className="page-title">Bảng xếp hạng</h1>
        <SkeletonRows count={8} />
      </div>
    );

  return (
    <div className="page-container">
      <h1 className="page-title">Bảng xếp hạng</h1>
      <p className="page-subtitle">
        Tích lũy XP bằng cách làm bài thi. Mỗi điểm = 10 XP.
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-rule)', marginBottom: 20 }}>
        <button
          onClick={() => setTab('rank')}
          style={{
            padding: '10px 18px',
            background: 'transparent',
            border: 'none',
            borderBottom: tab === 'rank' ? '2px solid var(--color-accent)' : '2px solid transparent',
            color: tab === 'rank' ? 'var(--color-accent)' : 'var(--color-muted)',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}
        >
          Xếp hạng
        </button>
        <button
          onClick={() => setTab('achievements')}
          style={{
            padding: '10px 18px',
            background: 'transparent',
            border: 'none',
            borderBottom: tab === 'achievements' ? '2px solid var(--color-accent)' : '2px solid transparent',
            color: tab === 'achievements' ? 'var(--color-accent)' : 'var(--color-muted)',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}
        >
          Thành tích
        </button>
      </div>

      {tab === 'rank' ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {board.length === 0 ? (
            <p style={{ padding: 24, color: 'var(--color-muted)' }}>
              Chưa có dữ liệu xếp hạng.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-rule)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hạng</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Học sinh</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lớp</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Level</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>XP</th>
                </tr>
              </thead>
              <tbody>
                {board.map((u) => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid var(--color-rule)',
                      background: u.id === me?.id ? 'color-mix(in oklch, var(--color-accent) 7%, transparent)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <span className="mono" style={{ fontWeight: 700 }}>
                        {u.rank <= 3 ? ['🥇', '🥈', '🥉'][u.rank - 1] : `#${u.rank}`}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: u.id === me?.id ? 700 : 500 }}>
                      {u.fullName}
                      {u.id === me?.id && <span style={{ color: 'var(--color-accent)', marginLeft: 6 }}>(bạn)</span>}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--color-muted)' }}>
                      {u.className || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="badge badge-accent">Lv {u.level}</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span className="mono" style={{ fontWeight: 700 }}>{u.xp}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div>
          {achievements?.all?.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {achievements.all.map((a: any) => (
                <div
                  key={a.code}
                  className="card"
                  style={{
                    opacity: a.earned ? 1 : 0.55,
                    borderColor: a.earned ? 'color-mix(in oklch, var(--color-accent) 40%, transparent)' : 'var(--color-rule)',
                  }}
                >
                  <div style={{ fontSize: 26, marginBottom: 6 }}>{a.icon}</div>
                  <strong style={{ fontSize: 14 }}>{a.name}</strong>
                  <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>{a.desc}</p>
                  <div style={{ marginTop: 8 }}>
                    {a.earned ? (
                      <span className="badge badge-success">
                        Đã đạt · {a.earnedAt ? new Date(a.earnedAt).toLocaleDateString('vi-VN') : ''}
                      </span>
                    ) : (
                      <span className="badge">Chưa mở khóa</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--color-muted)' }}>Chưa có thành tích nào.</p>
          )}
        </div>
      )}
    </div>
  );
}
