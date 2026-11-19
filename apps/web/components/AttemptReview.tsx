'use client';

import { useMemo, useState } from 'react';
import LatexRenderer from '@/components/LatexRenderer';
import { formatAnswer } from '@/lib/answer';

/**
 * Xem lại bài làm (dùng chung: màn hình kết quả sau khi nộp + Lịch sử làm bài).
 * - Tóm tắt: số câu đúng / sai / chưa trọn điểm / chờ chấm, danh sách số câu sai bấm để nhảy tới.
 * - Lọc: Tất cả · Câu sai · Câu đúng.
 * - Mỗi câu: bài làm của em đặt cạnh đáp án đúng (nếu giáo viên cho xem đáp án).
 */

type Status = 'right' | 'partial' | 'wrong' | 'pending';

const norm = (v: any) =>
  String(v ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();

function statusOf(r: any): Status {
  if (r.pending) return 'pending';
  if (r.finalScore !== null && r.finalScore !== undefined) {
    if (r.maxScore && r.finalScore >= r.maxScore) return 'right';
    return r.finalScore > 0 ? 'partial' : 'wrong';
  }
  if (r.correct) return 'right';
  if (r.tfDetail && r.tfDetail.fraction > 0) return 'partial';
  if (typeof r.earned === 'number' && r.earned > 0) return 'partial';
  return 'wrong';
}

const LABEL: Record<Status, string> = {
  right: 'Đúng',
  partial: 'Chưa trọn điểm',
  wrong: 'Sai',
  pending: 'Đang chờ chấm',
};

function isBlank(v: any) {
  return (
    v === null ||
    v === undefined ||
    v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
  );
}

export default function AttemptReview({
  results,
  answersVisible = true,
  lockedMessage,
}: {
  results: any[];
  answersVisible?: boolean;
  lockedMessage?: string;
}) {
  const [filter, setFilter] = useState<'all' | 'wrong' | 'right'>('all');

  const rows = useMemo(
    () => (results || []).map((r, i) => ({ r, n: i + 1, st: statusOf(r) })),
    [results],
  );
  const count = (s: Status) => rows.filter((x) => x.st === s).length;
  const wrongRows = rows.filter((x) => x.st === 'wrong' || x.st === 'partial');
  const shown = rows.filter((x) =>
    filter === 'all' ? true : filter === 'wrong' ? x.st === 'wrong' || x.st === 'partial' : x.st === 'right',
  );

  function jump(itemId: string) {
    setFilter('all');
    setTimeout(() => {
      const el = document.getElementById(`rv-${itemId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el?.focus({ preventScroll: true });
    }, 0);
  }

  return (
    <div className="rv">
      {/* ===== Tóm tắt ===== */}
      <section className="rv-summary" aria-labelledby="rv-sum-h">
        <h2 id="rv-sum-h" className="rv-h">
          Xem lại bài làm
        </h2>
        <div className="rv-counts">
          <span className="rv-count is-right">
            <b>{count('right')}</b> đúng
          </span>
          <span className="rv-count is-wrong">
            <b>{count('wrong')}</b> sai
          </span>
          {count('partial') > 0 && (
            <span className="rv-count is-partial">
              <b>{count('partial')}</b> chưa trọn điểm
            </span>
          )}
          {count('pending') > 0 && (
            <span className="rv-count is-pending">
              <b>{count('pending')}</b> chờ chấm
            </span>
          )}
        </div>
        {wrongRows.length > 0 ? (
          <p className="rv-wronglist">
            <span>Các câu cần xem lại:</span>
            {wrongRows.map((x) => (
              <button
                key={x.r.itemId}
                type="button"
                className={`rv-jump ${x.st === 'partial' ? 'is-partial' : ''}`}
                onClick={() => jump(x.r.itemId)}
                aria-label={`Đến câu ${x.n} (${LABEL[x.st].toLowerCase()})`}
              >
                {x.n}
              </button>
            ))}
          </p>
        ) : count('pending') === rows.length ? null : (
          <p className="rv-allright">Em làm đúng tất cả các câu đã chấm.</p>
        )}
        {!answersVisible && (
          <p className="rv-locked" role="note">
            {lockedMessage ||
              'Đáp án đúng và lời giải đang bị khóa theo cài đặt của giáo viên. Em vẫn xem được câu nào đúng, câu nào sai.'}
          </p>
        )}
        <div className="rv-filter" role="tablist" aria-label="Lọc câu hỏi">
          {(
            [
              ['all', `Tất cả (${rows.length})`],
              ['wrong', `Câu sai (${wrongRows.length})`],
              ['right', `Câu đúng (${count('right')})`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              className="st-tab"
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ===== Từng câu ===== */}
      {shown.length === 0 && <p className="sh-muted">Không có câu nào trong mục này.</p>}
      {shown.map(({ r, n, st }) => (
        <article
          key={r.itemId}
          id={`rv-${r.itemId}`}
          tabIndex={-1}
          className={`rv-item is-${st}`}
          aria-labelledby={`rv-h-${r.itemId}`}
        >
          <div className="rv-item-head">
            <h3 id={`rv-h-${r.itemId}`} className="rv-num">
              Câu {n}
            </h3>
            <span className={`rv-badge is-${st}`}>
              {r.tfDetail && st !== 'pending'
                ? `Đúng ${r.tfDetail.correctCount}/${r.tfDetail.total} ý`
                : LABEL[st]}
            </span>
            <span className="rv-pts">
              {st === 'pending'
                ? 'chưa có điểm'
                : `${r.finalScore ?? r.earned ?? 0}${r.maxScore ? ` / ${r.maxScore}` : ''} điểm`}
            </span>
            {r.code && (
              <span className="rv-code" title="Mã câu hỏi">
                #{r.code}
              </span>
            )}
          </div>

          <div className="rv-content">
            <LatexRenderer content={r.content} />
          </div>

          <AnswerDetail r={r} st={st} />

          {r.solution && (
            <div className="rv-solution">
              <strong>Lời giải</strong>
              <LatexRenderer content={r.solution} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function AnswerDetail({ r, st }: { r: any; st: Status }) {
  const known = r.correctAnswer !== null && r.correctAnswer !== undefined;

  // ----- Tự luận -----
  if (r.type === 'ESSAY') {
    const note =
      r.finalScore !== null && r.finalScore !== undefined
        ? { title: 'Thầy cô nhận xét', text: r.finalComment || 'Không có nhận xét thêm.' }
        : r.aiFeedback
          ? { title: 'Nhận xét sơ bộ (chờ thầy cô chốt điểm)', text: r.aiFeedback }
          : null;
    return (
      <div className="rv-answer">
        {r.studentAnswer && (
          <div className="rv-mine">
            <span className="rv-label">Bài làm của em</span>
            <div style={{ whiteSpace: 'pre-wrap' }}>{String(r.studentAnswer)}</div>
          </div>
        )}
        {r.images?.length > 0 && (
          <div className="rv-images">
            {r.images.map((url: string, i: number) => (
              <a key={i} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={`Ảnh bài làm ${i + 1}`} />
              </a>
            ))}
          </div>
        )}
        {note && (
          <div className="rv-note">
            <span className="rv-label">{note.title}</span>
            <div style={{ whiteSpace: 'pre-wrap' }}>{note.text}</div>
          </div>
        )}
        {!note && st === 'pending' && <p className="sh-muted">Bài tự luận đang được chấm.</p>}
      </div>
    );
  }

  // ----- Trắc nghiệm 1 đáp án / nhiều đáp án -----
  if ((r.type === 'MCQ' || r.type === 'MULTI_ANSWER') && Array.isArray(r.options) && r.options.length) {
    const mine: string[] = Array.isArray(r.studentAnswer)
      ? r.studentAnswer.map(norm)
      : isBlank(r.studentAnswer)
        ? []
        : [norm(r.studentAnswer)];
    const right: string[] = !known
      ? []
      : Array.isArray(r.correctAnswer)
        ? r.correctAnswer.map(norm)
        : [norm(r.correctAnswer)];
    return (
      <div className="rv-answer">
        {mine.length === 0 && <p className="rv-blank">Em bỏ trống câu này.</p>}
        <ul className="rv-opts">
          {r.options.map((opt: any) => {
            const id = norm(opt.id);
            const chosen = mine.includes(id);
            const isRight = right.includes(id);
            const cls = chosen && isRight ? 'is-good' : chosen ? 'is-bad' : isRight ? 'is-key' : '';
            return (
              <li key={opt.id} className={`rv-opt ${cls}`}>
                <span className="ex-opt-key" aria-hidden="true">
                  {opt.id}
                </span>
                <span className="rv-opt-text">
                  <LatexRenderer content={opt.text} />
                </span>
                {chosen && (
                  <span className="rv-tag">{isRight || !known ? 'Em chọn' : 'Em chọn · sai'}</span>
                )}
                {!chosen && isRight && <span className="rv-tag">Đáp án đúng</span>}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // ----- Đúng/Sai -----
  if (r.type === 'TRUE_FALSE' && Array.isArray(r.options) && r.options.length) {
    return (
      <div className="rv-answer rv-tf-wrap">
        <table className="rv-tf">
          <thead>
            <tr>
              <th scope="col">Mệnh đề</th>
              <th scope="col">Em chọn</th>
              {known && <th scope="col">Đáp án</th>}
            </tr>
          </thead>
          <tbody>
            {r.options.map((opt: any) => {
              const picked = r.studentAnswer?.[opt.id];
              const key = known ? r.correctAnswer?.[opt.id] === true : undefined;
              const ok = known && picked !== undefined && picked === key;
              const bad = known && picked !== undefined && picked !== key;
              return (
                <tr key={opt.id} className={ok ? 'is-good' : bad ? 'is-bad' : picked === undefined ? 'is-blank' : ''}>
                  <td>
                    <strong>{String(opt.id)})</strong> <LatexRenderer content={opt.text} />
                  </td>
                  <td className="rv-tf-cell">
                    {picked === undefined ? 'Bỏ trống' : picked ? 'Đúng' : 'Sai'}
                    {bad && <span className="sr-only"> (chọn sai)</span>}
                  </td>
                  {known && <td className="rv-tf-cell">{key ? 'Đúng' : 'Sai'}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ----- Trả lời ngắn / dạng khác -----
  return (
    <div className="rv-answer rv-pair">
      <div className={`rv-mine ${st === 'right' ? 'is-good' : st === 'pending' ? '' : 'is-bad'}`}>
        <span className="rv-label">Em trả lời</span>
        <b className="mono">{isBlank(r.studentAnswer) ? 'Bỏ trống' : formatAnswer(r.studentAnswer)}</b>
      </div>
      {known && st !== 'right' && (
        <div className="rv-key">
          <span className="rv-label">Đáp án đúng</span>
          <b className="mono">
            <LatexRenderer content={formatAnswer(r.correctAnswer)} />
          </b>
        </div>
      )}
    </div>
  );
}
