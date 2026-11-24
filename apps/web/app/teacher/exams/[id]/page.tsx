'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatAnswer } from '@/lib/answer';
import LatexRenderer from '@/components/LatexRenderer';
import EssayFinalize from '@/components/EssayFinalize';
import ExamItemEditor from '@/components/ExamItemEditor';

const DIFF_LABEL: Record<string, string> = {
  NHAN_BIET: 'Nhận biết',
  THONG_HIEU: 'Thông hiểu',
  VAN_DUNG: 'Vận dụng',
  VAN_DUNG_CAO: 'Vận dụng cao',
};

const PART_LABEL: Record<number, string> = {
  1: 'Trắc nghiệm',
  2: 'Đúng/Sai',
  3: 'Trả lời ngắn',
  4: 'Tự luận',
};

// Ô chọn câu thay thế: gõ MÃ câu (VD: B634088) hoặc nội dung để tìm nhanh
function QuestionPicker({
  questions,
  currentType,
  onPick,
}: {
  questions: any[];
  currentType: string;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const list = questions.filter((bq) => bq.type === currentType);
  const term = q.trim().toLowerCase();
  const results = term
    ? list.filter(
        (bq) =>
          String(bq.code || '').toLowerCase().includes(term) ||
          String(bq.content || '').toLowerCase().includes(term),
      )
    : list;
  const shown = results.slice(0, 30);
  const pick = (id: string) => {
    onPick(id);
    setQ('');
    setOpen(false);
  };
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const exact = list.find(
              (bq) => String(bq.code || '').toLowerCase() === term,
            );
            if (exact) pick(exact.id);
            else if (shown[0]) pick(shown[0].id);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Gõ mã câu (VD: B634088) hoặc nội dung để đổi câu…"
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: 13,
          border: '1px solid var(--color-rule)',
          borderRadius: 6,
          background: 'var(--color-paper)',
          color: 'var(--color-ink)',
        }}
      />
      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 60,
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 260,
            overflowY: 'auto',
            background: 'var(--color-paper)',
            border: '1px solid var(--color-rule)',
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,.18)',
          }}
        >
          {shown.length === 0 ? (
            <div style={{ padding: 8, fontSize: 12, color: 'var(--color-muted)' }}>
              Không tìm thấy câu phù hợp
            </div>
          ) : (
            shown.map((bq) => (
              <div
                key={bq.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(bq.id);
                }}
                style={{
                  padding: '6px 8px',
                  fontSize: 12.5,
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--color-rule)',
                }}
              >
                <b>{bq.code}</b> — {String(bq.content || '').slice(0, 80)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ExamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const examId = params.id as string;

  const [exam, setExam] = useState<any>(null);
  // Đang tải file nào (tránh bấm nhiều lần khi PDF biên dịch lâu)
  const [dlBusy, setDlBusy] = useState('');
  // Báo cáo LaTeX: câu lỗi / đã tự sửa (từ PDF đề hoặc nút Kiểm tra LaTeX)
  const [texReport, setTexReport] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  // Trộn đề nhiều mã
  const [mixOpen, setMixOpen] = useState(false);
  const [mixBusy, setMixBusy] = useState(false);
  const [mix, setMix] = useState({
    count: 4,
    startCode: '101',
    shuffleQuestions: true,
    shuffleOptions: true,
    shuffleTF: false,
    docx: true,
    pdf: false,
    tex: false,
  });
  const [bankQuestions, setBankQuestions] = useState<any[]>([]);
  // Câu đang được sửa trực tiếp trong đề
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  // Lời giải: mặc định thu gọn (biên dịch TikZ/TeX tốn thời gian); mở từng câu hoặc mở tất cả
  const [openSol, setOpenSol] = useState<Set<string>>(new Set());
  const [allSol, setAllSol] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [resultsData, setResultsData] = useState<any>(null);
  const [resultClass, setResultClass] = useState('');
  // Thiết lập thi + Item Analysis
  const [settings, setSettings] = useState<any>({});
  const [statOpen, setStatOpen] = useState(false);
  const [statData, setStatData] = useState<any>(null);

  const thStyle: React.CSSProperties = {
    padding: '8px 10px',
    textAlign: 'left',
    fontWeight: 700,
    borderBottom: '2px solid var(--color-rule-2)',
  };
  const tdStyle: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' };

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function loadResults(className?: string) {
    try {
      const params = className
        ? `?className=${encodeURIComponent(className)}`
        : '';
      const data = await apiFetch(`/exams/${examId}/results${params}`);
      setResultsData(data);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function saveSettings() {
    try {
      await apiFetch(`/exams/${examId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setExam((e: any) => ({ ...e, ...settings }));
      showToast('✅ Đã lưu thiết lập thi');
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function loadStatistics() {
    setStatData(null);
    try {
      const data = await apiFetch(`/exams/${examId}/statistics`);
      setStatData(data);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  function exportStatCsv() {
    if (!statData?.items?.length) return;
    const rows: string[] = [
      'Cau,Do_kho_%_dung,Phan_biet_27,So_bai_chon_dung,So_bai_lam',
    ];
    for (const it of statData.items) {
      rows.push(
        `${it.order},${(it.difficultyIndex * 100).toFixed(1)},${it.discrimination},${it.correctCount},${it.n}`,
      );
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `item_analysis_${examId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportResults(format: 'pdf' | 'xlsx') {
    try {
      const token = localStorage.getItem('token');
      const cls = resultClass ? `&className=${encodeURIComponent(resultClass)}` : '';
      const res = await fetch(
        `/api/exams/${examId}/results/export?format=${format}${cls}`,
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
      a.download = format === 'pdf' ? 'bang-diem.pdf' : 'bang-diem.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Không xuất được: ' + e.message);
    }
  }

  // Template đề thi
  async function toggleTemplate() {
    try {
      const data = await apiFetch(`/exams/${examId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isTemplate: !exam.isTemplate }),
      });
      setExam(data);
      showToast(data.isTemplate ? 'Đã lưu làm template đề thi' : 'Đã bỏ template');
    } catch (e: any) {
      showToast(e.message);
    }
  }

  // Xem bài làm từng học sinh
  const [reviewData, setReviewData] = useState<any>(null);
  const [loadingReview, setLoadingReview] = useState(false);

  async function openReview(attemptId: string) {
    setLoadingReview(true);
    setReviewData(null);
    try {
      const data = await apiFetch(`/exams/${examId}/attempts/${attemptId}/review`);
      setReviewData(data);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoadingReview(false);
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [examData, bankData] = await Promise.all([
        apiFetch(`/exams/${examId}`),
        apiFetch('/bank/questions'),
      ]);
      setExam(examData);
      setBankQuestions(bankData);
      setSettings({
        passMark: examData.passMark ?? null,
        maxAttempts: examData.maxAttempts ?? 3,
        extraTime: examData.extraTime ?? 0,
        hideAnswersAt: examData.hideAnswersAt ?? null,
        practiceMode: !!examData.practiceMode,
        answersAtEnd: examData.answersAtEnd !== false,
        oneTimeResults: !!examData.oneTimeResults,
      });
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  async function updateItem(itemId: string, data: any) {
    try {
      await apiFetch(`/exams/${examId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      showToast('Đã cập nhật câu hỏi');
      load();
    } catch (e: any) {
      showToast(e.message);
    }
  }

  async function deleteItem(itemId: string) {
    if (!confirm('Xóa câu hỏi này khỏi đề?')) return;
    try {
      await apiFetch(`/exams/${examId}/items/${itemId}`, { method: 'DELETE' });
      showToast('Đã xóa câu hỏi khỏi đề');
      load();
    } catch (e: any) {
      showToast(e.message);
    }
  }

  function downloadUrl(path: string, filename: string) {
    return async () => {
      if (dlBusy) return;
      setDlBusy(filename);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${path}`, {
          headers: { Authorization: `Bearer ${token}` },
          ...(path.includes('compile') ? { method: 'POST' } : {}),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(String(err.message || 'Tải file thất bại').slice(-400));
          return;
        }
        // PDF đề: máy chủ báo lại câu lỗi LaTeX đã thay bằng chữ thuần / đã tự sửa
        const rep = res.headers.get('X-Tex-Report');
        if (rep) {
          try {
            setTexReport({ ...JSON.parse(decodeURIComponent(rep)), source: 'pdf' });
          } catch {
            /* bỏ qua */
          }
        } else if (path.includes('compile')) {
          setTexReport(null);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch (e: any) {
        alert(e.message);
      } finally {
        setDlBusy('');
      }
    };
  }

  async function exportVariants() {
    const formats = (['docx', 'pdf', 'tex'] as const).filter((f) => mix[f]);
    if (!formats.length) {
      alert('Chọn ít nhất một định dạng (Word, PDF hoặc .tex)');
      return;
    }
    setMixBusy(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/exams/${examId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          count: mix.count,
          startCode: mix.startCode,
          shuffleQuestions: mix.shuffleQuestions,
          shuffleOptions: mix.shuffleOptions,
          shuffleTF: mix.shuffleTF,
          formats,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || 'Trộn đề thất bại').slice(-400));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tron-de-${mix.startCode}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setMixOpen(false);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setMixBusy(false);
    }
  }

  async function checkLatex() {
    setChecking(true);
    try {
      const r = await apiFetch(`/exams/${examId}/check-latex`, { method: 'POST' });
      setTexReport({ ...r, source: 'check' });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setChecking(false);
    }
  }

  if (loading) return <div className="page-container">Đang tải…</div>;
  if (!exam) return <div className="page-container">Không tìm thấy đề thi.</div>;

  return (
    <div className="page-container" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/teacher/exams"
          style={{ fontSize: 13, color: 'var(--color-accent)', textUnderlineOffset: 3 }}
        >
          ← Về Kho đề thi
        </Link>
        <h1 className="page-title" style={{ marginTop: 8 }}>{exam.title}</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {exam.grade && <span className="badge">Lớp {exam.grade}</span>}
          {exam.topic && <span className="badge badge-accent">{exam.topic.name}</span>}
          {exam.difficulty && (
            <span className="badge badge-warning">{DIFF_LABEL[exam.difficulty]}</span>
          )}
          <span className="badge">{exam.items?.length ?? 0} câu</span>
          <span className="badge">Tổng {exam.totalScore} điểm</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={downloadUrl(`/api/exams/${examId}/compile`, 'de_thi.pdf')} disabled={!!dlBusy}>
            {dlBusy === 'de_thi.pdf' ? 'Đang biên dịch…' : 'PDF đề'}
          </button>
          <button
            className="btn btn-outline"
            style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
            onClick={checkLatex}
            disabled={checking}
            title="Biên dịch thử toàn đề, chỉ ra đúng câu nào lỗi LaTeX"
          >
            {checking ? 'Đang kiểm tra…' : 'Kiểm tra LaTeX'}
          </button>
          <button
            className="btn btn-outline"
            style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
            onClick={() => setMixOpen(true)}
            title="Tạo nhiều mã đề: đảo câu, đảo phương án, kèm bảng đáp án các mã"
          >
            Trộn đề
          </button>
          <button className="btn btn-outline" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={downloadUrl(`/api/exams/${examId}/answers-pdf`, 'dap_an.pdf')}>
            PDF đáp án
          </button>
          <button className="btn btn-outline" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }} onClick={downloadUrl(`/api/exams/${examId}/tex`, 'de_thi.tex')}>
            .tex
          </button>
          <button
            className="btn btn-outline"
            style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
            title="Công thức ở dạng văn bản ${...}$ hiện dấu đô la — mở MathType → Convert Equations (nguồn TeX) → Toggle TeX"
            onClick={downloadUrl(`/api/exams/${examId}/docx-tex`, 'de_thi_tex.docx')}
          >
            📄 Word đề (${'{...}'}$)
          </button>
          <button
            className="btn btn-outline"
            style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
            title="Đáp án công thức ở dạng văn bản ${...}$"
            onClick={downloadUrl(`/api/exams/${examId}/docx-answers-tex`, 'dap_an_tex.docx')}
          >
            📄 Word đáp án (${'{...}'}$)
          </button>
          <button
            className="btn btn-outline"
            style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
            title="Công thức là phương trình Word — bấm vào sửa được; MathType: Convert Equations để đổi sang MathType"
            onClick={downloadUrl(`/api/exams/${examId}/docx`, 'de_thi.docx')}
            disabled={!!dlBusy}
          >
            {dlBusy === 'de_thi.docx' ? 'Đang tạo Word…' : 'Word đề'}
          </button>
          <button
            className="btn btn-outline"
            style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
            title="Đề kèm đáp án tô đỏ, lời giải từng câu và bảng đáp án cuối đề"
            onClick={downloadUrl(`/api/exams/${examId}/docx-answers`, 'dap_an.docx')}
            disabled={!!dlBusy}
          >
            {dlBusy === 'dap_an.docx' ? 'Đang tạo Word…' : 'Word đáp án'}
          </button>
          <button
            className="btn"
            style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
            onClick={() => {
              setShowResults(!showResults);
              if (!showResults) loadResults();
            }}
          >
            Bảng điểm ({resultsData?.stats?.total ?? 0})
          </button>
          <button
            className={exam.isTemplate ? 'btn' : 'btn btn-outline'}
            style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
            onClick={toggleTemplate}
          >
            {exam.isTemplate ? '📋 Đang là template' : '📋 Lưu làm template'}
          </button>
        </div>
        {texReport && (
          <div
            className="card"
            role="status"
            style={{
              marginTop: 12,
              padding: 14,
              borderLeft: `4px solid var(${texReport.bad?.length ? '--color-warning' : '--color-success'})`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <strong style={{ fontSize: 14 }}>
                {texReport.bad?.length
                  ? `${texReport.bad.length} câu lỗi LaTeX${texReport.source === 'pdf' ? ' — trong PDF đã hiển thị dạng chữ thuần' : ''}`
                  : 'LaTeX toàn đề không có lỗi'}
              </strong>
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: 'auto', padding: '2px 10px', fontSize: 12 }}
                onClick={() => setTexReport(null)}
                aria-label="Đóng báo cáo LaTeX"
              >
                ✕
              </button>
            </div>
            {texReport.plainFallback && (
              <p style={{ fontSize: 13, color: 'var(--color-danger)', margin: '6px 0 0' }}>
                Lỗi nằm ngoài các câu hỏi — toàn đề phải hiển thị dạng chữ thuần. Hãy báo cho quản trị.
              </p>
            )}
            {texReport.bad?.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}>
                {texReport.bad.map((b: any, i: number) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <b>{b.label}</b>
                    {b.code ? ` (mã ${b.code})` : ''}:{' '}
                    <span style={{ color: 'var(--color-muted)' }}>{b.error || 'lỗi biên dịch'}</span>
                  </li>
                ))}
              </ul>
            )}
            {texReport.fixes?.length > 0 && (
              <p style={{ fontSize: 12.5, color: 'var(--color-muted)', margin: '8px 0 0' }}>
                Đã tự sửa: {texReport.fixes.join('; ')}
              </p>
            )}
          </div>
        )}
      </div>

      {mixOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 45%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: 20,
          }}
          onClick={() => !mixBusy && setMixOpen(false)}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            aria-label="Trộn đề nhiều mã đề"
            style={{ width: '100%', maxWidth: 520, padding: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <strong style={{ fontSize: 17 }}>Trộn đề nhiều mã đề</strong>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: '6px 0 14px' }}>
              Mỗi mã đề đảo câu trong từng phần; phương án kiểu “Cả A và B”, “Tất cả đều đúng” được giữ nguyên thứ tự.
              Tải về 1 file .zip gồm đề từng mã, đáp án từng mã và Excel bảng đáp án các mã.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <label style={{ fontSize: 13 }}>
                Số mã đề
                <input
                  type="number"
                  min={1}
                  max={mix.pdf ? 12 : 24}
                  value={mix.count}
                  onChange={(e) => setMix({ ...mix, count: Math.max(1, Math.min(mix.pdf ? 12 : 24, Number(e.target.value) || 1)) })}
                  style={{ display: 'block', width: 100, marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 13 }}>
                Mã bắt đầu
                <input
                  type="text"
                  value={mix.startCode}
                  onChange={(e) => setMix({ ...mix, startCode: e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6) })}
                  style={{ display: 'block', width: 100, marginTop: 4 }}
                />
              </label>
            </div>
            <div style={{ display: 'grid', gap: 6, fontSize: 13.5, marginBottom: 12 }}>
              <label><input type="checkbox" checked={mix.shuffleQuestions} onChange={(e) => setMix({ ...mix, shuffleQuestions: e.target.checked })} /> Đảo thứ tự câu trong từng phần</label>
              <label><input type="checkbox" checked={mix.shuffleOptions} onChange={(e) => setMix({ ...mix, shuffleOptions: e.target.checked })} /> Đảo phương án A, B, C, D</label>
              <label><input type="checkbox" checked={mix.shuffleTF} onChange={(e) => setMix({ ...mix, shuffleTF: e.target.checked })} /> Đảo ý a), b), c), d) của câu Đúng/Sai</label>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13.5, marginBottom: 14 }}>
              <span style={{ color: 'var(--color-muted)' }}>Định dạng:</span>
              <label><input type="checkbox" checked={mix.docx} onChange={(e) => setMix({ ...mix, docx: e.target.checked })} /> Word</label>
              <label><input type="checkbox" checked={mix.pdf} onChange={(e) => setMix({ ...mix, pdf: e.target.checked, count: e.target.checked ? Math.min(mix.count, 12) : mix.count })} /> PDF (chậm hơn)</label>
              <label><input type="checkbox" checked={mix.tex} onChange={(e) => setMix({ ...mix, tex: e.target.checked })} /> .tex</label>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" style={{ width: 'auto' }} disabled={mixBusy} onClick={() => setMixOpen(false)}>
                Huỷ
              </button>
              <button type="button" className="btn" style={{ width: 'auto' }} disabled={mixBusy} onClick={exportVariants}>
                {mixBusy ? 'Đang trộn đề…' : `Tạo ${mix.count} mã đề`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== THIẾT LẬP THI + ITEM ANALYSIS (Canvas-style) ===== */}
      <div className="card" style={{ marginBottom: 20, padding: 18 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong>⚙️ Thiết lập thi</strong>
          <button
            className="btn btn-outline"
            style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5 }}
            onClick={() => {
              setStatOpen(!statOpen);
              if (!statOpen) loadStatistics();
            }}
          >
            📊 Item Analysis {statOpen ? '▲' : '▼'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginTop: 12 }}>
          <label style={{ fontSize: 12.5 }}>
            Điểm chuẩn đậu (pass_mark)
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={settings.passMark ?? ''}
              onChange={(e) => setSettings({ ...settings, passMark: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="VD: 5"
              style={{ width: '100%', padding: 7, borderRadius: 8, border: '1px solid var(--color-rule)' }}
            />
          </label>
          <label style={{ fontSize: 12.5 }}>
            Số lần làm tối đa (0 = vô hạn)
            <input
              type="number"
              min={0}
              max={99}
              value={settings.maxAttempts ?? 3}
              onChange={(e) => setSettings({ ...settings, maxAttempts: Number(e.target.value) })}
              style={{ width: '100%', padding: 7, borderRadius: 8, border: '1px solid var(--color-rule)' }}
            />
          </label>
          <label style={{ fontSize: 12.5 }}>
            Cộng thêm giờ cho HS cần hỗ trợ (phút)
            <input
              type="number"
              min={0}
              max={180}
              value={settings.extraTime ?? 0}
              onChange={(e) => setSettings({ ...settings, extraTime: Number(e.target.value) })}
              style={{ width: '100%', padding: 7, borderRadius: 8, border: '1px solid var(--color-rule)' }}
            />
          </label>
          <label style={{ fontSize: 12.5 }}>
            Khóa đáp án sau mốc giờ (hide_at)
            <input
              type="datetime-local"
              value={settings.hideAnswersAt ? String(settings.hideAnswersAt).slice(0, 16) : ''}
              onChange={(e) => setSettings({ ...settings, hideAnswersAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
              style={{ width: '100%', padding: 7, borderRadius: 8, border: '1px solid var(--color-rule)' }}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, fontSize: 13 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={!!settings.practiceMode}
              onChange={(e) => setSettings({ ...settings, practiceMode: e.target.checked })}
            />
            🎯 Chế độ luyện tập (hiện đáp án từng câu ngay)
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={!!settings.answersAtEnd}
              onChange={(e) => setSettings({ ...settings, answersAtEnd: e.target.checked })}
            />
            🔒 Ẩn đáp án đến hết bài
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={!!settings.oneTimeResults}
              onChange={(e) => setSettings({ ...settings, oneTimeResults: e.target.checked })}
            />
            👁 Kết quả chỉ xem đúng 1 lần
          </label>
        </div>
        <button className="btn" style={{ width: 'auto', marginTop: 12 }} onClick={saveSettings}>
          💾 Lưu thiết lập
        </button>

        {statOpen && (
          <div style={{ marginTop: 16, borderTop: '1px dashed var(--color-rule)', paddingTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <strong>📊 Phân tích câu hỏi (Item Analysis)</strong>
              <button className="btn btn-outline" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={exportStatCsv}>
                ⬇ Xuất CSV
              </button>
            </div>
            {!statData ? (
              <p style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 8 }}>Đang tải…</p>
            ) : statData.n === 0 ? (
              <p style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 8 }}>
                Chưa có học sinh nào nộp bài thi này.
              </p>
            ) : (
              <div>
                <p style={{ fontSize: 12.5, margin: '8px 0', color: 'var(--color-muted)' }}>
                  {statData.n} bài nộp · TB {statData.mean}đ · Độ lệch chuẩn {statData.sd} · Cronbach&apos;s α = {statData.cronbachAlpha ?? '—'}
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-track)' }}>
                        <th style={thStyle}>Câu</th>
                        <th style={thStyle}>Độ khó (% đúng)</th>
                        <th style={thStyle}>Phân biệt (top−đáy 27%)</th>
                        <th style={thStyle}>% chọn từng đáp án</th>
                        <th style={thStyle}>Point-biserial (nhiễu in nghiêng)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statData.items.map((it: any) => (
                        <tr key={it.itemId} style={{ borderTop: '1px solid var(--color-rule-2)' }}>
                          <td style={tdStyle}>Câu {it.order}</td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--color-track)' }}>
                                <div style={{ width: `${it.difficultyIndex * 100}%`, height: 8, borderRadius: 4, background: it.difficultyIndex >= 0.6 ? 'var(--color-success)' : it.difficultyIndex >= 0.3 ? '#f59e0b' : 'var(--color-danger)' }} />
                              </div>
                              <span className="mono">{(it.difficultyIndex * 100).toFixed(0)}%</span>
                            </div>
                          </td>
                          <td style={{ ...tdStyle, color: it.discrimination > 0.3 ? 'var(--color-success)' : it.discrimination < 0 ? 'var(--color-danger)' : undefined }}>
                            {it.discrimination.toFixed(2)}
                          </td>
                          <td style={tdStyle}>
                            {Object.keys(it.optionCounts || {}).map((oid: string) => (
                              <span key={oid} className="mono" style={{ marginRight: 8, fontWeight: oid === it.answer ? 800 : 400, color: oid === it.answer ? 'var(--color-success)' : undefined }}>
                                {oid}: {Math.round((it.optionRatios?.[oid] || 0) * 100)}%
                              </span>
                            ))}
                          </td>
                          <td style={tdStyle}>
                            {Object.entries(it.pointBiserials || {}).map(([oid, pb]: any) => (
                              <span key={oid} className="mono" style={{ marginRight: 8, fontWeight: oid === it.answer ? 800 : 400 }}>
                                {oid}: {pb}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== BẢNG ĐIỂM LỚP ===== */}
      {showResults && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 17, marginBottom: 12 }}>Bảng điểm học sinh</h2>
          {!resultsData ? (
            <p style={{ color: 'var(--color-muted)', fontSize: 14 }}>Đang tải…</p>
          ) : (
            <>
              {/* Lọc lớp + xuất */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <select
                  value={resultClass}
                  onChange={(e) => {
                    setResultClass(e.target.value);
                    loadResults(e.target.value);
                  }}
                  style={{ padding: 8, border: '1px solid var(--color-rule)', borderRadius: 8, fontSize: 13, background: 'var(--color-paper)', color: 'var(--color-ink)', maxWidth: 200 }}
                >
                  <option value="">Tất cả lớp</option>
                  {resultsData.classes.map((c: string) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                  onClick={() => exportResults('pdf')}
                >
                  📄 Xuất PDF
                </button>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                  onClick={() => exportResults('xlsx')}
                >
                  📊 Xuất Excel
                </button>
                {resultClass && (
                  <span className="mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    Đang lọc: {resultClass}
                  </span>
                )}
              </div>

              {/* Thống kê nâng cao */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <span className="badge">Tổng: {resultsData.stats.total} HS</span>
                <span className="badge badge-success">Đã nộp: {resultsData.stats.submitted}</span>
                <span className="badge badge-danger">Chưa nộp: {resultsData.stats.notSubmitted}</span>
                <span className="badge badge-accent">TB: {resultsData.stats.avg}</span>
                <span className="badge badge-accent">Trung vị: {resultsData.stats.median}</span>
                <span className="badge">Độ lệch chuẩn: {resultsData.stats.std}</span>
                <span className="badge">Q1: {resultsData.stats.q1} · Q2: {resultsData.stats.q2} · Q3: {resultsData.stats.q3}</span>
                <span className="badge badge-success">Cao nhất: {resultsData.stats.max}</span>
                <span className="badge badge-danger">Thấp nhất: {resultsData.stats.min}</span>
              </div>

              {/* Phổ điểm */}
              {resultsData.stats.submitted > 0 && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', marginBottom: 14, height: 90 }}>
                  {resultsData.stats.distribution.map((d: any, i: number) => {
                    const maxCount = Math.max(1, ...resultsData.stats.distribution.map((x: any) => x.count));
                    const h = d.count > 0 ? Math.max(6, (d.count / maxCount) * 70) : 2;
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--color-muted)' }}>{d.count || ''}</span>
                        <div
                          title={`${d.label}: ${d.count} HS`}
                          style={{
                            width: '70%',
                            height: h,
                            background: d.count > 0 ? 'var(--color-accent)' : 'var(--color-rule)',
                            borderRadius: 3,
                          }}
                        />
                        <span className="mono" style={{ fontSize: 8, color: 'var(--color-muted)', transform: 'rotate(-35deg)', transformOrigin: 'top left', whiteSpace: 'nowrap' }}>
                          {d.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {resultsData.attempts.length === 0 ? (
                <p style={{ color: 'var(--color-muted)', fontSize: 14 }}>
                  Chưa có học sinh nào trong danh sách này.
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-rule)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Học sinh</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Lớp</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Điểm</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Trạng thái</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultsData.attempts.map((a: any) => (
                        <tr key={a.studentId} style={{ borderBottom: '1px solid var(--color-rule)' }}>
                          <td style={{ padding: '8px 10px' }}>
                            <strong>{a.studentName}</strong>{' '}
                            <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{a.studentCode}</span>
                          </td>
                          <td style={{ padding: '8px 10px', color: 'var(--color-muted)' }}>{a.className}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {a.score === null ? (
                              <span className="mono" style={{ color: 'var(--color-muted)' }}>—</span>
                            ) : (
                              <span
                                className="mono"
                                style={{
                                  fontWeight: 700,
                                  color:
                                    (a.score ?? 0) >= resultsData.exam.totalScore * 0.5
                                      ? 'var(--color-success)'
                                      : 'var(--color-danger)',
                                }}
                              >
                                {a.score}/{resultsData.exam.totalScore}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {a.status === 'DUNG_HAN' && <span className="badge badge-success">Đúng hạn</span>}
                            {a.status === 'MUON' && <span className="badge badge-warning">⏰ Nộp muộn</span>}
                            {a.status === 'CHUA_NOP' && <span className="badge badge-danger">Chưa nộp</span>}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {a.attemptId && (
                              <button
                                className="btn btn-outline"
                                style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }}
                                onClick={() => openReview(a.attemptId)}
                              >
                                👁️ Xem bài làm
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Câu hỏi trong đề</h2>
        {exam.items?.some((it: any) => it.question?.solution) && (
          <button
            type="button"
            className="btn btn-outline"
            style={{ width: 'auto', minHeight: 34, padding: '0 14px', fontSize: 13 }}
            aria-pressed={allSol}
            onClick={() => {
              setAllSol(!allSol);
              setOpenSol(new Set());
            }}
          >
            {allSol ? 'Ẩn lời giải tất cả câu' : 'Hiện lời giải tất cả câu'}
          </button>
        )}
      </div>

      {!exam.items || exam.items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
          <p>Đề thi không có câu hỏi nào.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {exam.items.map((item: any) => {
            const q = item.question;
            return (
              <div key={item.id} className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  <span className="badge badge-accent">Câu {item.order}</span>
                  <span className="badge">{PART_LABEL[item.part] || 'Phần'}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>{q.code}</span>
                </div>

                <div style={{ fontSize: 15, marginBottom: 8 }}>
                  <LatexRenderer content={q.content} />
                </div>

                {q.options && Array.isArray(q.options) && q.options.length > 0 && (
                  <div style={{ fontSize: 14, paddingLeft: 12, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {q.options.map((opt: any) => {
                      const isCorrect =
                        q.type === 'MCQ' && String(q.answer) === String(opt.id);
                      return (
                        <div
                          key={opt.id}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 8,
                            background: isCorrect
                              ? 'color-mix(in oklch, var(--color-success) 16%, var(--color-paper))'
                              : 'transparent',
                            border: isCorrect
                              ? '1.5px solid var(--color-success)'
                              : '1.5px solid transparent',
                          }}
                        >
                          <strong style={isCorrect ? { color: 'var(--color-success)' } : undefined}>
                            {opt.id}.
                          </strong>{' '}
                          <LatexRenderer content={opt.text} />
                          {isCorrect && (
                            <span style={{ color: 'var(--color-success)', fontSize: 12, fontWeight: 800, marginLeft: 6 }}>
                              ✓
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div
                  style={{
                    fontSize: 13,
                    padding: 8,
                    background: 'color-mix(in oklch, var(--color-success) 8%, var(--color-paper))',
                    borderRadius: 6,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--color-success)' }}>Đáp án:</strong>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <LatexRenderer content={formatAnswer(q.answer)} />
                    </span>
                    {q.solution && !allSol && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ width: 'auto', minHeight: 30, padding: '0 12px', fontSize: 12.5 }}
                        aria-expanded={openSol.has(item.id)}
                        onClick={() =>
                          setOpenSol((o) => {
                            const n = new Set(o);
                            if (n.has(item.id)) n.delete(item.id);
                            else n.add(item.id);
                            return n;
                          })
                        }
                      >
                        {openSol.has(item.id) ? 'Ẩn lời giải' : 'Xem lời giải'}
                      </button>
                    )}
                  </div>
                  {q.solution && (allSol || openSol.has(item.id)) && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--color-rule-2)', fontSize: 14, color: 'var(--color-ink)' }}>
                      <strong style={{ color: 'var(--color-success)' }}>Lời giải:</strong>
                      <LatexRenderer content={q.solution} />
                    </div>
                  )}
                  {!q.solution && <div style={{ marginTop: 4, color: 'var(--color-muted)', fontSize: 12.5 }}>Câu này chưa có lời giải.</div>}
                </div>

                {editingItemId === item.id && (
                  <ExamItemEditor
                    examId={examId}
                    item={item}
                    onCancel={() => setEditingItemId(null)}
                    onSaved={(msg) => {
                      setEditingItemId(null);
                      showToast(msg);
                      load();
                    }}
                  />
                )}

                {/* Công cụ sửa câu hỏi */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--color-rule)', paddingTop: 10 }}>
                  <button
                    type="button"
                    className="btn sh-btn-accent"
                    style={{ width: 'auto', minHeight: 36, padding: '0 14px', fontSize: 13 }}
                    aria-expanded={editingItemId === item.id}
                    onClick={() => setEditingItemId(editingItemId === item.id ? null : item.id)}
                  >
                    {editingItemId === item.id ? 'Đóng sửa' : '✏️ Sửa câu hỏi & đáp án'}
                  </button>
                  <label style={{ fontSize: 12, color: 'var(--color-muted)' }}>Điểm:</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    defaultValue={item.score}
                    key={item.id + item.score}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!isNaN(v) && v !== item.score) updateItem(item.id, { score: v });
                    }}
                    style={{ width: 70, padding: '6px 8px', fontSize: 13, border: '1px solid var(--color-rule)', borderRadius: 6, background: 'var(--color-paper)', color: 'var(--color-ink)' }}
                  />
                  <label style={{ fontSize: 12, color: 'var(--color-muted)' }}>Đổi câu hỏi:</label>
                  <QuestionPicker
                    questions={bankQuestions}
                    currentType={q.type}
                    onPick={(qid) => updateItem(item.id, { questionId: qid })}
                  />
                  <button
                    className="btn btn-danger"
                    style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                    onClick={() => deleteItem(item.id)}
                  >
                    Xóa khỏi đề
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      {/* Modal xem bài làm của học sinh */}
      {(reviewData || loadingReview) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 50%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            padding: 16,
          }}
          onClick={() => {
            setReviewData(null);
            setLoadingReview(false);
          }}
        >
          <div
            style={{
              background: 'var(--color-paper)',
              borderRadius: 14,
              maxWidth: 760,
              width: '100%',
              maxHeight: '88vh',
              overflowY: 'auto',
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {loadingReview || !reviewData ? (
              <p style={{ fontSize: 14, color: 'var(--color-muted)' }}>Đang tải bài làm…</p>
            ) : (
              <>
                <h2 style={{ fontSize: 17, marginBottom: 4 }}>Bài làm của {reviewData.student.fullName}</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  <span className="badge badge-accent">
                    Điểm: {reviewData.score}/{reviewData.totalScore}
                  </span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    {reviewData.student.studentCode} · {reviewData.student.className || '—'}
                  </span>
                  {reviewData.late && <span className="badge badge-warning">⏰ Nộp muộn</span>}
                  <span className="mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    {reviewData.submittedAt ? new Date(reviewData.submittedAt).toLocaleString('vi-VN') : ''}
                  </span>
                </div>
                {reviewData.results.map((r: any) => (
                  <div
                    key={r.itemId}
                    style={{
                      padding: 12,
                      border: '1px solid var(--color-rule)',
                      borderRadius: 8,
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      {r.pending ? (
                        <span className="badge badge-warning">⏳ Chờ chấm</span>
                      ) : r.finalScore !== null && r.finalScore !== undefined ? (
                        <span className="badge badge-success">Đã chốt: {r.finalScore} điểm</span>
                      ) : (
                        <span className={r.correct ? 'badge badge-success' : 'badge badge-danger'}>
                          {r.correct ? 'Đúng' : 'Sai'}
                        </span>
                      )}
                      {!r.pending && r.finalScore === undefined && <span className="badge">Sơ bộ: +{r.earned} điểm</span>}
                      {r.finalScore !== null && r.finalScore !== undefined && <span className="badge">Đã chốt: {r.finalScore} điểm</span>}
                      {r.tfDetail && (
                        <span className={r.tfDetail.fraction === 1 ? 'badge badge-success' : 'badge badge-warning'}>
                          Đúng {r.tfDetail.correctCount}/{r.tfDetail.total} ý
                        </span>
                      )}
                      <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>Câu {r.order}</span>
                    </div>
                    <div style={{ fontSize: 14, marginBottom: 6 }}>
                      <LatexRenderer content={r.content} />
                    </div>
                    {r.options && Array.isArray(r.options) && r.options.length > 0 && (
                      <div style={{ fontSize: 13, paddingLeft: 10, marginBottom: 6, color: 'var(--color-muted)' }}>
                        {r.options.map((opt: any) => (
                          <div key={opt.id} style={{ display: 'flex', gap: 6 }}>
                            <strong>{opt.id}.</strong>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <LatexRenderer content={opt.text} />
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ fontSize: 13, padding: 8, background: 'var(--color-paper-2)', borderRadius: 6 }}>
                      <div>
                        <strong>HS trả lời:</strong>{' '}
                        {r.studentAnswer !== null && r.studentAnswer !== '' ? (
                          <span style={{ whiteSpace: 'pre-wrap' }}>{String(r.studentAnswer)}</span>
                        ) : (
                          <em style={{ color: 'var(--color-muted)' }}>không trả lời</em>
                        )}
                      </div>
                      {r.images?.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {r.images.map((url: string, i: number) => (
                            <a key={i} href={url} target="_blank" rel="noreferrer">
                              <img src={url} alt={`Ảnh ${i + 1}`} style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-rule)' }} />
                            </a>
                          ))}
                        </div>
                      )}
                      {r.type === 'ESSAY' && r.aiFeedback && (
                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-muted)', whiteSpace: 'pre-wrap' }}>
                          <strong>Bản nháp sơ bộ:</strong> {r.aiFeedback}
                        </div>
                      )}
                      {r.type === 'ESSAY' && (
                        <EssayFinalize
                          examId={examId}
                          attemptId={reviewData.attemptId}
                          itemId={r.itemId}
                          maxScore={r.maxScore ?? 10}
                          initialScore={r.finalScore ?? r.earned ?? ''}
                          initialComment={r.finalComment || ''}
                          onDone={() => openReview(reviewData.attemptId)}
                        />
                      )}
                      {r.type !== 'ESSAY' && (
                        <div style={{ marginTop: 4 }}>
                          <strong style={{ color: 'var(--color-success)' }}>Đáp án đúng:</strong>{' '}
                          <LatexRenderer content={formatAnswer(r.correctAnswer)} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
