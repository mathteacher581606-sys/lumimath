'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function StudentExams() {
  const router = useRouter();
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Luyện nhanh theo chủ đề
  const [topics, setTopics] = useState<any>(null);
  const [selTopic, setSelTopic] = useState('');
  const [selDiff, setSelDiff] = useState('');
  const [selCount, setSelCount] = useState('10');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState('');

  // Đề đang chuẩn bị vào thi (hiện nội quy trước khi bắt đầu)
  const [lobby, setLobby] = useState<any>(null);

  useEffect(() => {
    load();
    apiFetch('/exams/practice/topics').then(setTopics).catch(() => setTopics({ topics: [], message: 'Chưa tải được chủ đề.' }));
  }, []);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiFetch('/exams/available');
      setExams(data);
    } catch (e: any) {
      setLoadError(e.message || 'Không tải được danh sách đề');
    } finally {
      setLoading(false);
    }
  }

  async function startQuick() {
    if (!selTopic) {
      setQuickError('Em chọn một chủ đề trước nhé');
      return;
    }
    setQuickBusy(true);
    setQuickError('');
    try {
      const data = await apiFetch('/exams/quick-practice', {
        method: 'POST',
        body: JSON.stringify({
          topicId: selTopic,
          difficulty: selDiff || null,
          count: Math.min(20, Math.max(1, Number(selCount) || 10)),
        }),
      });
      router.push(`/student/exams/${data.examId}/take`);
    } catch (e: any) {
      setQuickError(e.message || 'Không tạo được đề luyện');
      setQuickBusy(false);
    }
  }

  // Bắt đầu thi: bật toàn màn hình NGAY trong lúc bấm (trình duyệt chỉ cho phép khi có thao tác của người dùng)
  async function enter(ex: any) {
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      /* điện thoại / trình duyệt không hỗ trợ toàn màn hình */
    }
    router.push(`/student/exams/${ex.id}/take`);
  }

  return (
    <div className="page-container sh">
      <div>
        <h1 className="page-title">Thi thử online</h1>
        <p className="page-subtitle" style={{ marginBottom: 0 }}>
          Làm đề trực tuyến, chấm điểm tự động ngay sau khi nộp bài.
        </p>
      </div>

      {/* ===== Luyện nhanh theo chủ đề ===== */}
      <section className="sh-box" aria-labelledby="qp-h">
        <div>
          <h2 id="qp-h">Luyện nhanh theo chủ đề</h2>
          <p className="sh-muted">Chọn một chủ đề trong ngân hàng đề của giáo viên để luyện ngay, không tính điểm.</p>
        </div>
        {!topics ? (
          <div className="skeleton" style={{ height: 48 }} aria-hidden="true" />
        ) : topics.topics?.length === 0 ? (
          <p className="sh-muted">{topics.message}</p>
        ) : (
          <div className="xl-quick">
            <div className="st-field" style={{ flex: '2 1 220px' }}>
              <label htmlFor="qp-topic">Chủ đề</label>
              <select id="qp-topic" value={selTopic} onChange={(e) => { setSelTopic(e.target.value); setQuickError(''); }}>
                <option value="">— Chọn chủ đề —</option>
                {topics.topics.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.count} câu)
                  </option>
                ))}
              </select>
            </div>
            <div className="st-field" style={{ flex: '1 1 150px' }}>
              <label htmlFor="qp-diff">Độ khó</label>
              <select id="qp-diff" value={selDiff} onChange={(e) => setSelDiff(e.target.value)}>
                <option value="">Tất cả</option>
                <option value="NHAN_BIET">Nhận biết</option>
                <option value="THONG_HIEU">Thông hiểu</option>
                <option value="VAN_DUNG">Vận dụng</option>
                <option value="VAN_DUNG_CAO">Vận dụng cao</option>
              </select>
            </div>
            <div className="st-field" style={{ flex: '0 1 110px' }}>
              <label htmlFor="qp-count">Số câu</label>
              <input id="qp-count" type="number" min={1} max={20} value={selCount} onChange={(e) => setSelCount(e.target.value)} />
            </div>
            <button type="button" className="btn sh-btn-accent xl-quick-btn" disabled={quickBusy} onClick={startQuick}>
              {quickBusy ? 'Đang tạo đề…' : 'Luyện ngay'}
            </button>
          </div>
        )}
        {quickError && (
          <p className="sh-error" role="alert">
            {quickError}
          </p>
        )}
      </section>

      {/* ===== Danh sách đề ===== */}
      <section aria-labelledby="xl-h" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 id="xl-h" style={{ fontSize: 22 }}>
          Đề thi đang mở
        </h2>
        {loading ? (
          <div className="sh-cards" aria-hidden="true">
            {[0, 1, 2].map((k) => (
              <div key={k} className="skeleton" style={{ height: 170, borderRadius: 'var(--radius-card)' }} />
            ))}
          </div>
        ) : loadError ? (
          <div className="sh-box">
            <p className="sh-error" role="alert">
              {loadError}
            </p>
            <button type="button" className="btn btn-outline" style={{ width: 'auto' }} onClick={load}>
              Thử lại
            </button>
          </div>
        ) : exams.length === 0 ? (
          <div className="sh-box" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ fontWeight: 700 }}>Chưa có đề thi nào đang mở</p>
            <p className="sh-muted">Khi giáo viên công khai đề, đề sẽ hiện ở đây.</p>
          </div>
        ) : (
          <div className="sh-cards">
            {exams.map((ex) => {
              const used = ex.myAttempts || 0;
              const max = ex.maxAttempts ?? 3;
              const out = !ex.inProgress && max > 0 && used >= max;
              return (
                <article key={ex.id} className="sh-task xl-card">
                  <span className="sh-task-meta">
                    {ex.teacher?.fullName || 'Giáo viên'} · {ex.duration} phút
                  </span>
                  <h3 className="sh-task-title">{ex.title}</h3>
                  <span className="sh-task-course">
                    {ex._count?.items ?? 0} câu · {ex.totalScore} điểm
                    {used > 0 ? ` · đã làm ${used}${max > 0 ? `/${max}` : ''} lần` : ''}
                  </span>
                  <button
                    type="button"
                    className={`btn ${used > 0 && !ex.inProgress ? 'btn-outline' : 'sh-btn-accent'} xl-go`}
                    disabled={out}
                    onClick={() => setLobby(ex)}
                  >
                    {ex.inProgress ? 'Làm tiếp bài dở' : out ? 'Hết lượt làm bài' : used > 0 ? 'Làm lại' : 'Làm bài'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ===== Nội quy trước khi vào thi ===== */}
      {lobby && (
        <div className="ex-modal-backdrop" onClick={() => setLobby(null)}>
          <div
            className="ex-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lobby-h"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setLobby(null);
            }}
          >
            <h2 id="lobby-h">{lobby.title}</h2>
            <p className="sh-muted">
              {lobby._count?.items ?? 0} câu · {lobby.duration} phút · {lobby.totalScore} điểm
            </p>
            <ul className="xl-rules">
              <li>Đồng hồ bắt đầu chạy ngay khi em vào phòng thi.</li>
              <li>Bài được tự lưu mỗi 15 giây. Mất mạng thì vào lại để làm tiếp.</li>
              <li>Không rời khỏi trang làm bài: rời quá 3 lần, bài sẽ tự nộp.</li>
              <li>Hết giờ, bài sẽ tự nộp.</li>
            </ul>
            <div className="st-actions">
              <button type="button" className="btn btn-outline" onClick={() => setLobby(null)}>
                Để sau
              </button>
              <button type="button" className="btn sh-btn-accent" autoFocus onClick={() => enter(lobby)}>
                Bắt đầu làm bài
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
