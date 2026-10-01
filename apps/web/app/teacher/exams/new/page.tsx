'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

const TYPE_LABEL: Record<string, string> = {
  MCQ: 'Trắc nghiệm',
  TRUE_FALSE: 'Đúng/Sai',
  SHORT_ANSWER: 'Trả lời ngắn',
  ESSAY: 'Tự luận',
};

export default function CreateExamPage() {
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState('12');
  const [duration, setDuration] = useState('45');
  const [parts, setParts] = useState([
    { type: 'MCQ', count: 5, score: 0.25 },
  ]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  function addPart() {
    setParts([...parts, { type: 'MCQ', count: 1, score: 0.25 }]);
  }

  function updatePart(i: number, key: string, value: any) {
    const newParts = [...parts];
    newParts[i] = { ...newParts[i], [key]: value };
    setParts(newParts);
  }

  function removePart(i: number) {
    setParts(parts.filter((_, idx) => idx !== i));
  }

  async function createExam(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const body: any = { title, duration: Number(duration) };
      if (grade) body.grade = Number(grade);
      body.matrix = {
        parts: parts.map((p) => ({
          type: p.type,
          count: Number(p.count),
          score: Number(p.score),
        })),
      };
      const data = await apiFetch('/exams', { method: 'POST', body: JSON.stringify(body) });
      setResult(data);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function downloadTex() {
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:4000/api/exams/${result.id}/tex`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'de_thi.tex';
    a.click();
  }

  async function downloadPdf() {
    const token = localStorage.getItem('token');
    const res = await fetch(`http://localhost:4000/api/exams/${result.id}/compile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Compile thất bại' }));
      alert(err.message);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'de_thi.pdf';
    a.click();
  }

  return (
    <div className="page-container" style={{ maxWidth: 800 }}>
      <h2 style={{ marginBottom: 20 }}>Tạo đề thi theo ma trận</h2>

      <form
        onSubmit={createExam}
        style={{
          background: '#fff',
          padding: 20,
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <div className="form-group">
          <label>Tên đề thi *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Lớp</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="10">Lớp 10</option>
              <option value="11">Lớp 11</option>
              <option value="12">Lớp 12</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Thời gian (phút)</label>
            <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontWeight: 600 }}>Ma trận đề (các phần)</label>
            <button type="button" className="btn" style={{ width: 'auto', padding: '6px 14px' }} onClick={addPart}>
              + Thêm phần
            </button>
          </div>

          {parts.map((p, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: 10,
                background: '#f9fafb',
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <span style={{ fontWeight: 700, width: 24 }}>{i + 1}.</span>
              <select
                value={p.type}
                onChange={(e) => updatePart(i, 'type', e.target.value)}
                style={{ flex: 2, padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
              >
                <option value="MCQ">Trắc nghiệm</option>
                <option value="TRUE_FALSE">Đúng/Sai</option>
                <option value="SHORT_ANSWER">Trả lời ngắn</option>
                <option value="ESSAY">Tự luận</option>
              </select>
              <input
                type="number"
                min={1}
                value={p.count}
                onChange={(e) => updatePart(i, 'count', e.target.value)}
                placeholder="Số câu"
                style={{ width: 80, padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
              />
              <input
                type="number"
                step="0.25"
                min={0}
                value={p.score}
                onChange={(e) => updatePart(i, 'score', e.target.value)}
                placeholder="Điểm/câu"
                style={{ width: 90, padding: 8, border: '1px solid #ddd', borderRadius: 8 }}
              />
              {parts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePart(i)}
                  style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}
                >
                  Xóa
                </button>
              )}
            </div>
          ))}
        </div>

        <button className="btn" disabled={saving}>
          {saving ? 'Đang sinh đề...' : 'Tạo đề thi'}
        </button>
      </form>

      {result && (
        <div
          style={{
            marginTop: 20,
            background: '#f0fdf4',
            padding: 20,
            borderRadius: 12,
            border: '1px solid #bbf7d0',
          }}
        >
          <h3 style={{ color: '#16a34a' }}>✅ Đề đã tạo thành công!</h3>
          <p style={{ marginTop: 8 }}>
            Tổng điểm: <strong>{result.totalScore}</strong> · Số câu: <strong>{result.itemCount}</strong>
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button className="btn" style={{ width: 'auto' }} onClick={downloadTex}>
              📄 Tải file .tex
            </button>
            <button className="btn" style={{ width: 'auto', background: '#16a34a' }} onClick={downloadPdf}>
              📑 Tải PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
