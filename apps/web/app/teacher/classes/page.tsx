'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function TeacherClassesPage() {
  const [classes, setClasses] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [scoreboard, setScoreboard] = useState<any>(null);
  const [loadingBoard, setLoadingBoard] = useState(false);

  useEffect(() => {
    loadClasses();
  }, []);

  async function loadClasses() {
    try {
      const data = await apiFetch('/reports/classes');
      setClasses(data);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function openClass(name: string) {
    if (selected === name) {
      setSelected(null);
      setScoreboard(null);
      return;
    }
    setSelected(name);
    setLoadingBoard(true);
    setScoreboard(null);
    try {
      const data = await apiFetch(`/reports/class?name=${encodeURIComponent(name)}`);
      setScoreboard(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoadingBoard(false);
    }
  }

  async function exportClass(format: 'pdf' | 'xlsx') {
    if (!selected) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/reports/class/export?name=${encodeURIComponent(selected)}&format=${format}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || 'Xuất thất bại').slice(-300));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = format === 'pdf' ? 'bang-diem-lop.pdf' : 'bang-diem-lop.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Không xuất được: ' + e.message);
    }
  }

  // Tải phiếu điểm cá nhân (PDF cho phụ huynh)
  async function downloadStudentReport(studentId: string, fullName: string) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/reports/student/${studentId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || 'Không tải được phiếu điểm').slice(-300));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `phieu-diem-${fullName}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Không tải được: ' + e.message);
    }
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Điểm theo lớp</h1>
      <p className="page-subtitle">
        Xem và xuất bảng điểm của học sinh theo từng lớp học.
      </p>

      {classes === null ? (
        <p>Đang tải…</p>
      ) : classes.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 44, color: 'var(--color-muted)' }}>
          <p>Chưa có lớp học nào. Học sinh tham gia khóa học của bạn sẽ tự động được nhóm theo lớp.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {classes.map((c) => (
            <div key={c.name}>
              <div
                className="card"
                style={{
                  padding: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderLeft: selected === c.name ? '4px solid var(--color-accent)' : undefined,
                }}
                onClick={() => openClass(c.name)}
              >
                <div>
                  <strong style={{ fontSize: 15 }}>🏫 {c.name}</strong>
                  <span style={{ fontSize: 13, color: 'var(--color-muted)', marginLeft: 10 }}>
                    {c.count} học sinh
                  </span>
                </div>
                <span style={{ color: 'var(--color-muted)' }}>{selected === c.name ? '▲' : '▼'}</span>
              </div>

              {selected === c.name && (
                <div className="card" style={{ marginTop: 8, padding: 16 }}>
                  {loadingBoard ? (
                    <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Đang tải bảng điểm…</p>
                  ) : scoreboard && scoreboard.students.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                      Chưa có học sinh thuộc lớp này.
                    </p>
                  ) : scoreboard ? (
                    <>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <button
                          className="btn btn-outline"
                          style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                          onClick={() => exportClass('pdf')}
                        >
                          📄 Xuất PDF
                        </button>
                        <button
                          className="btn btn-outline"
                          style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                          onClick={() => exportClass('xlsx')}
                        >
                          📊 Xuất Excel
                        </button>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-rule)' }}>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Học sinh</th>
                              {scoreboard.exams.map((e: any) => (
                                <th key={e.id} style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, color: 'var(--color-muted)' }} title={e.title}>
                                  {e.title.slice(0, 18)}
                                </th>
                              ))}
                              <th style={{ padding: '6px 8px', textAlign: 'center', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>TB</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Phiếu điểm</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scoreboard.students.map((s: any) => (
                              <tr key={s.student.id} style={{ borderBottom: '1px solid var(--color-rule)' }}>
                                <td style={{ padding: '6px 8px' }}>
                                  <strong>{s.student.fullName}</strong>{' '}
                                  <span className="mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>
                                    {s.student.studentCode}
                                  </span>
                                </td>
                                {scoreboard.exams.map((e: any) => (
                                  <td key={e.id} style={{ padding: '6px 8px', textAlign: 'center' }}>
                                    <span className="mono" style={{ fontWeight: 600 }}>
                                      {s.scores[e.id] === null ? '—' : `${s.scores[e.id]}/${e.totalScore}`}
                                    </span>
                                  </td>
                                ))}
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                  <span className="mono" style={{ fontWeight: 700 }}>
                                    {s.avg === null ? '—' : s.avg}
                                  </span>
                                </td>
                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                  <button
                                    className="btn btn-outline"
                                    style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }}
                                    title="Tải phiếu điểm cá nhân (PDF cho phụ huynh)"
                                    onClick={() => downloadStudentReport(s.student.id, s.student.fullName)}
                                  >
                                    📄 Phiếu
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
