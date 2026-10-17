'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

// GV chốt điểm + nhận xét cho 1 câu tự luận trong bài thi
export default function EssayFinalize({
  examId,
  attemptId,
  itemId,
  maxScore,
  initialScore,
  initialComment,
  onDone,
}: {
  examId: string;
  attemptId: string;
  itemId: string;
  maxScore: number;
  initialScore: number | string;
  initialComment: string;
  onDone: () => void;
}) {
  const [score, setScore] = useState(
    initialScore === null || initialScore === undefined || initialScore === ''
      ? ''
      : String(initialScore),
  );
  const [comment, setComment] = useState(initialComment || '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    const s = Number(score);
    if (isNaN(s) || s < 0 || s > maxScore) {
      alert(`Điểm phải từ 0 đến ${maxScore}`);
      return;
    }
    setBusy(true);
    try {
      await apiFetch(
        `/exams/${examId}/attempts/${attemptId}/essays/${itemId}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ finalScore: s, finalComment: comment }),
        },
      );
      setDone(true);
      setTimeout(onDone, 600);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-success)', fontWeight: 600 }}>
        ✅ Đã chốt điểm & gửi nhận xét cho học sinh
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        background: 'color-mix(in oklch, var(--color-success) 7%, var(--color-paper))',
        borderRadius: 8,
        border: '1px dashed var(--color-success)',
      }}
    >
      <strong style={{ fontSize: 13 }}>✅ Chốt điểm câu tự luận</strong>
      <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ width: 130, marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Điểm (0 – {maxScore})</label>
          <input
            type="number"
            min={0}
            max={maxScore}
            step={0.25}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="VD: 1.5"
          />
        </div>
        <div className="form-group" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>📝 Nhận xét của thầy cô</label>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Nhận xét về bài làm và trình bày..."
          />
        </div>
        <button
          className="btn"
          style={{ width: 'auto', alignSelf: 'flex-end', padding: '8px 16px', fontSize: 13 }}
          onClick={save}
          disabled={busy}
        >
          {busy ? 'Đang lưu…' : 'Chốt điểm'}
        </button>
      </div>
    </div>
  );
}
