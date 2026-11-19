'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import { formatAnswer } from '@/lib/answer';
import LatexRenderer from '@/components/LatexRenderer';
import BackButton from '@/components/BackButton';

// CodeMirror nạp lười — không chặn lần hiển thị đầu
const LatexEditor = dynamic(() => import('@/components/LatexEditor'), {
  ssr: false,
  loading: () => (
    <div className="skeleton" style={{ height: 380, borderRadius: 10 }} aria-label="Đang tải trình soạn LaTeX" />
  ),
});

const PART_LABELS: Record<number, string> = {
  1: 'Phần I — Trắc nghiệm',
  2: 'Phần II — Đúng/Sai',
  3: 'Phần III — Trả lời ngắn',
  4: 'Phần IV — Tự luận',
};

const TYPE_LABEL: Record<string, string> = {
  MCQ: 'Trắc nghiệm',
  TRUE_FALSE: 'Đúng/Sai',
  SHORT_ANSWER: 'Trả lời ngắn',
  ESSAY: 'Tự luận',
};

export default function ImportExamPage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [tex, setTex] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<any[]>([]);
  const [partScores, setPartScores] = useState<Record<number, string>>({});
  const [meta, setMeta] = useState({
    title: '',
    grade: '12',
    topicId: '',
    difficulty: '',
    duration: '45',
    published: true,
    folderId: '',
  });
  const [topics, setTopics] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  // Sửa code inline từng câu + biên dịch lại lời giải
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [parseBusy, setParseBusy] = useState<number | null>(null);
  const [parseErr, setParseErr] = useState<Record<number, string>>({});

  useEffect(() => {
    apiFetch('/bank/topics')
      .then((t) => setTopics(t))
      .catch(() => {});
    apiFetch('/exams/folders')
      .then((f) => setFolders(f))
      .catch(() => {});
  }, []);

  // Bước 1+2: phân tích đề
  async function analyze() {
    if (!tex.trim()) {
      setError('Vui lòng dán code .tex hoặc tải file');
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const data = await apiFetch('/bank/import-exam-preview', {
        method: 'POST',
        body: JSON.stringify({ texSource: tex }),
      });
      if (!data.questions?.length) {
        setError('Không tìm thấy câu hỏi nào (kiểm tra cấu trúc begin{ex}...end{ex})');
        return;
      }
      setQuestions(
        data.questions.map((q: any, idx: number) => ({
          ...q,
          idx,
          // Chỉ TRÙNG CHÍNH XÁC mới tự bỏ qua; "nghi trùng" (gần giống) chỉ cảnh báo, giữ câu mới
          skipBank: !!(q.duplicateOf && q.duplicateOf.exact),
        })),
      );

      // Gợi ý điểm mặc định: chia 10 điểm theo tỉ lệ số câu mỗi phần
      const counts: Record<number, number> = {};
      for (const q of data.questions) {
        counts[q.part] = (counts[q.part] || 0) + 1;
      }
      const total = data.questions.length;
      const scores: Record<number, string> = {};
      for (const [p, c] of Object.entries(counts)) {
        scores[Number(p)] = (Math.round((10 * c) / total * 100) / 100).toString();
      }
      setPartScores(scores);

      setMeta((m) => ({
        ...m,
        title: 'Đề thi ' + new Date().toLocaleDateString('vi-VN'),
      }));
      setStep(2);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  function updateQuestion(idx: number, key: string, value: any) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, [key]: value } : q)),
    );
  }

  function toggleEdit(idx: number) {
    setEditing((prev) => {
      const next = { ...prev };
      if (next[idx] !== undefined) {
        delete next[idx];
        setParseErr((pe) => {
          const n = { ...pe };
          delete n[idx];
          return n;
        });
      } else {
        const q = questions.find((x) => x.idx === idx);
        next[idx] = q?.source || '';
      }
      return next;
    });
  }

  async function reparseQuestion(idx: number) {
    setParseBusy(idx);
    setParseErr((p) => ({ ...p, [idx]: '' }));
    try {
      const r = await apiFetch('/bank/parse-question', {
        method: 'POST',
        body: JSON.stringify({ tex: editing[idx] }),
      });
      setQuestions((prev) =>
        prev.map((q, i) =>
          i === idx
            ? {
                ...q,
                type: r.type,
                content: r.content,
                options: r.options,
                answer: r.answer,
                answerMissing: r.answerMissing,
                solution: r.solution,
                source: editing[idx],
              }
            : q,
        ),
      );
      setEditing((prev) => {
        const n = { ...prev };
        delete n[idx];
        return n;
      });
    } catch (e: any) {
      setParseErr((p) => ({ ...p, [idx]: e.message }));
    } finally {
      setParseBusy(null);
    }
  }

  function handleFile(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setTex(String(reader.result || ''));
    reader.readAsText(file);
  }

  const countByPart: Record<number, number> = {};
  for (const q of questions) {
    countByPart[q.part] = (countByPart[q.part] || 0) + 1;
  }

  // Thư mục dạng cây có thụt lề (mẹ trước, con lùi sau)
  const folderTreeOpts: { id: string; label: string }[] = [];
  (function walk(parentId: string | null, depth: number) {
    for (const f of folders.filter((x) => (x.parentId || null) === parentId)) {
      folderTreeOpts.push({
        id: f.id,
        label: (depth ? '└ '.repeat(depth) + ' ' : '') + f.name,
      });
      walk(f.id, depth + 1);
    }
  })(null, 0);

  // Bước 4: lưu đề thi
  async function saveExam() {
    setSaving(true);
    setError(null);
    try {
      const parts = Object.entries(partScores).map(([p, s]) => ({
        part: Number(p),
        score: Number(s) || 0,
      }));
      const data = await apiFetch('/bank/import-exam-confirm', {
        method: 'POST',
        body: JSON.stringify({
          title: meta.title,
          grade: Number(meta.grade),
          topicId: meta.topicId || null,
          difficulty: meta.difficulty || null,
          duration: Number(meta.duration) || 45,
          published: meta.published,
          folderId: meta.folderId || null,
          texSource: tex,
          parts,
          questions,
        }),
      });
      setResult(data);
      setStep(4);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // ============ KẾT QUẢ ============
  if (step === 4 && result) {
    return (
      <div className="page-container" style={{ maxWidth: 760 }}>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, marginBottom: 10 }}>
            ✓
          </div>
          <h1 className="page-title">Đã lưu đề thi!</h1>
          <p className="mono" style={{ color: 'var(--color-muted)', marginTop: 8 }}>
            {result.itemCount} câu · Tổng {result.totalScore} điểm · {result.importedQuestions} câu đã nạp vào ngân hàng đề
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
            <Link href="/teacher/exams" className="btn" style={{ width: 'auto' }}>
              Về Kho đề thi
            </Link>
            <Link href={`/teacher/exams/${result.id}`} className="btn btn-outline" style={{ width: 'auto' }}>
              Xem chi tiết đề
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: 900 }}>
      <BackButton to="/teacher/exams" label="Về Kho đề thi" />
      <h1 className="page-title">Nhập đề thi</h1>
      <p className="page-subtitle">
        Dán file .tex → AI phân loại câu hỏi → cấu hình điểm → lưu đề vào Kho đề thi (câu hỏi tự động nạp vào ngân hàng đề).
      </p>

      {/* Thanh bước */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
        {[
          '1. Nhập đề',
          '2. Phân loại câu hỏi',
          '3. Cấu hình điểm & thông tin',
          '4. Lưu đề thi',
        ].map((label, i) => (
          <span
            key={i}
            className={step === i + 1 ? 'badge badge-accent' : 'badge'}
            style={{ fontSize: 12, padding: '6px 12px' }}
          >
            {label}
          </span>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {/* ===== BƯỚC 1: nhập đề ===== */}
      {step === 1 && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong>Code LaTeX của đề thi</strong>
              <label className="btn btn-outline" style={{ width: 'auto', padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}>
                Tải file .tex
                <input type="file" accept=".tex,text/plain" onChange={handleFile} style={{ display: 'none' }} />
              </label>
            </div>
            <LatexEditor value={tex} onChange={setTex} height="380px" />
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 8 }}>
              Đề có thể dùng môi trường ex_test (begin{'{}'}ex ... end{'{}'}ex) hoặc chứa câu hỏi thường. Hệ thống sẽ tách câu hỏi và AI phân loại.
            </p>
          </div>
          <button className="btn" onClick={analyze} disabled={analyzing}>
            {analyzing ? '⏳ AI đang phân tích…' : 'Phân tích đề (AI) →'}
          </button>
        </div>
      )}

      {/* ===== BƯỚC 2: phân loại câu hỏi ===== */}
      {step === 2 && (
        <div>
          <p style={{ fontSize: 14, color: 'var(--color-muted)', marginBottom: 14 }}>
            AI đã phân loại thô — kiểm tra và chỉnh lại phần, chủ đề, lớp, độ khó cho từng câu:
          </p>
          {[1, 2, 3, 4].map((part) => {
            const partQuestions = questions
              .map((q, i) => ({ ...q, idx: i }))
              .filter((q) => q.part === part);
            if (!partQuestions.length) return null;
            return (
              <div key={part} style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, marginBottom: 8 }}>
                  {PART_LABELS[part]} <span className="mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>({partQuestions.length} câu)</span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {partQuestions.map((q) => (
                    <div key={q.idx} className="card" style={{ padding: 14 }}>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span className="badge badge-accent">Câu {q.idx + 1}</span>
                        <span className="badge">{TYPE_LABEL[q.type]}</span>
                        {q.answerMissing && (
                          <span className="badge badge-danger" title="Đề gốc không có dấu \True nên hệ thống không tự xác định được đáp án">
                            ⚠️ Chưa xác định đáp án
                          </span>
                        )}
                        {q.duplicateOf && (
                          <>
                            <span className="badge badge-danger">
                              ⚠️ Nghi trùng câu {q.duplicateOf.code} trong kho
                            </span>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginLeft: 'auto', fontWeight: 700, color: 'var(--color-danger)' }}>
                              <input
                                type="checkbox"
                                checked={!!q.skipBank}
                                onChange={(e) => updateQuestion(q.idx, 'skipBank', e.target.checked)}
                                style={{ width: 'auto' }}
                              />
                              Bỏ qua (dùng câu có sẵn, không nhập thêm vào ngân hàng)
                            </label>
                          </>
                        )}
                      </div>
                      {q.duplicateOf && (
                        <div style={{ fontSize: 12.5, marginBottom: 8, border: '1px dashed color-mix(in oklch, var(--color-danger) 45%, transparent)', borderRadius: 6, padding: 8, background: 'var(--color-surface)' }}>
                          <div style={{ fontWeight: 800, color: 'var(--color-danger)', marginBottom: 4 }}>
                            📄 Câu đã có trong kho (để so sánh):
                          </div>
                          <div style={{ maxHeight: 100, overflowY: 'auto' }}>
                            <LatexRenderer content={(q.duplicateOf.content || '').slice(0, 400)} />
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: 14, marginBottom: 6 }}>
                        <LatexRenderer content={q.content} />
                      </div>
                      {q.options && Array.isArray(q.options) && q.options.length > 0 && (
                        <div style={{ fontSize: 13, paddingLeft: 10, marginBottom: 8, color: 'var(--color-muted)' }}>
                          {q.options.map((opt: any) => (
                            <div key={opt.id} style={{ display: 'flex', gap: 6 }}>
                              <strong>{opt.id}.</strong>
                              <span style={{ flex: 1, minWidth: 0 }}><LatexRenderer content={opt.text} /></span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* 💡 Lời giải (biên dịch) */}
                      {q.solution && (
                        <div
                          style={{
                            marginBottom: 8,
                            fontSize: 12.5,
                            background: 'color-mix(in oklch, var(--color-success) 8%, var(--color-paper))',
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '1px solid color-mix(in oklch, var(--color-success) 25%, transparent)',
                          }}
                        >
                          <strong style={{ color: 'var(--color-success)' }}>💡 Lời giải:</strong>{' '}
                          <LatexRenderer content={q.solution} />
                        </div>
                      )}

                      {/* ✏️ Sửa code inline từng câu */}
                      <button
                        type="button"
                        className="lm-filter-btn"
                        style={{ fontSize: 12, padding: '3px 10px', marginBottom: 8 }}
                        onClick={() => toggleEdit(q.idx)}
                      >
                        {editing[q.idx] !== undefined ? '✕ Đóng sửa code' : '✏️ Sửa code câu này'}
                      </button>
                      {editing[q.idx] !== undefined && (
                        <div style={{ marginBottom: 8 }}>
                          <textarea
                            value={editing[q.idx]}
                            onChange={(e) => setEditing((p) => ({ ...p, [q.idx]: e.target.value }))}
                            rows={5}
                            spellCheck={false}
                            style={{
                              width: '100%',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 12,
                              padding: 8,
                              borderRadius: 6,
                              border: '1px solid var(--color-rule)',
                              background: 'var(--color-paper)',
                              color: 'var(--color-ink)',
                              lineHeight: 1.5,
                            }}
                          />
                          {parseErr[q.idx] && (
                            <div style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: 4 }}>
                              ⚠️ {parseErr[q.idx]}
                            </div>
                          )}
                          <button
                            type="button"
                            className="btn"
                            style={{ width: 'auto', marginTop: 6, fontSize: 12, padding: '5px 12px' }}
                            disabled={parseBusy === q.idx}
                            onClick={() => reparseQuestion(q.idx)}
                          >
                            {parseBusy === q.idx ? '⏳ Đang biên dịch…' : '✅ Biên dịch lại câu này'}
                          </button>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <div className="form-group" style={{ width: 170, marginBottom: 0 }}>
                          <label style={{ fontSize: 12 }}>Phần</label>
                          <select
                            value={String(q.part)}
                            onChange={(e) => updateQuestion(q.idx, 'part', Number(e.target.value))}
                            style={{ padding: '6px 8px', fontSize: 13 }}
                          >
                            <option value="1">Phần I — Trắc nghiệm</option>
                            <option value="2">Phần II — Đúng/Sai</option>
                            <option value="3">Phần III — Trả lời ngắn</option>
                            <option value="4">Phần IV — Tự luận</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
                          <label style={{ fontSize: 12 }}>Chủ đề</label>
                          <input
                            value={q.topicName}
                            onChange={(e) => updateQuestion(q.idx, 'topicName', e.target.value)}
                            placeholder="AI gợi ý…"
                            style={{ padding: '6px 8px', fontSize: 13 }}
                          />
                        </div>
                        <div className="form-group" style={{ width: 90, marginBottom: 0 }}>
                          <label style={{ fontSize: 12 }}>Lớp</label>
                          <select
                            value={String(q.grade || '')}
                            onChange={(e) => updateQuestion(q.idx, 'grade', e.target.value ? Number(e.target.value) : null)}
                            style={{ padding: '6px 8px', fontSize: 13 }}
                          >
                            <option value="">—</option>
                            <option value="10">10</option>
                            <option value="11">11</option>
                            <option value="12">12</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ width: 140, marginBottom: 0 }}>
                          <label style={{ fontSize: 12 }}>Độ khó</label>
                          <select
                            value={q.difficulty || ''}
                            onChange={(e) => updateQuestion(q.idx, 'difficulty', e.target.value)}
                            style={{ padding: '6px 8px', fontSize: 13 }}
                          >
                            <option value="">—</option>
                            <option value="NHAN_BIET">Nhận biết</option>
                            <option value="THONG_HIEU">Thông hiểu</option>
                            <option value="VAN_DUNG">Vận dụng</option>
                            <option value="VAN_DUNG_CAO">Vận dụng cao</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ flex: 1, minWidth: 170, marginBottom: 0 }}>
                          <label style={{ fontSize: 12 }}>Dạng bài (AI phân loại)</label>
                          <input
                            value={q.form || ''}
                            onChange={(e) => updateQuestion(q.idx, 'form', e.target.value)}
                            placeholder="VD: Phương trình mặt phẳng, Khoảng cách điểm–mặt…"
                            style={{ padding: '6px 8px', fontSize: 13 }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" style={{ width: 'auto' }} onClick={() => setStep(1)}>
              ← Quay lại
            </button>
            <button className="btn" onClick={() => setStep(3)}>
              Cấu hình điểm →
            </button>
          </div>
        </div>
      )}

      {/* ===== BƯỚC 3: cấu hình điểm + thông tin ===== */}
      {step === 3 && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Điểm từng phần</h3>
            {[1, 2, 3, 4].map((part) => {
              if (!countByPart[part]) return null;
              const per = countByPart[part]
                ? (Math.round(((Number(partScores[part]) || 0) / countByPart[part]) * 100) / 100).toString()
                : '0';
              return (
                <div key={part} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 200, fontSize: 14 }}>{PART_LABELS[part]}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>{countByPart[part]} câu</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>= {per} điểm/câu</span>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={partScores[part] || ''}
                    onChange={(e) => setPartScores((prev) => ({ ...prev, [part]: e.target.value }))}
                    style={{ width: 90, padding: '8px', border: '1px solid var(--color-rule)', borderRadius: 6, background: 'var(--color-paper)', color: 'var(--color-ink)' }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>điểm/phần</span>
                </div>
              );
            })}
            <p className="mono" style={{ fontSize: 13, marginTop: 6 }}>
              Tổng:{' '}
              {Math.round(Object.values(partScores).reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100}{' '}
              điểm
            </p>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Thông tin đề thi</h3>
            <div className="form-group">
              <label>Tên đề thi *</label>
              <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} required />
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
                <label>Lớp</label>
                <select value={meta.grade} onChange={(e) => setMeta({ ...meta, grade: e.target.value })}>
                  <option value="10">Lớp 10</option>
                  <option value="11">Lớp 11</option>
                  <option value="12">Lớp 12</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
                <label>Chủ đề</label>
                <select value={meta.topicId} onChange={(e) => setMeta({ ...meta, topicId: e.target.value })}>
                  <option value="">— Không phân loại —</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 130 }}>
                <label>Độ khó chung</label>
                <select value={meta.difficulty} onChange={(e) => setMeta({ ...meta, difficulty: e.target.value })}>
                  <option value="">— Không xác định —</option>
                  <option value="NHAN_BIET">Nhận biết</option>
                  <option value="THONG_HIEU">Thông hiểu</option>
                  <option value="VAN_DUNG">Vận dụng</option>
                  <option value="VAN_DUNG_CAO">Vận dụng cao</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 100 }}>
                <label>Thời gian (phút)</label>
                <input type="number" value={meta.duration} onChange={(e) => setMeta({ ...meta, duration: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>📁 Lưu vào thư mục (Kho đề thi)</label>
              <select
                value={meta.folderId}
                onChange={(e) => setMeta({ ...meta, folderId: e.target.value })}
              >
                <option value="">— Không thư mục —</option>
                {folderTreeOpts.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
                Chưa chọn cũng được — vào Kho đề thi bấm ✏️ Sửa để chọn lại.
              </p>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={meta.published}
                onChange={(e) => setMeta({ ...meta, published: e.target.checked })}
                style={{ width: 'auto' }}
              />
              <label style={{ margin: 0 }}>Công khai cho học sinh thi thử</label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-outline" style={{ width: 'auto' }} onClick={() => setStep(2)}>
              ← Quay lại
            </button>
            <button className="btn" style={{ flex: 1 }} onClick={saveExam} disabled={saving}>
              {saving ? 'Đang lưu…' : 'Lưu đề thi & câu hỏi vào ngân hàng'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
