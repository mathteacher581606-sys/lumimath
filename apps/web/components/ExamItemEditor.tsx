'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import LatexRenderer from '@/components/LatexRenderer';

/**
 * Sửa câu hỏi NGAY TRONG ĐỀ (nội dung, lựa chọn, đáp án, lời giải).
 * Lưu → cập nhật câu gốc trong ngân hàng + tạo lại mã .tex của mọi đề đang dùng câu này.
 * Có xem trước LaTeX trực tiếp và tuỳ chọn chấm lại bài đã nộp khi đổi đáp án.
 */
export default function ExamItemEditor({
  examId,
  item,
  onSaved,
  onCancel,
}: {
  examId: string;
  item: any;
  onSaved: (msg: string) => void;
  onCancel: () => void;
}) {
  const q = item.question;
  const [content, setContent] = useState<string>(q.content || '');
  const [solution, setSolution] = useState<string>(q.solution || '');
  const [options, setOptions] = useState<any[]>(
    Array.isArray(q.options) ? q.options.map((o: any) => ({ id: o.id, text: o.text || '' })) : [],
  );
  const [answer, setAnswer] = useState<any>(
    q.type === 'TRUE_FALSE' ? { ...(q.answer || {}) } : q.type === 'ESSAY' ? q.answer : q.answer ?? '',
  );
  const [usage, setUsage] = useState<any[] | null>(null);
  const [regrade, setRegrade] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch(`/exams/${examId}/items/${item.id}/usage`)
      .then((d) => setUsage(d.exams || []))
      .catch(() => setUsage([]));
  }, [examId, item.id]);

  const answerChanged = JSON.stringify(answer) !== JSON.stringify(q.answer ?? (q.type === 'TRUE_FALSE' ? {} : ''));
  const attempts = (usage || []).reduce((s, e) => s + (e.attempts || 0), 0);
  const otherExams = (usage || []).filter((e) => e.id !== examId);

  function setOpt(i: number, text: string) {
    setOptions((prev) => prev.map((o, k) => (k === i ? { ...o, text } : o)));
  }

  async function save() {
    setErr('');
    if (!content.trim()) {
      setErr('Nội dung câu hỏi không được trống');
      return;
    }
    if (q.type === 'TRUE_FALSE' && options.some((o) => typeof answer?.[o.id] !== 'boolean')) {
      setErr('Chọn Đúng hoặc Sai cho từng ý');
      return;
    }
    if (q.type === 'SHORT_ANSWER' && !String(answer ?? '').trim()) {
      setErr('Nhập đáp án cho câu trả lời ngắn');
      return;
    }
    setBusy(true);
    try {
      const body: any = { content, solution };
      if (options.length) body.options = options;
      if (q.type !== 'ESSAY') body.answer = answer;
      if (answerChanged && attempts > 0) body.regrade = regrade;
      const r = await apiFetch(`/exams/${examId}/items/${item.id}/question`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onSaved(
        `Đã lưu câu hỏi và cập nhật ngân hàng${r.exams > 1 ? ` · ${r.exams} đề dùng câu này đã được cập nhật` : ''}${
          r.regraded ? ` · chấm lại ${r.regraded} bài` : ''
        }`,
      );
    } catch (e: any) {
      setErr(e.message || 'Không lưu được');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="qe" role="region" aria-label={`Sửa câu ${item.order}`}>
      {usage && (otherExams.length > 0 || attempts > 0) && (
        <p className="qe-warn" role="note">
          {otherExams.length > 0 && (
            <>
              Câu này còn dùng trong <b>{otherExams.length} đề khác</b> ({otherExams.slice(0, 3).map((e) => e.title).join(', ')}
              {otherExams.length > 3 ? '…' : ''}) — sửa ở đây sẽ áp dụng cho tất cả.{' '}
            </>
          )}
          {attempts > 0 && <>Đã có <b>{attempts} bài nộp</b> với câu này.</>}
        </p>
      )}

      <div className="qe-grid">
        <div className="st-field">
          <label htmlFor={`qe-c-${item.id}`}>Nội dung câu hỏi (LaTeX)</label>
          <textarea
            id={`qe-c-${item.id}`}
            className="ex-input qe-code"
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="qe-preview" aria-label="Xem trước">
          <span className="rv-label">Xem trước</span>
          <LatexRenderer content={content} />
        </div>
      </div>

      {/* Trắc nghiệm: sửa lựa chọn + chọn đáp án đúng */}
      {(q.type === 'MCQ' || q.type === 'MULTI_ANSWER') && options.length > 0 && (
        <fieldset className="qe-set">
          <legend>Lựa chọn · bấm chữ cái để đặt đáp án đúng</legend>
          {options.map((o, i) => {
            const isKey =
              q.type === 'MULTI_ANSWER'
                ? Array.isArray(answer) && answer.includes(o.id)
                : String(answer) === String(o.id);
            return (
              <div key={o.id} className="qe-opt">
                <button
                  type="button"
                  className={`qe-key${isKey ? ' is-on' : ''}`}
                  aria-pressed={isKey}
                  aria-label={`Đặt ${o.id} là đáp án đúng`}
                  onClick={() =>
                    q.type === 'MULTI_ANSWER'
                      ? setAnswer((prev: any) => {
                          const cur: string[] = Array.isArray(prev) ? prev : [];
                          return cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id].sort();
                        })
                      : setAnswer(o.id)
                  }
                >
                  {o.id}
                </button>
                <input
                  className="ex-input qe-code"
                  aria-label={`Lựa chọn ${o.id}`}
                  value={o.text}
                  onChange={(e) => setOpt(i, e.target.value)}
                  spellCheck={false}
                />
                <span className="qe-opt-prev">
                  <LatexRenderer content={o.text} />
                </span>
              </div>
            );
          })}
        </fieldset>
      )}

      {/* Đúng/Sai: sửa từng mệnh đề + Đúng/Sai */}
      {q.type === 'TRUE_FALSE' && options.length > 0 && (
        <fieldset className="qe-set">
          <legend>Các mệnh đề</legend>
          {options.map((o, i) => (
            <div key={o.id} className="qe-opt">
              <b className="qe-tf-id">{o.id})</b>
              <input
                className="ex-input qe-code"
                aria-label={`Mệnh đề ${o.id}`}
                value={o.text}
                onChange={(e) => setOpt(i, e.target.value)}
                spellCheck={false}
              />
              <span className="ex-tf-btns">
                <button
                  type="button"
                  className={`ex-tf-btn is-true${answer?.[o.id] === true ? ' is-on' : ''}`}
                  aria-pressed={answer?.[o.id] === true}
                  onClick={() => setAnswer((p: any) => ({ ...p, [o.id]: true }))}
                >
                  Đúng
                </button>
                <button
                  type="button"
                  className={`ex-tf-btn is-false${answer?.[o.id] === false ? ' is-on' : ''}`}
                  aria-pressed={answer?.[o.id] === false}
                  onClick={() => setAnswer((p: any) => ({ ...p, [o.id]: false }))}
                >
                  Sai
                </button>
              </span>
            </div>
          ))}
        </fieldset>
      )}

      {q.type === 'SHORT_ANSWER' && (
        <div className="st-field" style={{ maxWidth: 320 }}>
          <label htmlFor={`qe-a-${item.id}`}>Đáp án (trả lời ngắn)</label>
          <input
            id={`qe-a-${item.id}`}
            className="ex-input"
            value={String(answer ?? '')}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
      )}

      <div className="st-field">
        <label htmlFor={`qe-s-${item.id}`}>Lời giải (LaTeX)</label>
        <textarea
          id={`qe-s-${item.id}`}
          className="ex-input qe-code"
          rows={4}
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          spellCheck={false}
        />
      </div>

      {answerChanged && attempts > 0 && q.type !== 'ESSAY' && (
        <label className="st-switch">
          <input type="checkbox" checked={regrade} onChange={(e) => setRegrade(e.target.checked)} />
          Chấm lại {attempts} bài đã nộp theo đáp án mới (học sinh được thông báo nếu điểm thay đổi)
        </label>
      )}

      {err && (
        <p className="sh-error" role="alert">
          {err}
        </p>
      )}
      <div className="st-actions">
        <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancel}>
          Hủy
        </button>
        <button type="button" className="btn sh-btn-accent" disabled={busy} onClick={save}>
          {busy ? 'Đang lưu…' : 'Lưu câu hỏi'}
        </button>
      </div>
    </div>
  );
}
