'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api';
import LatexRenderer from '@/components/LatexRenderer';
import { formatAnswer } from '@/lib/answer';
import BankTopicSidebar from '@/components/bank/BankTopicSidebar';

// Trình soạn LaTeX (CodeMirror ≈ 200KB) chỉ cần khi mở khung sửa → nạp lười để giảm tải trang đầu
const LatexEditor = dynamic(() => import('@/components/LatexEditor'), {
  ssr: false,
  loading: () => (
    <div className="skeleton" style={{ height: 380, borderRadius: 10 }} aria-label="Đang tải trình soạn LaTeX" />
  ),
});

const DIFFICULTY_LABEL: Record<string, string> = {
  NHAN_BIET: 'Nhận biết',
  THONG_HIEU: 'Thông hiểu',
  VAN_DUNG: 'Vận dụng',
  VAN_DUNG_CAO: 'Vận dụng cao',
};

// Trục của bảng thống kê loại câu × mức độ
const LEVELS = [
  { id: 'NHAN_BIET', label: 'Mức 1', name: 'Nhận biết' },
  { id: 'THONG_HIEU', label: 'Mức 2', name: 'Thông hiểu' },
  { id: 'VAN_DUNG', label: 'Mức 3', name: 'Vận dụng' },
  { id: 'VAN_DUNG_CAO', label: 'Mức 4', name: 'Vận dụng cao' },
];
const TYPES = [
  { id: 'MCQ', label: 'Trắc nghiệm' },
  { id: 'TRUE_FALSE', label: 'Đúng / Sai' },
  { id: 'SHORT_ANSWER', label: 'Trả lời ngắn' },
  { id: 'ESSAY', label: 'Tự luận' },
];

// Đáp án của từng phương án trên thẻ câu (kho của chính giáo viên nên hiện luôn):
// trắc nghiệm → 'correct' cho phương án đúng; đúng/sai → 'true' | 'false' cho từng ý.
function optionVerdict(q: any, optId: string): 'correct' | 'true' | 'false' | '' {
  const ans = q?.answer;
  const id = String(optId).trim().toLowerCase();
  if (q?.type === 'TRUE_FALSE') {
    if (!ans || typeof ans !== 'object' || Array.isArray(ans)) return '';
    const hit = Object.entries(ans).find(([k]) => String(k).trim().toLowerCase() === id);
    if (!hit || typeof hit[1] !== 'boolean') return '';
    return hit[1] ? 'true' : 'false';
  }
  if (q?.type === 'MCQ') {
    const list = Array.isArray(ans) ? ans : [ans];
    return list.some((a) => typeof a === 'string' && a.trim().toLowerCase() === id) ? 'correct' : '';
  }
  return '';
}

// Nút pill lọc (theo thiết kế QuizBank bản cũ)
function PillButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: 'pointer',
        border: active
          ? '1.5px solid var(--lm-maroon)'
          : '1.5px solid var(--color-rule)',
        background: active
          ? 'linear-gradient(135deg, var(--lm-maroon-2), var(--lm-maroon))'
          : '#fff',
        color: active ? '#fff' : 'var(--color-ink)',
        boxShadow: active ? '0 2px 8px rgba(123,17,19,0.28)' : 'none',
        transition: 'all .15s ease',
      }}
    >
      {label}
      <span
        style={{
          fontSize: 10,
          padding: '1px 7px',
          borderRadius: 999,
          background: active ? 'rgba(255,255,255,0.25)' : 'rgba(123,17,19,0.1)',
          color: active ? '#fff' : 'var(--lm-maroon)',
        }}
      >
        {count}
      </span>
    </button>
  );
}

// Nút "+" thêm nhanh chủ đề/dạng toán (cạnh hàng pill)
function AddPillButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 12px',
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: 'pointer',
        border: '1.5px dashed var(--lm-amber)',
        background: 'transparent',
        color: 'var(--color-warning)',
        transition: 'all .15s ease',
      }}
    >
      ＋ {label}
    </button>
  );
}

export default function BankPage() {
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [texSource, setTexSource] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; questions: number; failed: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<any[]>([]);

  // ===== Nhập đề từ file Word (.docx) =====
  const [showDocxImport, setShowDocxImport] = useState(false);
  const [docxPreview, setDocxPreview] = useState<any>(null);
  const [docxParsing, setDocxParsing] = useState(false);
  const [docxSaving, setDocxSaving] = useState(false);
  const [docxChecked, setDocxChecked] = useState<Record<number, boolean>>({});
  const [docxGrade, setDocxGrade] = useState('');
  const [docxTopic, setDocxTopic] = useState('');
  const [docxForm, setDocxForm] = useState('');

  async function handleDocxFile(file: File) {
    setDocxParsing(true);
    setDocxPreview(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/bank/import-docx/preview', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          Authorization: `Bearer ${token}`,
        },
        body: file,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Không đọc được file' }));
        throw new Error(err.message || 'Không đọc được file');
      }
      const data = await res.json();
      setDocxPreview(data);
      // Chỉ TRÙNG CHÍNH XÁC mới tự bỏ tick; "nghi trùng" (gần giống) chỉ cảnh báo đỏ, giữ câu mới
      setDocxChecked(
        Object.fromEntries(
          data.questions.map((q: any, i: number) => [i, !(q.duplicateOf && q.duplicateOf.exact)]),
        ),
      );
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDocxParsing(false);
    }
  }

  async function confirmDocxImport() {
    if (!docxPreview) return;
    const selected = docxPreview.questions.filter(
      (_: any, i: number) => docxChecked[i],
    );
    if (!selected.length) {
      alert('Chọn ít nhất 1 câu hỏi để nhập');
      return;
    }
    setDocxSaving(true);
    try {
      const r = await apiFetch('/bank/import-docx/confirm', {
        method: 'POST',
        body: JSON.stringify({
          questions: selected,
          grade: docxGrade ? Number(docxGrade) : undefined,
          topicName: docxTopic || undefined,
          form: docxForm || undefined,
        }),
      });
      setShowDocxImport(false);
      setDocxPreview(null);
      loadQuestions();
      alert(`✅ Đã nhập ${r.imported} câu hỏi vào ngân hàng đề!`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDocxSaving(false);
    }
  }

  // Sửa phân loại từng câu trong màn hình duyệt Word
  function updateDocxQuestion(i: number, patch: any) {
    if (!docxPreview) return;
    setDocxPreview({
      ...docxPreview,
      questions: docxPreview.questions.map((q: any, idx: number) =>
        idx === i ? { ...q, ...patch } : q,
      ),
    });
  }

  // Bộ lọc câu hỏi
  const [fType, setFType] = useState('');
  const [fDifficulty, setFDifficulty] = useState('');
  const [fGrade, setFGrade] = useState('');
  const [fTopic, setFTopic] = useState('');
  const [fForm, setFForm] = useState('');
  const [search, setSearch] = useState('');

  // ===== Toolbar ngân hàng đề (Giai đoạn 2) =====
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // ===== Kho dạng bài (quản lý + gộp dạng trùng) =====
  const [showFormsModal, setShowFormsModal] = useState(false);
  const [formMerges, setFormMerges] = useState<any[]>([]);
  const [formBusy, setFormBusy] = useState(false);

  // Dò câu trùng trong kho
  const [showDupes, setShowDupes] = useState(false);
  const [dupPairs, setDupPairs] = useState<any[]>([]);
  const [dupeBusy, setDupeBusy] = useState(false);
  // Phạm vi rà: cả kho / 1 khối / 1 thư mục; tuỳ chọn chỉ so câu cùng chủ đề
  const [dupGrade, setDupGrade] = useState('');
  const [dupTopic, setDupTopic] = useState('');
  const [dupSameTopic, setDupSameTopic] = useState(false);
  const [dupScanned, setDupScanned] = useState(false);

  function openDuplicates() {
    // Mặc định lấy theo bộ lọc đang xem để rà nhanh đúng chỗ giáo viên đang làm
    setDupGrade(fGrade || '');
    setDupTopic(fTopic || '');
    setDupPairs([]);
    setDupScanned(false);
    setShowDupes(true);
  }

  async function scanDuplicates() {
    setShowDupes(true);
    setDupeBusy(true);
    try {
      const p = new URLSearchParams();
      if (dupGrade) p.set('grade', dupGrade);
      if (dupTopic) p.set('topicId', dupTopic);
      if (dupSameTopic) p.set('sameTopic', '1');
      const pairs = await apiFetch(`/bank/duplicates?${p.toString()}`);
      setDupScanned(true);
      setDupPairs(pairs || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDupeBusy(false);
    }
  }

  async function removeDuplicateQuestion(dupId: string) {
    const ok = window.confirm(
      'Xóa câu trùng này?\n\nCác đề thi/bài tập đang dùng câu này sẽ tự CHUYỂN SANG câu giữ lại (cùng nội dung) — không mất đề.',
    );
    if (!ok) return;
    try {
      await apiFetch('/bank/questions/batch', {
        method: 'DELETE',
        body: JSON.stringify({ ids: [dupId] }),
      });
      setDupPairs((prev) => prev.filter((p) => p.dup.id !== dupId));
      loadQuestions();
      loadSummary();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function openFormsManager() {
    setShowFormsModal(true);
    setFormBusy(true);
    try {
      const [fm, merges] = await Promise.all([
        apiFetch('/bank/forms'),
        apiFetch('/bank/forms/suggest-merges'),
      ]);
      setForms(fm);
      setFormMerges(merges || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setFormBusy(false);
    }
  }

  async function renameFormAction(oldName: string) {
    const newName = window.prompt(`✏️ Tên mới cho dạng bài "${oldName}":`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;
    try {
      await apiFetch(`/bank/forms/${encodeURIComponent(oldName)}`, {
        method: 'PATCH',
        body: JSON.stringify({ newName: newName.trim() }),
      });
      await openFormsManager();
      loadQuestions();
      loadSummary();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function deleteFormAction(name: string) {
    const ok = window.confirm(
      `Xóa dạng bài "${name}"?\n\nCác câu hỏi thuộc dạng này sẽ được GIỮ NGUYÊN và chuyển về "Không dạng bài".`,
    );
    if (!ok) return;
    try {
      await apiFetch(`/bank/forms/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (fForm === name) {
        setFForm('');
        loadQuestions({ form: '' });
      }
      await openFormsManager();
      loadSummary();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function mergeFormAction(keep: string, drop: string) {
    const ok = window.confirm(
      `Gộp dạng bài "${drop}" → "${keep}"?\n\nMọi câu hỏi của "${drop}" sẽ chuyển sang "${keep}".`,
    );
    if (!ok) return;
    try {
      const r = await apiFetch('/bank/forms/merge', {
        method: 'POST',
        body: JSON.stringify({ keep, drop }),
      });
      alert(`✅ Đã gộp — ${r.movedQuestions} câu hỏi chuyển sang "${keep}"`);
      await openFormsManager();
      loadQuestions();
      loadSummary();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function addFormAction() {
    const name = window.prompt('➕ Tên dạng bài mới:');
    if (!name || !name.trim()) return;
    try {
      await apiFetch('/bank/forms', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      await openFormsManager();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Xuất phiếu học tập theo dạng bài (docx / tex / pdf) — chọn số câu + đáp án + bản A/B
  async function exportWorksheet(formName: string, format: 'docx' | 'tex' | 'pdf') {
    const count = window.prompt(`📋 Phiếu luyện tập "${formName}" — số câu (tối đa 50):`, '10');
    if (count === null) return;
    const n = Math.max(1, Math.min(50, Number(count) || 10));
    const withAnswers = window.confirm('Kèm đáp án & lời giải ở cuối phiếu? (OK = Có, Hủy = Không)');
    const version = window.prompt('Bản phiếu (A/B/C... — để tạo nhiều phiên bản khác nhau cho học sinh):', 'A');
    const ver = (version || 'A').trim().slice(0, 4) || 'A';
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/bank/worksheets/docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ form: formName, count: n, withAnswers, version: ver, format }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || 'Xuất phiếu thất bại').slice(-300));
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Phieu-${ver}.${format === 'docx' ? 'docx' : format}`;
      a.click();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Đề thi đã tạo
  const [exams, setExams] = useState<any[]>([]);
  const [showExams, setShowExams] = useState(false);
  const [showAnswer, setShowAnswer] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState('MCQ');
  const [content, setContent] = useState('');
  const [options, setOptions] = useState([
    { id: 'A', text: '' },
    { id: 'B', text: '' },
    { id: 'C', text: '' },
    { id: 'D', text: '' },
  ]);
  const [answer, setAnswer] = useState('A');
  const [tfAnswers, setTfAnswers] = useState<any>({ a: true, b: true, c: true, d: true });
  const [shortAnswer, setShortAnswer] = useState('');
  const [solution, setSolution] = useState('');
  const [grade, setGrade] = useState('12');
  const [difficulty, setDifficulty] = useState('NHAN_BIET');
  const [topicName, setTopicName] = useState('');
  const [form, setForm] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Kiểm soát chất lượng câu hỏi
  const [stats, setStats] = useState<any>(null);
  const [showStats, setShowStats] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  async function loadStats() {
    try {
      const data = await apiFetch('/bank/questions/stats');
      setStats(data);
    } catch (e: any) {
      console.error(e);
    }
  }

  // Danh sách chủ đề (chọn từ dropdown, tạo mới được)
  const [topics, setTopics] = useState<any[]>([]);
  const [newTopicName, setNewTopicName] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);

  async function loadTopics() {
    try {
      const data = await apiFetch('/bank/topics');
      setTopics(data);
    } catch (e: any) {
      console.error(e);
    }
  }

  // Cây mục lục 3 cấp: CHƯƠNG → Bài → Dạng
  const [topicTree, setTopicTree] = useState<any[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [seeding, setSeeding] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);

  async function reclassifyAll() {
    if (
      !confirm(
        'AI sẽ phân loại lại TOÀN BỘ câu hỏi trong ngân hàng theo cây mục lục (chương → bài → dạng).\n\nViệc này có thể mất vài phút và tốn token AI. Tiếp tục?',
      )
    )
      return;
    setReclassifying(true);
    try {
      const r = await apiFetch('/bank/reclassify?limit=300', { method: 'POST' });
      alert(
        `✅ Đã phân loại lại ${r.updated}/${r.total} câu hỏi — ${r.matched} câu khớp đúng một dạng trong mục lục.\nCác câu còn lại AI không xác định được dạng phù hợp (giữ nguyên chủ đề cũ).`,
      );
      await loadQuestions();
      await loadTopicTree();
      await loadSummary();
    } catch (e: any) {
      alert('❌ ' + e.message);
    } finally {
      setReclassifying(false);
    }
  }

  async function loadTopicTree() {
    try {
      const data = await apiFetch('/bank/topics/tree');
      setTopicTree(data?.tree || []);
    } catch (e: any) {
      console.error(e);
    }
  }

  function toggleNode(id: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function seedGrade10() {
    if (!confirm('Cập nhật cây mục lục lớp 10 + 11 + 12 (CHƯƠNG → Bài → Dạng)? Chạy lại nhiều lần không bị nhân bản.')) return;
    setSeeding(true);
    try {
      const r = await apiFetch('/bank/topics/seed', { method: 'POST' });
      await loadTopicTree();
      await loadTopics();
      await loadSummary();
      alert(
        `✅ Đã cập nhật mục lục lớp ${(r.grades || []).join(', ')}: thêm ${r.created} mục, cập nhật ${r.updated} mục, chuyển ${r.migrated} câu hỏi vào chương`,
      );
    } catch (e: any) {
      alert('❌ ' + e.message);
    } finally {
      setSeeding(false);
    }
  }

  // Danh sách dạng toán (tự tổng hợp từ câu hỏi)
  const [forms, setForms] = useState<any[]>([]);

  async function loadForms() {
    try {
      const data = await apiFetch('/bank/forms');
      setForms(data);
    } catch (e: any) {
      console.error(e);
    }
  }

  // Tổng quan ngân hàng (banner thống kê)
  const [summary, setSummary] = useState<any>(null);

  async function loadSummary() {
    try {
      const data = await apiFetch('/bank/summary');
      setSummary(data);
    } catch (e: any) {
      console.error(e);
    }
    loadMatrix();
  }

  // Bảng loại câu × mức độ theo đúng khối / thư mục đang xem
  const [matrix, setMatrix] = useState<any>(null);
  async function loadMatrix(grade = fGrade, topicId = fTopic) {
    try {
      const p = new URLSearchParams();
      if (grade) p.set('grade', grade);
      if (topicId) p.set('topicId', topicId);
      setMatrix(await apiFetch(`/bank/matrix?${p.toString()}`));
    } catch {
      /* bảng thống kê lỗi không chặn trang */
    }
  }
  useEffect(() => {
    loadMatrix(fGrade, fTopic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fGrade, fTopic]);

  // Bấm ô thống kê: lọc theo loại câu và/hoặc mức; bấm lại ô đang chọn để bỏ lọc
  function pickStat(type: string, level: string) {
    const same = fType === type && fDifficulty === level;
    const t = same ? '' : type;
    const d = same ? '' : level;
    setFType(t);
    setFDifficulty(d);
    loadQuestions({ type: t, difficulty: d });
  }

  // ===== Cây mục lục (sidebar): Lớp → Chủ đề =====
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(
    new Set(['10', '11', '12']),
  );
  const [folderQuery, setFolderQuery] = useState('');

  // ===== Nguồn đề (Trường/Sở/Đề HKI...) =====
  const [sources, setSources] = useState<any[]>([]);
  const [fSource, setFSource] = useState('');
  const [fCode, setFCode] = useState('');

  async function loadSources() {
    try {
      setSources(await apiFetch('/bank/sources'));
    } catch (e: any) {
      console.error(e);
    }
  }

  async function quickAddSource() {
    const name = window.prompt('🏫 Tên nguồn đề mới (VD: Sở GD&ĐT, Đề HKI 10, Đề HSG...):');
    if (!name || !name.trim()) return;
    try {
      await apiFetch('/bank/sources', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      await loadSources();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function toggleGrade(g: string) {
    const next = new Set(expandedGrades);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setExpandedGrades(next);
  }

  // Nhóm chủ đề theo lớp (10/11/12 + "Chưa phân lớp")
  const topicsByGrade = (() => {
    const groups: Record<string, any[]> = { '10': [], '11': [], '12': [], none: [] };
    for (const t of topics as any[]) {
      const g = t.grade ? String(t.grade) : 'none';
      (groups[g] || (groups[g] = [])).push(t);
    }
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
    }
    return groups;
  })();

  const GRADE_ROWS: { key: string; label: string }[] = [
    { key: '10', label: 'TOÁN 10' },
    { key: '11', label: 'TOÁN 11' },
    { key: '12', label: 'TOÁN 12' },
    { key: 'none', label: 'CHƯA PHÂN LỚP' },
  ];

  function selectAll() {
    setFGrade('');
    setFTopic('');
    loadQuestions({ grade: '', topicId: '' });
  }

  function selectGrade(g: string) {
    const gradeParam = g === 'none' ? '' : g;
    setFGrade(gradeParam);
    setFTopic('');
    loadQuestions({ grade: gradeParam, topicId: '' });
  }

  function selectTopic(t: any) {
    setFTopic(t.id);
    const gradeParam = t.grade ? String(t.grade) : '';
    setFGrade(gradeParam);
    loadQuestions({ topicId: t.id, grade: gradeParam });
  }

  async function createTopic() {
    const name = newTopicName.trim();
    if (!name) return;
    setCreatingTopic(true);
    try {
      const created = await apiFetch('/bank/topics', {
        method: 'POST',
        body: JSON.stringify({ name, grade: Number(grade) || null }),
      });
      await loadTopics();
      setTopicName(name);
      setNewTopicName('');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreatingTopic(false);
    }
  }

  // Thêm nhanh chủ đề từ hàng pill lọc / nút ＋ trên cây (gradeOverride = lớp đang chọn)
  async function quickAddTopic(gradeOverride?: string) {
    const name = window.prompt('➕ Tên chủ đề mới:');
    if (!name || !name.trim()) return;
    try {
      await apiFetch('/bank/topics', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          grade: Number(gradeOverride ?? grade) || null,
        }),
      });
      await loadTopics();
      await loadSummary();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Xóa nguồn đề khỏi danh sách phân loại
  async function removeSourceByName(name: string) {
    const ok = window.confirm(
      `Xóa nguồn đề "${name}" khỏi danh sách phân loại?\n\nCác câu hỏi có nguồn này sẽ chuyển về không phân loại (câu hỏi vẫn giữ nguyên).`,
    );
    if (!ok) return;
    try {
      await apiFetch(`/bank/sources/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (fSource === name) {
        setFSource('');
        loadQuestions({ source: '' });
      }
      await loadSources();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Đổi tên chủ đề trong cây mục lục
  async function renameTopic(t: any) {
    const name = window.prompt(`✏️ Tên mới cho chủ đề "${t.name}":`, t.name);
    if (!name || !name.trim() || name.trim() === t.name) return;
    try {
      await apiFetch(`/bank/topics/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      await loadTopics();
      await loadSummary();
      loadQuestions();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Xóa chủ đề — câu hỏi giữ lại, chuyển về "Không phân loại"
  async function removeTopic(t: any) {
    const ok = window.confirm(
      `Xóa chủ đề "${t.name}"?\n\n${t._count?.questions ?? 0} câu hỏi bên trong sẽ được GIỮ NGUYÊN và chuyển về "Không phân loại".`,
    );
    if (!ok) return;
    try {
      await apiFetch(`/bank/topics/${t.id}`, { method: 'DELETE' });
      if (fTopic === t.id) {
        setFTopic('');
      }
      await loadTopics();
      await loadSummary();
      loadQuestions();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Thêm nhanh dạng toán từ hàng pill lọc
  async function quickAddForm() {
    const name = window.prompt('📐 Tên dạng toán mới (VD: Hàm số, Tọa độ không gian...):');
    if (!name || !name.trim()) return;
    try {
      await apiFetch('/bank/forms', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      await loadForms();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Chèn ảnh vào nội dung câu hỏi
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const solutionRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tải ảnh lên máy chủ → trả URL tuyệt đối
  async function uploadImage(file: File): Promise<string> {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/uploads/image', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'image/png',
        Authorization: `Bearer ${token}`,
      },
      body: file,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Không tải được ảnh' }));
      throw new Error(err.message || 'Không tải được ảnh');
    }
    const data = await res.json();
    if (data.compressed) {
      const origMb = (data.originalSize / 1048576).toFixed(1);
      const savedMb = (data.savedSize / 1048576).toFixed(2);
      showToast(`🖼️ Ảnh ${origMb}MB đã được nén còn ${savedMb}MB`);
    }
    return data.url;
  }

  // Dán ảnh trực tiếp (Ctrl+V)
  async function handleContentPaste(e: React.ClipboardEvent, target: 'content' | 'solution' = 'content') {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        try {
          const url = await uploadImage(file);
          insertInto(target, `![ảnh](${url})`);
        } catch (err: any) {
          alert(err.message);
        }
        return;
      }
    }
  }

  // Kéo-thả ảnh vào ô nội dung / lời giải
  async function handleContentDrop(e: React.DragEvent, target: 'content' | 'solution' = 'content') {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (!files || !files.length) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const url = await uploadImage(file);
        insertInto(target, `![ảnh](${url})`);
      } catch (err: any) {
        alert(err.message);
      }
    }
  }

  // Chèn markdown vào đúng ô (nội dung hoặc lời giải) tại vị trí con trỏ
  function insertInto(target: 'content' | 'solution', markdown: string) {
    const el = target === 'content' ? contentRef.current : solutionRef.current;
    const current = target === 'content' ? content : solution;
    const setter = target === 'content' ? setContent : setSolution;
    if (!el) {
      setter(current + '\n' + markdown + '\n');
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + markdown + current.slice(end);
    setter(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + markdown.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // Chọn ảnh từ file
  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file);
      insertInto('content', `![ảnh](${url})`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      e.target.value = '';
    }
  }

  async function loadQuestions(overrides?: {
    type?: string;
    difficulty?: string;
    q?: string;
    grade?: string;
    topicId?: string;
    form?: string;
    source?: string;
    code?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }) {
    setLoading(true);
    try {
      const typeF = overrides?.type !== undefined ? overrides.type : fType;
      const diffF = overrides?.difficulty !== undefined ? overrides.difficulty : fDifficulty;
      const qF = overrides?.q !== undefined ? overrides.q : search;
      const gradeF = overrides?.grade !== undefined ? overrides.grade : fGrade;
      const topicF = overrides?.topicId !== undefined ? overrides.topicId : fTopic;
      const formF = overrides?.form !== undefined ? overrides.form : fForm;
      const sourceF = overrides?.source !== undefined ? overrides.source : fSource;
      const codeF = overrides?.code !== undefined ? overrides.code : fCode;
      const sortF = overrides?.sort !== undefined ? overrides.sort : sort;
      // Đổi bộ lọc/tìm kiếm/sắp xếp → quay về trang 1
      const filterChanged =
        overrides &&
        (overrides.type !== undefined ||
          overrides.difficulty !== undefined ||
          overrides.q !== undefined ||
          overrides.grade !== undefined ||
          overrides.topicId !== undefined ||
          overrides.form !== undefined ||
          overrides.source !== undefined ||
          overrides.code !== undefined ||
          overrides.sort !== undefined);
      const pageF = overrides?.page !== undefined
        ? overrides.page
        : filterChanged
          ? 1
          : page;
      const limitF = overrides?.limit !== undefined ? overrides.limit : pageSize;

      const params = new URLSearchParams();
      if (typeF) params.set('type', typeF);
      if (diffF) params.set('difficulty', diffF);
      if (gradeF) params.set('grade', gradeF);
      if (topicF) params.set('topicId', topicF);
      if (formF) params.set('form', formF);
      if (sourceF) params.set('source', sourceF);
      if (codeF) params.set('code', codeF);
      if (qF && qF.trim()) params.set('q', qF.trim());
      params.set('sort', sortF);
      params.set('page', String(pageF));
      params.set('limit', String(limitF));

      const data = await apiFetch(`/bank/questions-paged?${params.toString()}`);
      setQuestions(data.items || []);
      setTotalCount(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(data.page || 1);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // ===== Toolbar: chọn tất cả / xuất file =====
  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function selectAllOnPage() {
    const ids = questions.map((q) => q.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
    }
  }

  async function exportSelected(withAnswers: boolean, mathMode: 'omml' | 'tex') {
    const ids = selectedIds.length ? selectedIds : questions.map((q) => q.id);
    if (!ids.length) {
      alert('Chưa có câu hỏi nào để xuất');
      return;
    }
    setExporting(true);
    setShowExportMenu(false);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/bank/questions/export-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids, withAnswers, mathMode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || 'Xuất file thất bại').slice(-300));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ngan-hang-cau-hoi${withAnswers ? '-dapan' : ''}${mathMode === 'tex' ? '-tex' : ''}.docx`;
      a.click();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setExporting(false);
    }
  }

  // Xóa NHIỀU câu hỏi đã chọn
  async function deleteSelected() {
    if (!selectedIds.length) return;
    const ok = window.confirm(
      `Xóa ${selectedIds.length} câu hỏi đã chọn?\n\nNếu còn câu nào CÙNG NỘI DUNG trong kho, đề thi/bài tập sẽ tự chuyển sang câu đó (không mất đề). Chỉ khi xóa hết các câu trùng nhau thì mới gỡ khỏi đề. Hành động này KHÔNG hoàn tác được!`,
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const data = await apiFetch('/bank/questions/batch', {
        method: 'DELETE',
        body: JSON.stringify({ ids: selectedIds }),
      });
      setSelectedIds([]);
      alert(`✅ ${data.message || 'Đã xóa các câu đã chọn'}`);
      loadQuestions();
      loadSummary();
      loadSources();
      loadForms();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  }

  function changeSort(value: string) {
    setSort(value);
    setShowSortMenu(false);
    loadQuestions({ sort: value });
  }

  // Tìm kiếm thông minh: hiểu "lớp X", "mức Y", tên dạng bài trong 1 câu gõ
  // Gõ tới đâu tìm tới đó nhưng chờ 300ms sau phím cuối (tránh gọi máy chủ mỗi ký tự)
  const searchTimer = useRef<any>(null);
  function smartSearch(raw: string) {
    setSearch(raw);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSmartSearch(raw), 300);
  }

  function runSmartSearch(raw: string) {
    const q = raw.trim();
    const overrides: any = {};
    // Tìm theo mã câu hỏi — gõ 1 PHẦN ĐẦU cũng được: "A1" ra mọi câu có mã bắt đầu bằng A1
    const codeHit = q.match(/^([A-Za-z]{1,4}-?\d{1,6})$/);
    if (codeHit) {
      const code = codeHit[1].toUpperCase();
      overrides.code = code;
      // Xoá sạch từ khoá + mọi bộ lọc khác để kết quả khớp ĐÚNG mã (tránh lẫn bộ lọc cũ)
      overrides.q = '';
      overrides.grade = '';
      overrides.difficulty = '';
      overrides.topicId = '';
      overrides.form = '';
      overrides.source = '';
      overrides.type = '';
      setFCode(code);
      setFGrade('');
      setFDifficulty('');
      setFTopic('');
      setFForm('');
      setFSource('');
      setFType('');
      loadQuestions(overrides);
      return;
    }
    setFCode('');
    const lop = q.match(/(?:l[oớ]p)\s*(\d{1,2})/i);
    if (lop) {
      overrides.grade = lop[1];
      setFGrade(lop[1]);
    }
    const muc = q.match(/(?:m[uứ]c)\s*(\d)/i);
    if (muc) {
      const map = ['NHAN_BIET', 'THONG_HIEU', 'VAN_DUNG', 'VAN_DUNG_CAO'];
      const d = map[Number(muc[1]) - 1];
      if (d) {
        overrides.difficulty = d;
        setFDifficulty(d);
      }
    }
    let text = q;
    const formHit = forms
      .filter((f) => f.name.length >= 5 && text.toLowerCase().includes(f.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length)[0];
    if (formHit) {
      overrides.form = formHit.name;
      setFForm(formHit.name);
      text = text.replace(new RegExp(formHit.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ').trim();
    }
    overrides.q = text;
    loadQuestions(overrides);
  }

  // ===== Thẻ câu hỏi kiểu mới (Giai đoạn 5) =====
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [detailIdx, setDetailIdx] = useState<number | null>(null);

  // Mã phân loại kiểu D02-DS-4: Dạng – Loại – Mức
  function classifyCode(q: any): string {
    const formIdx = forms.findIndex((f: any) => f.name === (q.form || ''));
    const d = formIdx >= 0 ? String(formIdx + 1).padStart(2, '0') : '00';
    const typeMap: Record<string, string> = {
      MCQ: 'TN',
      TRUE_FALSE: 'DS',
      SHORT_ANSWER: 'TLN',
      ESSAY: 'TL',
    };
    const diffMap: Record<string, string> = {
      NHAN_BIET: '1',
      THONG_HIEU: '2',
      VAN_DUNG: '3',
      VAN_DUNG_CAO: '4',
    };
    return `D${d}-${typeMap[q.type] || 'XX'}-${diffMap[q.difficulty] || '0'}`;
  }

  // Đặt nhanh mức độ cho câu hỏi
  async function setQuestionDifficulty(q: any, level: string) {
    if (q.difficulty === level) return;
    try {
      await apiFetch(`/bank/questions/${q.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ difficulty: level }),
      });
      setQuestions((prev: any[]) =>
        prev.map((x) => (x.id === q.id ? { ...x, difficulty: level } : x)),
      );
      loadSummary();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // Xuất 1 câu hỏi ra .docx
  async function exportSelectedOne(id: string) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/bank/questions/export-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids: [id], withAnswers: true, mathMode: 'omml' }),
      });
      if (!res.ok) {
        alert('Xuất file thất bại');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cau-hoi.docx';
      a.click();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function openDetail(q: any) {
    const i = questions.findIndex((x) => x.id === q.id);
    setDetailIdx(i >= 0 ? i : 0);
  }

  function copyText(t: string) {
    navigator.clipboard?.writeText(t);
  }

  async function loadExams() {
    try {
      const data = await apiFetch('/exams');
      setExams(data);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function downloadExamTex(examId: string) {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/exams/${examId}/tex`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'de_thi.tex';
    a.click();
  }

  async function downloadExamPdf(examId: string) {
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/exams/${examId}/compile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(String(err.message || '').slice(-400));
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'de_thi.pdf';
    a.click();
  }

  async function deleteExam(examId: string) {
    if (!confirm('Xóa đề thi này?')) return;
    try {
      await apiFetch(`/exams/${examId}`, { method: 'DELETE' });
      alert('Đã xóa đề thi');
      loadExams();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function deleteQuestion(q: any) {
    const ok = confirm(
      `Xóa câu hỏi ${q.code}?\n\nCảnh báo: các đề thi và bài tập đang dùng câu này cũng sẽ bị gỡ bỏ.`,
    );
    if (!ok) return;
    try {
      const data = await apiFetch(`/bank/questions/${q.id}`, {
        method: 'DELETE',
      });
      alert(data?.message || 'Đã xóa câu hỏi');
      setShowAnswer(null);
      loadQuestions();
      loadSummary();
    } catch (e: any) {
      alert(e.message || 'Không xóa được câu hỏi');
    }
  }

  useEffect(() => {
    loadQuestions();
    loadExams();
    loadTopics();
    loadTopicTree();
    loadForms();
    loadSummary();
    loadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createQuestion(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: any = { type, content };
      if (grade) body.grade = Number(grade);
      body.difficulty = difficulty || null;
      if (topicName) body.topicName = topicName;
      if (form) body.form = form.trim();
      if (source) body.source = source.trim();
      if (solution) body.solution = solution;

      if (type === 'MCQ') {
        body.options = options;
        body.answer = answer;
      } else if (type === 'TRUE_FALSE') {
        body.options = options;
        body.answer = tfAnswers;
      } else if (type === 'SHORT_ANSWER') {
        body.answer = shortAnswer;
      } else {
        body.answer = { rubric: solution || '' };
      }

      if (editingId) {
        await apiFetch(`/bank/questions/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        alert('Đã cập nhật câu hỏi!');
      } else {
        await apiFetch('/bank/questions', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        alert('Đã thêm câu hỏi!');
      }
      setContent('');
      setSolution('');
      setShortAnswer('');
      setTopicName('');
      setForm('');
      setSource('');
      setEditingId(null);
      setShowForm(false);
      loadQuestions();
      loadForms();
      loadSummary();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Điền form từ câu hỏi có sẵn để sửa
  function startEditQuestion(q: any) {
    setEditingId(q.id);
    setType(q.type);
    setContent(q.content);
    setSolution(q.solution || '');
    setGrade(q.grade ? String(q.grade) : '');
    setDifficulty(q.difficulty || 'NHAN_BIET');
    setTopicName(q.topic?.name || '');
    setForm(q.form || '');
    setSource(q.source || '');

    if (q.type === 'MCQ') {
      const opts = Array.isArray(q.options) ? q.options : [];
      setOptions([
        { id: 'A', text: opts.find((o: any) => o.id === 'A')?.text || '' },
        { id: 'B', text: opts.find((o: any) => o.id === 'B')?.text || '' },
        { id: 'C', text: opts.find((o: any) => o.id === 'C')?.text || '' },
        { id: 'D', text: opts.find((o: any) => o.id === 'D')?.text || '' },
      ]);
      setAnswer(String(q.answer || 'A'));
    } else if (q.type === 'TRUE_FALSE') {
      const opts = Array.isArray(q.options) ? q.options : [];
      setOptions(opts);
      const ans = q.answer as any;
      setTfAnswers({
        a: !!ans?.a,
        b: !!ans?.b,
        c: !!ans?.c,
        d: !!ans?.d,
      });
    } else if (q.type === 'SHORT_ANSWER') {
      setShortAnswer(String(q.answer || ''));
    }

    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function importTex() {
    if (!texSource.trim()) {
      alert('Vui lòng dán code .tex hoặc chọn file');
      return;
    }
    setImporting(true);
    try {
      const result = await apiFetch('/bank/import-tex', {
        method: 'POST',
        body: JSON.stringify({ texSource }),
      });
      alert('Đã nhập ' + result.imported + ' câu hỏi vào ngân hàng đề!');
      setTexSource('');
      setShowImport(false);
      loadQuestions();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(false);
    }
  }

  // Chia .tex thành từng nhóm ~100 câu để mỗi lần gọi không bị timeout (500+ câu vẫn chạy được)
  function splitTexIntoChunks(tex: string, chunkSize = 100): string[] {
    const normalized = String(tex || '')
      .replace(/\\begin\{vd\}/g, '\\begin{ex}')
      .replace(/\\end\{vd\}/g, '\\end{ex}')
      .replace(/\\begin\{bt\}/g, '\\begin{ex}')
      .replace(/\\end\{bt\}/g, '\\end{ex}');
    const blocks: string[] = [];
    const re = /\\begin\{ex\}[\s\S]*?\\end\{ex\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(normalized)) !== null) blocks.push(m[0]);
    if (!blocks.length) return [tex]; // không nhận diện được block ex → gửi nguyên
    const chunks: string[] = [];
    for (let i = 0; i < blocks.length; i += chunkSize) {
      chunks.push(blocks.slice(i, i + chunkSize).join('\n\n'));
    }
    return chunks;
  }

  // Bước 1: tách câu hỏi + AI phân loại thô (chủ đề/lớp/độ khó)
  async function previewImport() {
    if (!texSource.trim()) {
      alert('Vui lòng dán code .tex hoặc chọn file');
      return;
    }
    setImporting(true);
    setImportProgress(null);
    setReviewQuestions([]);
    try {
      const chunks = splitTexIntoChunks(texSource, 100);
      const all: any[] = [];
      const allFailed: any[] = [];
      for (let ci = 0; ci < chunks.length; ci++) {
        setImportProgress({
          done: ci + 1,
          total: chunks.length,
          questions: all.length,
          failed: allFailed.length,
        });
        try {
          const result = await apiFetch('/bank/import-tex/preview', {
            method: 'POST',
            body: JSON.stringify({ texSource: chunks[ci] }),
          });
          if (result.questions?.length) all.push(...result.questions);
          if (result.failed?.length) allFailed.push(...result.failed);
        } catch (e: any) {
          allFailed.push({
            index: `nhóm ${ci + 1}`,
            reason: e?.message || 'Lỗi kết nối / quá tải',
            preview: '',
          });
        }
      }
      if (all.length === 0) {
        alert(
          'Không tìm thấy câu hỏi nào trong file .tex' +
            (allFailed.length ? ` (${allFailed.length} khối không phân tích được)` : ''),
        );
        return;
      }
      // Khởi tạo giá trị phân loại: dùng gợi ý AI làm mặc định
      // Trùng CHÍNH XÁC → bôi đỏ + mặc định KHÔNG nhập; "nghi trùng" (gần giống) → vẫn nhập (GV quyết định)
      const dupeCount = all.filter((q: any) => q.duplicateOf && q.duplicateOf.exact).length;
      setReviewQuestions(
        all.map((q: any) => ({
          ...q,
          topicName: q.ai?.topic || '',
          grade: q.ai?.grade || '',
          difficulty: q.ai?.difficulty || '',
          form: q.ai?.form || '',
          include: !(q.duplicateOf && q.duplicateOf.exact),
        })),
      );
      let msg =
        `Đã tách ${all.length} câu hỏi. AI đã phân loại thô — kiểm tra và chỉnh lại nếu cần, sau đó bấm "Lưu vào ngân hàng".` +
        (dupeCount
          ? `\n\n⚠️ ${dupeCount} câu TRÙNG CHÍNH XÁC với kho (bôi đỏ) — mặc định không nhập. Bấm ô "Vẫn nhập lên" nếu muốn giữ.`
          : '');
      if (allFailed.length) {
        msg +=
          `\n\n❌ ${allFailed.length} lỗi (không biên dịch được):` +
          allFailed
            .slice(0, 6)
            .map((f: any) => `\n• ${f.index}: ${f.reason}` + (f.preview ? ` — "${f.preview}"` : ''))
            .join('') +
          (allFailed.length > 6 ? `\n… và ${allFailed.length - 6} lỗi khác` : '');
      }
      alert(msg);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  // Bước 2: lưu theo phân loại giáo viên đã chỉnh (bỏ qua câu bị tick "không nhập")
  async function confirmImport() {
    if (!reviewQuestions.length) return;
    const toImport = reviewQuestions.filter((q: any) => q.include !== false);
    if (!toImport.length) {
      alert('Không còn câu hỏi nào được chọn để nhập');
      return;
    }
    setImporting(true);
    try {
      const result = await apiFetch('/bank/import-tex/confirm', {
        method: 'POST',
        body: JSON.stringify({ questions: toImport, texSource }),
      });
      alert(`Đã lưu ${result.imported} câu hỏi vào ngân hàng đề!`);
      setReviewQuestions([]);
      setTexSource('');
      setShowImport(false);
      loadQuestions();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setImporting(false);
    }
  }

  // Sửa code inline từng câu khi duyệt nhập đề vào ngân hàng
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editCode, setEditCode] = useState('');
  const [parseBusy, setParseBusy] = useState(false);
  const [parseErr, setParseErr] = useState('');

  function openEditCode(i: number) {
    setEditingIdx(i);
    setEditCode(reviewQuestions[i]?.source || '');
    setParseErr('');
  }

  async function reparseCode() {
    if (editingIdx === null) return;
    setParseBusy(true);
    setParseErr('');
    try {
      const r = await apiFetch('/bank/parse-question', {
        method: 'POST',
        body: JSON.stringify({ tex: editCode }),
      });
      setReviewQuestions((prev) =>
        prev.map((q, idx) =>
          idx === editingIdx
            ? {
                ...q,
                type: r.type,
                content: r.content,
                options: r.options,
                answer: r.answer,
                solution: r.solution,
                source: editCode,
              }
            : q,
        ),
      );
      setEditingIdx(null);
    } catch (e: any) {
      setParseErr(e.message);
    } finally {
      setParseBusy(false);
    }
  }

  function handleFileUpload(e: any) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setTexSource(String(reader.result || ''));
    reader.readAsText(file);
  }
  async function compilePreview() {
    if (!texSource.trim()) {
      alert('Vui lòng nhập code LaTeX trước');
      return;
    }
    setCompiling(true);
    setPreviewUrl(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/exams/compile-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ source: texSource }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = String(err.message || err.error || 'Lỗi biên dịch');
        // Lấy phần cuối của log LaTeX (chỗ chứa lỗi)
        alert(msg.slice(-600));
        return;
      }
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCompiling(false);
    }
  }

  // Biên dịch thử câu hỏi đang soạn (hỗ trợ TikZ, tự bọc ex_test)
  async function compileQuestionPreview() {
    if (!content.trim()) {
      alert('Vui lòng nhập nội dung câu hỏi trước');
      return;
    }
    setCompiling(true);
    setPreviewUrl(null);
    try {
      // Xây snippet câu hỏi từ form đang soạn
      const lines: string[] = [];
      lines.push('\\begin{ex}');
      lines.push(content);
      if (type === 'MCQ') {
        lines.push('\\choice');
        options.forEach((opt) => {
          if (!opt.text.trim()) return;
          const isCorrect = answer === opt.id;
          lines.push(`{${isCorrect ? '\\True ' : ''}${opt.text}}`);
        });
      } else if (type === 'TRUE_FALSE') {
        lines.push('\\choiceTF');
        options.forEach((opt) => {
          if (!opt.text.trim()) return;
          const isTrue = tfAnswers[opt.id] === true;
          lines.push(`{${isTrue ? '\\TrueTF' : '\\FalseTF'} ${opt.text}}`);
        });
      }
      if (solution.trim()) {
        lines.push('\\loigiai{' + solution + '}');
      }
      lines.push('\\end{ex}');
      const snippet = lines.join('\n');

      const token = localStorage.getItem('token');
      const res = await fetch('/api/exams/compile-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ source: snippet }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = String(err.message || err.error || 'Lỗi biên dịch');
        alert(msg.slice(-700));
        return;
      }
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCompiling(false);
    }
  }

  const typeLabel: Record<string, string> = {
    MCQ: 'Trắc nghiệm',
    TRUE_FALSE: 'Đúng/Sai',
    SHORT_ANSWER: 'Trả lời ngắn',
    ESSAY: 'Tự luận',
  };

  // Render đệ quy cây mục lục: CHƯƠNG → Bài → Dạng
  function renderTopicNode(node: any, depth: number): any {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const expanded = expandedNodes.has(node.id);
    const active = fTopic === node.id;
    return (
      <div key={node.id}>
        <button
          type="button"
          className={`lm-tree-row${hasChildren ? '' : ' lm-topic-row'}${active ? ' active' : ''}`}
          style={{ paddingLeft: 10 + depth * 16 }}
          title={node.name}
          onClick={() => {
            if (hasChildren) toggleNode(node.id);
            else selectTopic({ id: node.id, grade: node.grade });
          }}
        >
          <span className="lm-tree-toggle">{hasChildren ? (expanded ? '∨' : '›') : '·'}</span>
          <span className="lm-tree-label">
            {node.name}
          </span>
          <span className="lm-tree-count">{node.count ?? 0}</span>
        </button>
        {hasChildren && expanded && (
          <div className="lm-tree-children">
            {node.children.map((c: any) => renderTopicNode(c, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  // Phạm vi đang xem: "Lớp 12 · Chương I …" để đầu trang và bảng thống kê khớp nhau
  function findTopicName(nodes: any[], id: string): string {
    for (const n of nodes || []) {
      if (n.id === id) return n.name;
      const hit = findTopicName(n.children || [], id);
      if (hit) return hit;
    }
    return '';
  }
  const scopeLabel = [
    fGrade ? (fGrade === 'none' ? 'Chưa phân lớp' : `Lớp ${fGrade}`) : 'Tất cả các lớp',
    fTopic ? findTopicName(topicTree, fTopic) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  // Các bộ lọc đang bật — hiện thành chip, bấm × để bỏ riêng từng cái
  const activeChips: { key: string; k: string; v: string; clear: () => void }[] = [];
  if (fGrade)
    activeChips.push({ key: 'grade', k: 'Lớp', v: fGrade, clear: () => { setFGrade(''); setFTopic(''); loadQuestions({ grade: '', topicId: '' }); } });
  if (fTopic)
    activeChips.push({ key: 'topic', k: 'Thư mục', v: findTopicName(topicTree, fTopic) || '…', clear: () => { setFTopic(''); loadQuestions({ topicId: '' }); } });
  if (fType)
    activeChips.push({ key: 'type', k: 'Loại', v: TYPES.find((t) => t.id === fType)?.label || fType, clear: () => { setFType(''); loadQuestions({ type: '' }); } });
  if (fDifficulty)
    activeChips.push({ key: 'diff', k: 'Mức', v: DIFFICULTY_LABEL[fDifficulty] || fDifficulty, clear: () => { setFDifficulty(''); loadQuestions({ difficulty: '' }); } });
  if (fForm)
    activeChips.push({ key: 'form', k: 'Dạng', v: fForm, clear: () => { setFForm(''); loadQuestions({ form: '' }); } });
  if (fSource)
    activeChips.push({ key: 'source', k: 'Nguồn', v: fSource, clear: () => { setFSource(''); loadQuestions({ source: '' }); } });
  if (fCode)
    activeChips.push({ key: 'code', k: 'Mã', v: fCode, clear: () => { setFCode(''); loadQuestions({ code: '' }); } });
  if (search.trim())
    activeChips.push({ key: 'q', k: 'Tìm', v: search.trim(), clear: () => { setSearch(''); loadQuestions({ q: '' }); } });
  function clearAllFilters() {
    setFGrade(''); setFTopic(''); setFType(''); setFDifficulty('');
    setFForm(''); setFSource(''); setFCode(''); setSearch('');
    loadQuestions({ grade: '', topicId: '', type: '', difficulty: '', form: '', source: '', code: '', q: '' });
  }

  return (
    <div className="page-container lm-bank">
      <div className="lm-layout">
        {/* ================= SIDEBAR: CÂY MỤC LỤC ================= */}
        <BankTopicSidebar
          tree={topicTree}
          summary={summary}
          fGrade={fGrade}
          fTopic={fTopic}
          onSelectAll={selectAll}
          onSelectGrade={selectGrade}
          onSelectTopic={(n: any) => selectTopic({ id: n.id, grade: n.grade })}
          onReload={async () => {
            await Promise.all([loadTopicTree(), loadTopics(), loadSummary()]);
            loadQuestions();
          }}
          forms={forms}
          fForm={fForm}
          onPickForm={(v) => {
            setFForm(v);
            loadQuestions({ form: v });
          }}
          onOpenForms={openFormsManager}
          sources={sources}
          fSource={fSource}
          onPickSource={(v) => {
            setFSource(v);
            loadQuestions({ source: v });
          }}
          onAddSource={quickAddSource}
          onRemoveSource={removeSourceByName}
          seeding={seeding}
          onSeed={seedGrade10}
          reclassifying={reclassifying}
          onReclassify={reclassifyAll}
        />

        {/* ================= VÙNG NỘI DUNG ================= */}
        <div className="lm-main">
        {/* ================= ĐẦU TRANG: tên phạm vi + thao tác chính ================= */}
        <header className="bk-head">
          <div className="bk-head-text">
            <h1>Ngân hàng câu hỏi</h1>
            <p>
              {scopeLabel}
              {' · '}
              <b>{totalCount}</b> câu
            </p>
          </div>
          <div className="bk-head-actions">
            <button type="button" className="btn btn-outline bk-btn" onClick={() => setShowDocxImport(true)}>
              Nhập từ Word
            </button>
            <button type="button" className="btn btn-outline bk-btn" aria-expanded={showImport} onClick={() => setShowImport(!showImport)}>
              Nhập đề .tex
            </button>
            <button type="button" className="btn btn-outline bk-btn" onClick={openDuplicates}>
              Rà câu trùng
            </button>
            <button type="button" className="btn sh-btn-accent bk-btn" aria-expanded={showForm} onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Đóng' : '+ Thêm câu hỏi'}
            </button>
          </div>
        </header>

        {/* ================= THỐNG KÊ LOẠI CÂU × MỨC ĐỘ (bấm ô để lọc) ================= */}
        <section className="bk-stats" aria-label="Thống kê theo loại câu và mức độ — bấm để lọc">
          <span />
          {LEVELS.map((lv) => (
            <button
              key={lv.id}
              type="button"
              className={`bk-stats-h${fDifficulty === lv.id && !fType ? ' on' : ''}`}
              title={lv.name}
              onClick={() => pickStat('', lv.id)}
            >
              {lv.label}
            </button>
          ))}
          <span className="bk-stats-h">Tổng</span>
          {TYPES.map((ty) => {
            const row = matrix?.matrix?.[ty.id] || {};
            const rowTotal = Object.values(row).reduce((s: number, n: any) => s + (n || 0), 0);
            return (
              <Fragment key={ty.id}>
                <button
                  type="button"
                  className={`bk-stats-row${fType === ty.id && !fDifficulty ? ' on' : ''}`}
                  onClick={() => pickStat(ty.id, '')}
                >
                  {ty.label}
                </button>
                {LEVELS.map((lv) => {
                  const n = row[lv.id] || 0;
                  const on = fType === ty.id && fDifficulty === lv.id;
                  return (
                    <button
                      key={lv.id}
                      type="button"
                      className={`bk-cell${n ? '' : ' is-zero'}${on ? ' on' : ''}`}
                      aria-pressed={on}
                      aria-label={`${ty.label}, ${lv.name}: ${n} câu`}
                      onClick={() => pickStat(ty.id, lv.id)}
                    >
                      {n}
                    </button>
                  );
                })}
                <span className="bk-tot">{rowTotal as number}</span>
              </Fragment>
            );
          })}
          <span className="bk-stats-foot">
            {TYPES.some((ty) => matrix?.matrix?.[ty.id]?.none)
              ? `${TYPES.reduce((n, ty) => n + (matrix?.matrix?.[ty.id]?.none || 0), 0)} câu chưa gắn mức độ (không nằm trong 4 cột).`
              : 'Bấm một ô để lọc; bấm lại để bỏ lọc.'}
          </span>
          <span className="bk-tot bk-grand">{matrix?.total ?? summary?.total ?? 0}</span>
        </section>

      {showForm && (
        <form onSubmit={createQuestion} className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 17 }}>
              {editingId ? `Sửa câu hỏi ${''}` : 'Tạo câu hỏi mới'}
            </h3>
            {editingId && (
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: 'auto', padding: '5px 12px', fontSize: 12 }}
                onClick={() => {
                  setEditingId(null);
                  setShowForm(false);
                }}
              >
                Hủy sửa
              </button>
            )}
          </div>
          <div className="form-group">
            <label>Loại câu hỏi</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="MCQ">Trắc nghiệm (1 đáp án)</option>
              <option value="TRUE_FALSE">Đúng/Sai (4 phát biểu)</option>
              <option value="SHORT_ANSWER">Trả lời ngắn</option>
              <option value="ESSAY">Tự luận</option>
            </select>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Nội dung câu hỏi (dùng $...$ cho công thức toán) *</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <a
                  href="/teacher/latex-guide"
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: 'var(--color-accent)', textUnderlineOffset: 3 }}
                >
                  🧮 Bảng công thức LaTeX
                </a>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '4px 12px', fontSize: 12 }}
                  onClick={() => fileInputRef.current?.click()}
              >
                📷 Chèn ảnh
              </button>
              </span>
            </label>
            <textarea
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={(e) => handleContentPaste(e, 'content')}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleContentDrop(e, 'content')}
              rows={4}
              placeholder={'Nội dung câu hỏi... (kéo-thả ảnh vào đây, dán Ctrl+V, hoặc chèn code \\begin{tikzpicture}...)'}
              style={{ width: '100%', padding: 10, border: '1px solid var(--color-rule)', borderRadius: 8, background: 'var(--color-paper)', color: 'var(--color-ink)' }}
              required
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFilePick}
            />
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
              Mẹo: kéo-thả ảnh vào ô, dán trực tiếp (Ctrl+V) hoặc bấm "Chèn ảnh" — ảnh sẽ được lưu trên máy chủ, nén tự động nếu &gt; 1MB và hiển thị trong câu hỏi + PDF đề thi.
            </p>
          </div>

          {type === 'MCQ' && (
            <div>
              <label style={{ fontWeight: 500, fontSize: 14 }}>Các đáp án (đánh dấu đáp án đúng)</label>
              {options.map((opt, i) => (
                <div key={opt.id} className="form-group" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="correct"
                    checked={answer === opt.id}
                    onChange={() => setAnswer(opt.id)}
                    style={{ width: 'auto' }}
                  />
                  <span style={{ fontWeight: 600, width: 20 }}>{opt.id}.</span>
                  <input
                    value={opt.text}
                    onChange={(e) => {
                      const newOpts = [...options];
                      newOpts[i].text = e.target.value;
                      setOptions(newOpts);
                    }}
                    placeholder={`Đáp án ${opt.id}`}
                  />
                </div>
              ))}
            </div>
          )}

          {type === 'TRUE_FALSE' && (
            <div>
              <label style={{ fontWeight: 500, fontSize: 14 }}>4 phát biểu (tick = Đúng)</label>
              {['a', 'b', 'c', 'd'].map((id, i) => (
                <div key={id} className="form-group" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!tfAnswers[id]}
                    onChange={(e) => setTfAnswers({ ...tfAnswers, [id]: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  <input
                    value={options[i]?.text || ''}
                    onChange={(e) => {
                      const newOpts = [...options];
                      newOpts[i] = { id, text: e.target.value };
                      setOptions(newOpts);
                    }}
                    placeholder={`Phát biểu ${id}`}
                  />
                </div>
              ))}
            </div>
          )}

          {type === 'SHORT_ANSWER' && (
            <div className="form-group">
              <label>Đáp án ngắn</label>
              <input value={shortAnswer} onChange={(e) => setShortAnswer(e.target.value)} placeholder="VD: 42" />
            </div>
          )}

          <div className="form-group">
            <label>Lời giải (tùy chọn)</label>
            <textarea
              ref={solutionRef}
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              onPaste={(e) => handleContentPaste(e, 'solution')}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleContentDrop(e, 'solution')}
              rows={2}
              placeholder="Lời giải... (kéo-thả ảnh / Ctrl+V để chèn ảnh)"
              style={{ width: '100%', padding: 10, border: '1px solid var(--color-rule-2)', borderRadius: 8 }}
            />
          </div>

          <div className="form-group">
            <label>Dạng toán (phân loại theo dạng — chọn hoặc gõ mới)</label>
            <input
              value={form}
              onChange={(e) => setForm(e.target.value)}
              placeholder="VD: Hàm số, Phương trình, Tọa độ không gian..."
              list="dang-toan-list"
            />
            <datalist id="dang-toan-list">
              {forms.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} ({f.count} câu)
                </option>
              ))}
            </datalist>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
              Dạng toán mới sẽ tự xuất hiện trong bộ lọc sau khi lưu.
            </p>
          </div>

          <div className="form-group">
            <label>Nguồn đề (Trường / Sở / Đề HKI / Đề HSG...)</label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="VD: Sở GD&ĐT, Đề HKI 10, Đề HSG..."
              list="nguon-de-list"
            />
            <datalist id="nguon-de-list">
              {sources.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.count} câu)
                </option>
              ))}
            </datalist>
          </div>

          <div className="form-group">
            <label>Chủ đề (chọn từ danh sách hoặc tạo mới)</label>
            <select
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
            >
              <option value="">— Chọn chủ đề —</option>
              {topics
                .filter((t) => !t.grade || String(t.grade) === String(grade))
                .map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              {topicName &&
                !topics.some((t) => t.name === topicName) && (
                  <option value={topicName}>{topicName} (mới)</option>
                )}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                placeholder="Tên chủ đề mới (VD: Tích phân)"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-outline"
                style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
                onClick={createTopic}
                disabled={creatingTopic || !newTopicName.trim()}
              >
                {creatingTopic ? 'Đang lưu…' : '+ Tạo chủ đề'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4 }}>
              Chủ đề tạo mới sẽ được lưu và chọn lại ở lần sau.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 16 }}>
            <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
              <label>Lớp</label>
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                <option value="10">Lớp 10</option>
                <option value="11">Lớp 11</option>
                <option value="12">Lớp 12</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: 0 }}>
              <label>Độ khó</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="NHAN_BIET">Nhận biết</option>
                <option value="THONG_HIEU">Thông hiểu</option>
                <option value="VAN_DUNG">Vận dụng</option>
                <option value="VAN_DUNG_CAO">Vận dụng cao</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" disabled={saving} style={{ flex: 1, minWidth: 0 }}>
              {saving ? 'Đang lưu...' : editingId ? 'Cập nhật câu hỏi' : 'Lưu câu hỏi'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ width: 'auto', padding: '10px 16px' }}
              onClick={compileQuestionPreview}
              disabled={compiling}
            >
              {compiling ? '⏳ Đang biên dịch...' : '🧪 Biên dịch thử câu hỏi'}
            </button>
          </div>

          {previewUrl && (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <strong style={{ fontSize: 14 }}>Xem trước câu hỏi (PDF)</strong>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '4px 12px', fontSize: 12 }}
                  onClick={() => setPreviewUrl(null)}
                >
                  ✕ Đóng
                </button>
              </div>
              <iframe
                src={previewUrl}
                style={{ width: '100%', height: 480, border: '1px solid var(--color-rule)', borderRadius: 8, background: 'var(--color-paper-2)' }}
                title="Xem trước câu hỏi"
              />
            </div>
          )}
        </form>
      )}

      {showImport && (
        <div
          style={{
            background: 'var(--color-paper-2)',
            padding: 20,
            borderRadius: 12,
            marginBottom: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <h3 style={{ marginBottom: 8 }}>📥 Nhập đề từ code LaTeX (ex_test)</h3>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 12 }}>
            Dán code LaTeX theo cấu trúc begin{'{ex}'}...end{'{ex}'} hoặc tải file
            .tex. Hệ thống sẽ tự tách thành từng câu hỏi và nạp vào ngân hàng đề.
          </p>
          <div style={{ marginBottom: 16 }}>
            <LatexEditor value={texSource} onChange={setTexSource} height="380px" />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label
              className="btn"
              style={{ width: 'auto', cursor: 'pointer', background: '#6b7280', padding: '10px 16px' }}
            >
              📂 Tải file .tex
              <input
                type="file"
                accept=".tex,text/plain"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
            <button
              className="btn btn-outline"
              style={{ width: 'auto', padding: '10px 16px' }}
              onClick={compilePreview}
              disabled={compiling}
            >
              {compiling ? '⏳ Đang biên dịch...' : '🧪 Biên dịch thử (xem PDF)'}
            </button>
            <button className="btn" style={{ width: 'auto' }} onClick={previewImport} disabled={importing}>
              {importing ? '⏳ Đang phân loại…' : 'AI phân loại & nạp vào ngân hàng'}
            </button>
          </div>

          {/* Thanh tiến trình nhập + đếm số câu + lỗi biên dịch */}
          {importing && importProgress && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--color-muted)', marginBottom: 6 }}>
                <span>
                  Đang phân loại nhóm {importProgress.done}/{importProgress.total}
                </span>
                <span>
                  ✅ {importProgress.questions} câu · ❌ {importProgress.failed} lỗi
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--color-rule)', borderRadius: 999, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round((importProgress.done / Math.max(1, importProgress.total)) * 100)}%`,
                    background: 'var(--color-accent)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Bảng duyệt câu hỏi + phân loại AI (giáo viên chỉnh trước khi lưu) */}
          {reviewQuestions.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <strong style={{ fontSize: 14 }}>
                  Duyệt {reviewQuestions.length} câu hỏi — AI đã phân loại thô, chỉnh lại nếu cần
                </strong>
                <button
                  className="btn"
                  style={{ width: 'auto', padding: '8px 16px' }}
                  onClick={confirmImport}
                  disabled={importing}
                >
                  {importing ? 'Đang lưu...' : 'Lưu vào ngân hàng'}
                </button>
              </div>

              {reviewQuestions.map((q, i) => (
                <div
                  key={i}
                  style={{
                    padding: 12,
                    border: q.duplicateOf
                      ? '2px solid color-mix(in oklch, var(--color-danger) 55%, transparent)'
                      : '1px solid var(--color-rule)',
                    borderRadius: 8,
                    marginBottom: 10,
                    background: q.duplicateOf
                      ? 'color-mix(in oklch, var(--color-danger) 5%, var(--color-paper))'
                      : 'var(--color-paper)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="badge badge-accent">Câu {i + 1}</span>
                    <span className="badge">{q.type === 'MCQ' ? 'Trắc nghiệm' : q.type === 'TRUE_FALSE' ? 'Đúng/Sai' : q.type === 'SHORT_ANSWER' ? 'Trả lời ngắn' : 'Tự luận'}</span>
                    {q.duplicateOf && (
                      <>
                        <span className="badge badge-danger">⚠️ Nghi trùng câu {q.duplicateOf.code} trong kho</span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginLeft: 'auto', fontWeight: 700, color: 'var(--color-danger)' }}>
                          <input
                            type="checkbox"
                            checked={q.include !== false}
                            onChange={(e) =>
                              setReviewQuestions(
                                reviewQuestions.map((r, idx) =>
                                  idx === i ? { ...r, include: e.target.checked } : r,
                                ),
                              )
                            }
                            style={{ width: 'auto' }}
                          />
                          Vẫn nhập câu này lên
                        </label>
                      </>
                    )}
                  </div>
                  {q.duplicateOf && (
                    <div style={{ fontSize: 12.5, marginBottom: 8, border: '1px dashed color-mix(in oklch, var(--color-danger) 45%, transparent)', borderRadius: 6, padding: 8, background: 'var(--color-surface)' }}>
                      <div style={{ fontWeight: 800, color: 'var(--color-danger)', marginBottom: 4 }}>
                        📄 Câu đã có trong kho (để so sánh):
                      </div>
                      <div style={{ maxHeight: 110, overflowY: 'auto' }}>
                        <LatexRenderer content={(q.duplicateOf.content || '').slice(0, 500)} />
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 14, marginBottom: 10 }}>
                    <LatexRenderer content={q.content} />
                  </div>
                  {q.options && Array.isArray(q.options) && q.options.length > 0 && (
                    <div style={{ fontSize: 14, paddingLeft: 12, marginBottom: 10 }}>
                      {q.options.map((opt: any) => (
                        <div key={opt.id} style={{ display: 'flex', gap: 6 }}>
                          <strong>{opt.id}.</strong>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <LatexRenderer content={opt.text} />
                          </span>
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

                  {/* ✏️ Sửa code inline */}
                  <button
                    type="button"
                    className="lm-filter-btn"
                    style={{ fontSize: 12, padding: '3px 10px', marginBottom: 8 }}
                    onClick={() => {
                      if (editingIdx === i) setEditingIdx(null);
                      else openEditCode(i);
                    }}
                  >
                    {editingIdx === i ? '✕ Đóng sửa code' : '✏️ Sửa code câu này'}
                  </button>
                  {editingIdx === i && (
                    <div style={{ marginBottom: 8 }}>
                      <textarea
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
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
                      {parseErr && (
                        <div style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: 4 }}>
                          ⚠️ {parseErr}
                        </div>
                      )}
                      <button
                        type="button"
                        className="btn"
                        style={{ width: 'auto', marginTop: 6, fontSize: 12, padding: '5px 12px' }}
                        disabled={parseBusy}
                        onClick={reparseCode}
                      >
                        {parseBusy ? '⏳ Đang biên dịch…' : '✅ Biên dịch lại câu này'}
                      </button>
                    </div>
                  )}

                  {q.ai && (q.ai.topic || q.ai.form) && (
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--color-warning)',
                        background: 'var(--color-paper-2)',
                        border: '1px dashed var(--color-rule-2)',
                        borderRadius: 6,
                        padding: '4px 8px',
                        marginBottom: 8,
                      }}
                    >
                      🤖 AI gợi ý — Chủ đề: <b>{q.ai.topic || '—'}</b> · Lớp {q.ai.grade || '—'} · Mức {q.ai.difficulty || '—'} · Dạng bài: <b>{q.ai.form || '—'}</b>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ width: 160, marginBottom: 0 }}>
                      <label style={{ fontSize: 12 }}>Phần</label>
                      <select
                        value={String(q.part ?? 1)}
                        onChange={(e) => {
                          const pt = Number(e.target.value);
                          const newType =
                            pt === 1
                              ? 'MCQ'
                              : pt === 2
                                ? 'TRUE_FALSE'
                                : pt === 3
                                  ? 'SHORT_ANSWER'
                                  : 'ESSAY';
                          setReviewQuestions(
                            reviewQuestions.map((r, idx) =>
                              idx === i ? { ...r, part: pt, type: newType } : r,
                            ),
                          );
                        }}
                        style={{ padding: '7px 10px', fontSize: 13 }}
                      >
                        <option value="1">I — Trắc nghiệm</option>
                        <option value="2">II — Đúng/Sai</option>
                        <option value="3">III — Trả lời ngắn</option>
                        <option value="4">IV — Tự luận</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1, minWidth: 160, marginBottom: 0 }}>
                      <label style={{ fontSize: 12 }}>Chủ đề</label>
                      <input
                        value={q.topicName}
                        onChange={(e) =>
                          setReviewQuestions(
                            reviewQuestions.map((r, idx) =>
                              idx === i ? { ...r, topicName: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="VD: Hàm số"
                        style={{ padding: '7px 10px', fontSize: 13 }}
                      />
                    </div>
                    <div className="form-group" style={{ width: 110, marginBottom: 0 }}>
                      <label style={{ fontSize: 12 }}>Lớp</label>
                      <select
                        value={String(q.grade || '')}
                        onChange={(e) =>
                          setReviewQuestions(
                            reviewQuestions.map((r, idx) =>
                              idx === i ? { ...r, grade: Number(e.target.value) || null } : r,
                            ),
                          )
                        }
                        style={{ padding: '7px 10px', fontSize: 13 }}
                      >
                        <option value="">—</option>
                        <option value="10">10</option>
                        <option value="11">11</option>
                        <option value="12">12</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ width: 150, marginBottom: 0 }}>
                      <label style={{ fontSize: 12 }}>Độ khó</label>
                      <select
                        value={q.difficulty || ''}
                        onChange={(e) =>
                          setReviewQuestions(
                            reviewQuestions.map((r, idx) =>
                              idx === i ? { ...r, difficulty: e.target.value } : r,
                            ),
                          )
                        }
                        style={{ padding: '7px 10px', fontSize: 13 }}
                      >
                        <option value="">—</option>
                        <option value="NHAN_BIET">Nhận biết</option>
                        <option value="THONG_HIEU">Thông hiểu</option>
                        <option value="VAN_DUNG">Vận dụng</option>
                        <option value="VAN_DUNG_CAO">Vận dụng cao</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
                      <label style={{ fontSize: 12 }}>Dạng bài (AI phân loại)</label>
                      <input
                        value={q.form || ''}
                        onChange={(e) =>
                          setReviewQuestions(
                            reviewQuestions.map((r, idx) =>
                              idx === i ? { ...r, form: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="VD: Phương trình mặt phẳng, Khoảng cách điểm–mặt…"
                        style={{ padding: '7px 10px', fontSize: 13 }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {previewUrl && (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <strong style={{ fontSize: 14 }}>📄 Xem trước PDF</strong>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '4px 12px', fontSize: 12 }}
                  onClick={() => setPreviewUrl(null)}
                >
                  ✕ Đóng
                </button>
              </div>
              <iframe
                src={previewUrl}
                style={{ width: '100%', height: 560, border: '1px solid var(--color-rule)', borderRadius: 10, background: '#525659' }}
                title="Xem trước PDF"
              />
            </div>
          )}
        </div>
      )}

      {/* ================= BỘ LỌC ĐANG ÁP DỤNG (bấm × để bỏ) ================= */}
      {activeChips.length > 0 && (
        <div className="bk-chips" aria-label="Bộ lọc đang áp dụng">
          {activeChips.map((c) => (
            <span key={c.key} className="bk-chip">
              <span className="bk-chip-k">{c.k}</span>
              {c.v}
              <button type="button" aria-label={`Bỏ lọc ${c.k}`} onClick={c.clear}>
                ×
              </button>
            </span>
          ))}
          {activeChips.length > 1 && (
            <button type="button" className="bk-chip-clear" onClick={clearAllFilters}>
              Xoá tất cả
            </button>
          )}
        </div>
      )}

      {/* ================= THANH THAO TÁC KHI ĐÃ CHỌN CÂU ================= */}
      {selectedIds.length > 0 && (
        <div className="bk-selbar" role="region" aria-label="Thao tác với câu đã chọn">
          <b>Đã chọn {selectedIds.length} câu</b>
          <button type="button" className="bk-selbar-btn" onClick={() => exportSelected(false, 'omml')} disabled={exporting}>
            Xuất Word
          </button>
          <button type="button" className="bk-selbar-btn" onClick={() => exportSelected(true, 'omml')} disabled={exporting}>
            Xuất kèm đáp án
          </button>
          <button type="button" className="bk-selbar-btn" onClick={() => exportSelected(false, 'tex')} disabled={exporting}>
            Xuất .tex
          </button>
          <span className="bk-selbar-sp" />
          <button type="button" className="bk-selbar-btn is-danger" onClick={deleteSelected} disabled={deleting}>
            {deleting ? 'Đang xoá…' : 'Xoá'}
          </button>
          <button type="button" className="bk-selbar-btn" onClick={() => setSelectedIds([])}>
            Bỏ chọn
          </button>
        </div>
      )}

      {/* ================= TOOLBAR + PANEL LỌC (Giai đoạn 2 & 4) ================= */}
      <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        {/* SẮP XẾP */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => {
              setShowSortMenu(!showSortMenu);
              setShowExportMenu(false);
            }}
          >
            ⬆ SẮP XẾP: {{
              newest: 'Mới nhất',
              oldest: 'Cũ nhất',
              code: 'Mã A→Z',
              difficulty: 'Độ khó',
              form: 'Dạng toán',
              topic: 'Chủ đề',
            }[sort] || 'Mới nhất'}{' '}
            ▾
          </button>
          {showSortMenu && (
            <div className="toolbar-menu">
              {[
                { id: 'newest', label: 'Mới nhất trước' },
                { id: 'oldest', label: 'Cũ nhất trước' },
                { id: 'code', label: 'Mã câu A → Z' },
                { id: 'difficulty', label: 'Theo độ khó (dễ → khó)' },
                { id: 'form', label: 'Theo dạng toán' },
                { id: 'topic', label: 'Theo chủ đề' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`toolbar-menu-item${sort === s.id ? ' active' : ''}`}
                  onClick={() => changeSort(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* CHỌN TẤT CẢ */}
        <button type="button" className="toolbar-btn" onClick={selectAllOnPage}>
          ☰ CHỌN TẤT CẢ (TỐI ĐA {pageSize})
        </button>
        {/* BỘ LỌC */}
        <button
          type="button"
          className={`toolbar-btn${showFilterPanel ? ' active' : ''}`}
          onClick={() => setShowFilterPanel(!showFilterPanel)}
        >
          ⚙ BỘ LỌC {showFilterPanel ? '▴' : '▾'}
        </button>

        {/* XUẤT FILE */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => {
              setShowExportMenu(!showExportMenu);
              setShowSortMenu(false);
            }}
            disabled={exporting}
          >
            {exporting ? '⏳ Đang xuất…' : '✓ XUẤT FILE ▾'}
          </button>
          {showExportMenu && (
            <div className="toolbar-menu" style={{ minWidth: 290 }}>
              <div className="toolbar-menu-note">
                {selectedIds.length
                  ? `Xuất ${selectedIds.length} câu đã chọn`
                  : `Chưa chọn câu nào — sẽ xuất ${questions.length} câu trên trang`}
              </div>
              <button type="button" className="toolbar-menu-item" onClick={() => exportSelected(false, 'omml')}>
                📄 Đề (Word, công thức MathType)
              </button>
              <button type="button" className="toolbar-menu-item" onClick={() => exportSelected(true, 'omml')}>
                📄 Đề + đáp án & lời giải (Word)
              </button>
              <button type="button" className="toolbar-menu-item" onClick={() => exportSelected(false, 'tex')}>
                📄 Đề (cú pháp TeX — MathType Toggle TeX)
              </button>
              <button type="button" className="toolbar-menu-item" onClick={() => exportSelected(true, 'tex')}>
                📄 Đề + đáp án (cú pháp TeX)
              </button>
            </div>
          )}
        </div>

        {/* Đổi chế độ xem + phân trang */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {totalCount} câu
          </span>
          <button
            type="button"
            className={`toolbar-icon-btn${viewMode === 'list' ? ' active' : ''}`}
            onClick={() => setViewMode('list')}
            title="Xem danh sách"
          >
            ☰
          </button>
          <button
            type="button"
            className={`toolbar-icon-btn${viewMode === 'grid' ? ' active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Xem lưới 2 cột"
          >
            ▦
          </button>
        </div>
      </div>

      {/* ===== PANEL LỌC "Chọn loại câu hỏi" (dropdown, Giai đoạn 4) ===== */}
      {showFilterPanel && (
        <div className="lm-filter-panel">
          <div className="lm-filter-head">
            <span>Chọn loại câu hỏi</span>
            <button
              type="button"
              className="lm-filter-close"
              onClick={() => setShowFilterPanel(false)}
              title="Đóng"
            >
              ✕
            </button>
          </div>
          <div className="lm-filter-body">
            {/* KHỐI LỚP */}
            <div className="lm-filter-section">
              <div className="lm-filter-section-head">
                <span className="lm-filter-chip">Khối lớp</span>
                <span className="lm-filter-rule" />
              </div>
              <div className="lm-filter-options">
                {[
                  { id: '', label: 'Tất cả' },
                  { id: '10', label: 'Lớp 10' },
                  { id: '11', label: 'Lớp 11' },
                  { id: '12', label: 'Lớp 12' },
                ].map((g) => (
                  <button
                    key={g.id || 'all'}
                    type="button"
                    className={`lm-filter-btn${fGrade === g.id ? ' on' : ''}`}
                    onClick={() => {
                      const next = fGrade === g.id ? '' : g.id;
                      setFGrade(next);
                      loadQuestions({ grade: next });
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* MỨC ĐỘ */}
            <div className="lm-filter-section">
              <div className="lm-filter-section-head">
                <span className="lm-filter-chip">Mức độ</span>
                <span className="lm-filter-rule" />
              </div>
              <div className="lm-filter-options">
                {[
                  { id: 'NHAN_BIET', label: 'Mức 1 · Nhận biết' },
                  { id: 'THONG_HIEU', label: 'Mức 2 · Thông hiểu' },
                  { id: 'VAN_DUNG', label: 'Mức 3 · Vận dụng' },
                  { id: 'VAN_DUNG_CAO', label: 'Mức 4 · VDC' },
                ].map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`lm-filter-btn${fDifficulty === d.id ? ' on' : ''}`}
                    onClick={() => {
                      const next = fDifficulty === d.id ? '' : d.id;
                      setFDifficulty(next);
                      loadQuestions({ difficulty: next });
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KIỂU CÂU HỎI */}
            <div className="lm-filter-section">
              <div className="lm-filter-section-head">
                <span className="lm-filter-chip">Kiểu</span>
                <span className="lm-filter-rule" />
              </div>
              <div className="lm-filter-options">
                {[
                  { id: 'MCQ', label: 'Trắc nghiệm' },
                  { id: 'TRUE_FALSE', label: 'Đúng/Sai' },
                  { id: 'SHORT_ANSWER', label: 'Trả lời ngắn' },
                  { id: 'ESSAY', label: 'Tự luận' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`lm-filter-btn${fType === t.id ? ' on' : ''}`}
                    onClick={() => {
                      const next = fType === t.id ? '' : t.id;
                      setFType(next);
                      loadQuestions({ type: next });
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* CHỦ ĐỀ */}
            <div className="lm-filter-section">
              <div className="lm-filter-section-head">
                <span className="lm-filter-chip">Chủ đề</span>
                <span className="lm-filter-rule" />
                <button
                  type="button"
                  className="lm-filter-add"
                  onClick={() => quickAddTopic()}
                  title="Thêm chủ đề mới"
                >
                  ＋ Thêm
                </button>
              </div>
              <div className="lm-filter-options">
                <button
                  type="button"
                  className={`lm-filter-btn${fTopic === '' ? ' on' : ''}`}
                  onClick={() => {
                    setFTopic('');
                    loadQuestions({ topicId: '' });
                  }}
                >
                  Tất cả
                </button>
                {topics.map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`lm-filter-btn${fTopic === t.id ? ' on' : ''}`}
                    onClick={() => {
                      setFTopic(t.id);
                      loadQuestions({ topicId: t.id });
                    }}
                    title={t.name}
                  >
                    {t.name} ({t._count?.questions ?? 0})
                  </button>
                ))}
              </div>
            </div>

            {/* DẠNG TOÁN */}
            <div className="lm-filter-section">
              <div className="lm-filter-section-head">
                <span className="lm-filter-chip">Dạng toán</span>
                <span className="lm-filter-rule" />
                <button
                  type="button"
                  className="lm-filter-add"
                  onClick={quickAddForm}
                  title="Thêm dạng toán mới"
                >
                  ＋ Thêm
                </button>
              </div>
              <div className="lm-filter-options">
                <button
                  type="button"
                  className={`lm-filter-btn${fForm === '' ? ' on' : ''}`}
                  onClick={() => {
                    setFForm('');
                    loadQuestions({ form: '' });
                  }}
                >
                  Tất cả
                </button>
                {forms.map((f: any) => (
                  <button
                    key={f.name}
                    type="button"
                    className={`lm-filter-btn${fForm === f.name ? ' on' : ''}`}
                    onClick={() => {
                      setFForm(f.name);
                      loadQuestions({ form: f.name });
                    }}
                  >
                    {f.name} ({f.count})
                  </button>
                ))}
              </div>
            </div>

            <div className="lm-filter-foot">
              <button
                type="button"
                className="lm-filter-btn"
                onClick={() => {
                  setFGrade('');
                  setFType('');
                  setFDifficulty('');
                  setFTopic('');
                  setFForm('');
                  setSearch('');
                  loadQuestions({
                    grade: '',
                    type: '',
                    difficulty: '',
                    topicId: '',
                    form: '',
                    q: '',
                  });
                }}
              >
                ✕ Bỏ tất cả bộ lọc
              </button>
              <button
                type="button"
                className="lm-filter-btn on"
                style={{ marginLeft: 'auto' }}
                onClick={() => setShowFilterPanel(false)}
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Phân trang */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className="toolbar-btn"
          disabled={page <= 1}
          onClick={() => loadQuestions({ page: page - 1 })}
          style={{ opacity: page <= 1 ? 0.5 : 1 }}
        >
          ‹ Trang trước
        </button>
        <span className="pager-pill">
          Trang {page} / {totalPages}
        </span>
        <button
          type="button"
          className="toolbar-btn"
          disabled={page >= totalPages}
          onClick={() => loadQuestions({ page: page + 1 })}
          style={{ opacity: page >= totalPages ? 0.5 : 1 }}
        >
          Trang sau ›
        </button>
        <select
          value={pageSize}
          onChange={(e) => {
            const n = Number(e.target.value);
            setPageSize(n);
            loadQuestions({ limit: n, page: 1 });
          }}
          style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--lm-line)', fontSize: 12.5, background: 'var(--color-surface)' }}
        >
          <option value={10}>10 câu/trang</option>
          <option value={20}>20 câu/trang</option>
          <option value={40}>40 câu/trang</option>
          <option value={60}>60 câu/trang</option>
        </select>
      </div>

      {/* Thanh tìm kiếm + hành động phụ */}
      <div
        className="card"
        style={{ padding: 12, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <input
          value={search}
          onChange={(e) => smartSearch(e.target.value)}
          placeholder="🔍 Tìm nội dung (gõ LaTeX thoải mái: x^2+1, \\frac12…) hoặc mã câu (A1, A398…), lớp 12, mức 3, tên dạng bài…"
          style={{ flex: 2, minWidth: 220, padding: 10, border: '1.5px solid var(--lm-line-2)', borderRadius: 8, fontSize: 14, background: 'var(--color-surface)' }}
        />
        <button
          className="toolbar-btn"
          onClick={() => {
            setShowExams(!showExams);
            if (!showExams) loadExams();
          }}
        >
          📄 Đề thi đã tạo ({exams.length})
        </button>
        <button
          className="toolbar-btn"
          onClick={() => {
            setShowStats(!showStats);
            if (!showStats) loadStats();
          }}
        >
          📊 Chất lượng câu hỏi
        </button>
        <button className="toolbar-btn" onClick={openFormsManager} title="Quản lý kho dạng bài: đổi tên, gộp dạng trùng, xóa">
          📐 Kho dạng bài
        </button>
        <button className="toolbar-btn" onClick={openDuplicates} title="Dò các câu hỏi trùng nhau trong kho để dọn">
          🔍 Dò câu trùng
        </button>
      </div>


      {/* ===== Kiểm soát chất lượng câu hỏi ===== */}
      {showStats && (
        <div className="card" style={{ marginBottom: 20, padding: 18 }}>
          <h3 style={{ marginBottom: 12 }}>📊 Kiểm soát chất lượng câu hỏi</h3>
          {!stats ? (
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>Đang phân tích…</p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <span className="badge">Tổng câu: {stats.total}</span>
                <span className="badge badge-accent">Đã có dữ liệu: {stats.withData}</span>
                <span className="badge badge-danger">⚠️ Cảnh báo: {stats.flaggedCount}</span>
                {stats.summary.quakho > 0 && (
                  <span className="badge badge-warning">Nghi sai đáp án/quá khó: {stats.summary.quakho}</span>
                )}
                {stats.summary.quade > 0 && (
                  <span className="badge badge-success">Quá dễ: {stats.summary.quade}</span>
                )}
              </div>
              {stats.flagged.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                  🎉 Không có câu hỏi bất thường nào (cần ≥ 5 lượt làm để đánh giá).
                </p>
              ) : (
                <div className="lm-table-sticky" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-rule)' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Mã</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Nội dung</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Chủ đề</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Đúng/TS</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>Tỉ lệ</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left' }}>Cảnh báo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.flagged.map((f: any) => (
                        <tr key={f.id} style={{ borderBottom: '1px solid var(--color-rule)' }}>
                          <td className="mono" style={{ padding: '6px 8px' }}>{f.code}</td>
                          <td style={{ padding: '6px 8px', maxWidth: 300 }}>
                            <LatexRenderer content={f.content} />
                          </td>
                          <td style={{ padding: '6px 8px', color: 'var(--color-muted)' }}>{f.topicName}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <span className="mono">{f.correct}/{f.total}</span>
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <span
                              className="mono"
                              style={{
                                fontWeight: 700,
                                color: (f.rate ?? 100) < 25 ? 'var(--color-danger)' : 'var(--color-success)',
                              }}
                            >
                              {f.rate}%
                            </span>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <span className="badge badge-warning">{f.flag}</span>
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

      {showExams && (
        <div className="card" style={{ marginBottom: 20, padding: 18 }}>
          <h3 style={{ marginBottom: 12 }}>📄 Đề thi đã tạo</h3>
          {exams.length === 0 ? (
            <p style={{ color: 'var(--color-muted)', fontSize: 14 }}>
              Chưa có đề thi nào. Vào menu "Tạo đề thi" để tạo.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {exams.map((ex) => (
                <div
                  key={ex.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 12,
                    background: 'var(--color-paper-2)',
                    borderRadius: 10,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 14 }}>{ex.title}</strong>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
                      {ex._count?.items ?? 0} câu ·{' '}
                      {new Date(ex.createdAt).toLocaleDateString('vi-VN')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-outline"
                      style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                      onClick={() => downloadExamTex(ex.id)}
                    >
                      📄 .tex
                    </button>
                    <button
                      className="btn btn-outline"
                      style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                      onClick={() => downloadExamPdf(ex.id)}
                    >
                      📑 PDF
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                      onClick={() => deleteExam(ex.id)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="skeleton-table">
          {Array.from({ length: 8 }).map((_, si) => (
            <div key={si} className="skeleton" />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: 'center', padding: 42, color: 'var(--color-muted)' }}
        >
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)' }}>
            Không có câu hỏi phù hợp.
          </p>
          <p style={{ fontSize: 13, marginTop: 4 }}>
            Hãy bỏ bớt bộ lọc, chọn mục khác trong Cây mục lục, hoặc nhập thêm câu hỏi.
          </p>
        </div>
      ) : (
        <div
          className={viewMode === 'grid' ? 'q-grid' : ''}
          style={
            viewMode === 'grid'
              ? undefined
              : { display: 'flex', flexDirection: 'column', gap: 12 }
          }
        >
          {questions.map((q, idx) => {
            const globalNo = (page - 1) * pageSize + idx + 1;
            const isSel = selectedIds.includes(q.id);
            return (
              <div key={q.id} className={`q-card${isSel ? ' selected' : ''}`}>
                {/* Header đỏ đô: số câu + loại + mức + THÊM */}
                <div className="q-card-head">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggleSelect(q.id)}
                    style={{ width: 'auto', cursor: 'pointer' }}
                    title="Chọn câu để xuất file"
                  />
                  <span className="q-no">Câu {globalNo}</span>
                  <button
                    type="button"
                    className="bk-qcode mono"
                    title={`Tìm các câu có mã bắt đầu bằng ${q.code}`}
                    onClick={() => smartSearch(q.code)}
                  >
                    {q.code}
                  </button>
                  <span className="q-type-badge">{typeLabel[q.type] || q.type}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {[
                      { id: 'NHAN_BIET', label: 'Mức 1' },
                      { id: 'THONG_HIEU', label: 'Mức 2' },
                      { id: 'VAN_DUNG', label: 'Mức 3' },
                      { id: 'VAN_DUNG_CAO', label: 'Mức 4' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`q-level-pill${q.difficulty === m.id ? ' on' : ''}`}
                        title={`Đặt mức: ${DIFFICULTY_LABEL[m.id] || m.id}`}
                        onClick={() => setQuestionDifficulty(q, m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="q-level-pill"
                      style={{ borderStyle: 'dashed' }}
                      onClick={() => setOpenMenuId(openMenuId === q.id ? null : q.id)}
                    >
                      Thêm ▾
                    </button>
                  </div>
                </div>

                {/* Menu THÊM */}
                {openMenuId === q.id && (
                  <div className="q-card-menu">
                    <button type="button" className="toolbar-menu-item" onClick={() => { setOpenMenuId(null); startEditQuestion(q); }}>
                      Sửa câu hỏi
                    </button>
                    <button type="button" className="toolbar-menu-item" onClick={() => { setOpenMenuId(null); exportSelectedOne(q.id); }}>
                      Xuất câu này (.docx)
                    </button>
                    <button
                      type="button"
                      className="toolbar-menu-item"
                      onClick={() => {
                        setOpenMenuId(null);
                        setSelectedIds((prev) => prev.includes(q.id) ? prev.filter((x) => x !== q.id) : [...prev, q.id]);
                      }}
                    >
                      {isSel ? 'Bỏ chọn câu này' : 'Chọn câu này'}
                    </button>
                    <button type="button" className="toolbar-menu-item" style={{ color: 'var(--color-danger)' }} onClick={() => { setOpenMenuId(null); deleteQuestion(q); }}>
                      Xoá câu hỏi
                    </button>
                  </div>
                )}

                {/* Thân kem: mã phân loại + nội dung */}
                <div className="q-card-body">
                  <span className="q-code-tag">
                    {classifyCode(q)}
                    {q.form ? ` · ${q.form}` : ''}
                  </span>
                  <div style={{ fontSize: 14.5 }} className={showAnswer === q.id ? '' : 'q-clamp'}>
                    <LatexRenderer content={q.content} />
                  </div>

                  {q.options && Array.isArray(q.options) && q.options.length > 0 && (
                    <div className={`bk-opts${q.type === 'TRUE_FALSE' ? ' is-tf' : ''}${showAnswer === q.id ? '' : ' q-clamp-short'}`}>
                      {q.options.map((opt: any) => {
                        const v = optionVerdict(q, opt.id);
                        return (
                          <div
                            key={opt.id}
                            className={`bk-opt${v === 'correct' ? ' is-correct' : ''}`}
                          >
                            <span className="bk-opt-id mono">{opt.id}{q.type === 'TRUE_FALSE' ? ')' : '.'}</span>
                            <span className="bk-opt-text">
                              <LatexRenderer content={opt.text} />
                            </span>
                            {v === 'true' && <span className="bk-tf is-true">Đúng</span>}
                            {v === 'false' && <span className="bk-tf is-false">Sai</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Đáp án + lời giải khi mở */}
                  {showAnswer === q.id && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 12,
                        borderRadius: 8,
                        background: 'var(--color-paper-2)',
                        border: '1px solid var(--color-rule-2)',
                        fontSize: 14,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <strong style={{ color: 'var(--lm-maroon)' }}>Đáp án:</strong>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <LatexRenderer content={formatAnswer(q.answer)} />
                        </div>
                      </div>
                      {q.solution && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 8 }}>
                          <strong style={{ color: 'var(--lm-maroon)' }}>Lời giải:</strong>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <LatexRenderer content={q.solution} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Nút chân thẻ */}
                  <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {q.topic && <span className="badge">{q.topic.name}</span>}
                    {q.form && (
                      <span
                        className="badge badge-accent"
                        style={{ cursor: 'pointer' }}
                        title={`Lọc theo dạng bài: ${q.form}`}
                        onClick={() => {
                          setFForm(q.form);
                          loadQuestions({ form: q.form });
                        }}
                      >
                        {q.form}
                      </span>
                    )}
                    {q.grade && <span className="badge">Lớp {q.grade}</span>}
                    {q.source && <span className="badge">{q.source}</span>}
                    <button
                      type="button"
                      className="lm-filter-btn"
                      style={{ marginLeft: 'auto', padding: '5px 10px', fontSize: 11.5 }}
                      onClick={() => setShowAnswer(showAnswer === q.id ? null : q.id)}
                    >
                      {showAnswer === q.id ? 'Ẩn lời giải' : 'Xem lời giải'}
                    </button>
                    <button
                      type="button"
                      className="lm-filter-btn"
                      style={{ padding: '5px 10px', fontSize: 11.5 }}
                      onClick={() => openDetail(q)}
                    >
                      Chi tiết
                    </button>
                    <button
                      type="button"
                      className="lm-filter-btn"
                      style={{ padding: '5px 10px', fontSize: 11.5 }}
                      onClick={() => startEditQuestion(q)}
                    >
                      Sửa
                    </button>
                    <button
                      type="button"
                      className="lm-filter-btn"
                      style={{ padding: '5px 10px', fontSize: 11.5, color: 'var(--color-danger)', borderColor: 'color-mix(in oklch, var(--color-danger) 45%, transparent)' }}
                      onClick={() => deleteQuestion(q)}
                    >
                      Xoá
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* ================= MODAL CHI TIẾT CÂU HỎI (Giai đoạn 6) ================= */}
      {detailIdx !== null && questions[detailIdx] && (() => {
        const q = questions[detailIdx];
        const isTF = q.type === 'TRUE_FALSE';
        const tfAns: any = q.answer && typeof q.answer === 'object' ? q.answer : {};
        return (
          <div className="lm-detail-backdrop" onClick={() => setDetailIdx(null)}>
            <div className="lm-detail" onClick={(e) => e.stopPropagation()}>
              <div className="lm-detail-head">
                <span className="q-no">Câu {(page - 1) * pageSize + detailIdx + 1}</span>
                <span className="q-type-badge">{typeLabel[q.type] || q.type}</span>
                <span className="lm-code-chip">[{classifyCode(q)}]</span>
                <span style={{ fontSize: 12, opacity: 0.85 }}>
                  ID: {q.id.slice(0, 5)}...{q.id.slice(-5)}
                </span>
                <button
                  type="button"
                  className="lm-copy-btn"
                  title="Sao chép ID"
                  onClick={() => copyText(q.id)}
                >
                  ⧉
                </button>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[
                    { id: 'NHAN_BIET', label: 'Mức 1' },
                    { id: 'THONG_HIEU', label: 'Mức 2' },
                    { id: 'VAN_DUNG', label: 'Mức 3' },
                    { id: 'VAN_DUNG_CAO', label: 'Mức 4' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`q-level-pill${q.difficulty === m.id ? ' on' : ''}`}
                      onClick={() => setQuestionDifficulty(q, m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="lm-detail-close"
                    onClick={() => setDetailIdx(null)}
                    title="Đóng"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="lm-detail-body">
                <span className="q-code-tag">
                  {classifyCode(q)}
                  {q.form ? ` · ${q.form}` : ''}
                </span>
                <div style={{ fontSize: 15 }}>
                  <LatexRenderer content={q.content} />
                </div>

                {isTF && Array.isArray(q.options) && q.options.length > 0 && (
                  <table className="tf-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Mệnh đề</th>
                        <th style={{ width: 90 }}>đúng</th>
                        <th style={{ width: 90 }}>sai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.options.map((o: any) => (
                        <tr key={o.id}>
                          <td>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                              <span className="stt-badge">{o.id}</span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <LatexRenderer content={o.text} />
                              </span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`tf-circle${tfAns[o.id] === true ? ' on' : ''}`} />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className={`tf-circle${tfAns[o.id] === false ? ' on' : ''}`} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {!isTF && Array.isArray(q.options) && q.options.length > 0 && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14.5 }}>
                    {q.options.map((o: any) => {
                      const isCorrect = String(q.answer) === String(o.id);
                      return (
                        <div
                          key={o.id}
                          style={{
                            display: 'flex',
                            gap: 10,
                            alignItems: 'flex-start',
                            padding: '6px 10px',
                            borderRadius: 8,
                            background: isCorrect
                              ? 'color-mix(in oklch, var(--color-success) 16%, var(--color-paper))'
                              : 'transparent',
                            border: isCorrect
                              ? '1.5px solid var(--color-success)'
                              : '1.5px solid transparent',
                          }}
                          title={isCorrect ? 'Đáp án đúng' : undefined}
                        >
                          <span
                            className="stt-badge"
                            style={
                              isCorrect
                                ? {
                                    background: 'var(--color-success)',
                                    color: '#fff',
                                    borderColor: 'var(--color-success)',
                                  }
                                : undefined
                            }
                          >
                            {String(o.id).toLowerCase()}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, fontWeight: isCorrect ? 700 : undefined }}>
                            <LatexRenderer content={o.text} />
                          </span>
                          {isCorrect && (
                            <span
                              style={{
                                color: 'var(--color-success)',
                                fontSize: 12.5,
                                fontWeight: 800,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              ✓ Đúng
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!isTF && (!q.options || !q.options.length) && (
                  <div style={{ marginTop: 12, fontSize: 15, fontWeight: 700, color: 'var(--lm-maroon)' }}>
                    Đáp án: <LatexRenderer content={formatAnswer(q.answer)} />
                  </div>
                )}

                {q.solution && (
                  <div className="lm-solution">
                    <div className="lm-solution-title">Lời giải</div>
                    <LatexRenderer content={q.solution} />
                  </div>
                )}
              </div>

              <div className="lm-detail-foot">
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => alert('Đã ghi nhận báo cáo lỗi cho câu này. Cảm ơn thầy/cô!')}
                >
                  ⚑ Báo cáo lỗi
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => {
                    setDetailIdx(null);
                    startEditQuestion(q);
                  }}
                >
                  ✏️ Sửa
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() => {
                    setDetailIdx(null);
                    deleteQuestion(q);
                  }}
                >
                  🗑️ Xóa
                </button>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="toolbar-btn"
                    disabled={detailIdx <= 0}
                    style={{ opacity: detailIdx <= 0 ? 0.5 : 1 }}
                    onClick={() => setDetailIdx(detailIdx - 1)}
                  >
                    ‹ Trước
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    disabled={detailIdx >= questions.length - 1}
                    style={{ opacity: detailIdx >= questions.length - 1 ? 0.5 : 1 }}
                    onClick={() => setDetailIdx(detailIdx + 1)}
                  >
                    Sau ›
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => {
                      setSelectedIds((prev) => (prev.includes(q.id) ? prev : [...prev, q.id]));
                      setDetailIdx(null);
                    }}
                  >
                    ☐ Chọn câu
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Dò câu trùng */}
      {showDupes && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 50%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1860,
            padding: 16,
          }}
          onClick={() => setShowDupes(false)}
        >
          <div
            style={{
              background: 'var(--color-paper)',
              borderRadius: 14,
              maxWidth: 760,
              width: '100%',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>🔍 Dò câu hỏi trùng</h2>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="toolbar-btn" onClick={scanDuplicates} disabled={dupeBusy}>
                  {dupScanned ? '🔄 Quét lại' : '▶ Bắt đầu rà'}
                </button>
                <button className="toolbar-btn" onClick={() => setShowDupes(false)}>✕ Đóng</button>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
              So khớp chuẩn hóa nội dung (bỏ dấu, hoa thường, định dạng LaTeX; vẫn phân biệt \\sin/\\cos, \\le/\\ge…). Xóa câu trùng: đề thi/bài tập đang dùng sẽ tự chuyển sang câu giữ lại cùng nội dung — không mất đề.
            </p>
            <div className="xl-quick" style={{ marginBottom: 12 }}>
              <div className="st-field" style={{ flex: '0 1 140px' }}>
                <label htmlFor="dup-grade">Khối</label>
                <select id="dup-grade" value={dupGrade} onChange={(e) => { setDupGrade(e.target.value); setDupTopic(''); }}>
                  <option value="">Tất cả khối</option>
                  <option value="10">Lớp 10</option>
                  <option value="11">Lớp 11</option>
                  <option value="12">Lớp 12</option>
                </select>
              </div>
              <div className="st-field" style={{ flex: '1 1 260px' }}>
                <label htmlFor="dup-topic">Thư mục (gồm cả thư mục con)</label>
                <select id="dup-topic" value={dupTopic} onChange={(e) => setDupTopic(e.target.value)}>
                  <option value="">Toàn bộ {dupGrade ? `lớp ${dupGrade}` : 'kho'}</option>
                  {(function flat(nodes: any[], depth: number): any[] {
                    return (nodes || []).flatMap((n: any) =>
                      dupGrade && n.grade && String(n.grade) !== dupGrade
                        ? []
                        : [
                            <option key={n.id} value={n.id}>
                              {'— '.repeat(depth)}
                              {n.name} ({n.count})
                            </option>,
                            ...flat(n.children, depth + 1),
                          ],
                    );
                  })(topicTree, 0)}
                </select>
              </div>
              <label className="st-switch" style={{ flex: '1 1 220px', fontSize: 14 }}>
                <input type="checkbox" checked={dupSameTopic} onChange={(e) => setDupSameTopic(e.target.checked)} />
                Chỉ so các câu cùng chủ đề (nhanh hơn)
              </label>
            </div>
            {dupeBusy ? (
              <p style={{ color: 'var(--color-muted)' }}>Đang quét…</p>
            ) : !dupScanned ? (
              <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                Chọn phạm vi rồi bấm “Bắt đầu rà”. Rà trong 1 thư mục hoặc 1 khối nhanh hơn nhiều so với cả kho.
              </p>
            ) : dupPairs.length === 0 ? (
              <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                🎉 Không tìm thấy câu hỏi nào trùng nhau trong phạm vi đã chọn.
              </p>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dupPairs.map((p, i) => (
                  <div key={i} style={{ border: '1px solid var(--color-rule)', borderRadius: 8, padding: 10, background: 'var(--color-surface)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                      <span className="badge">{p.exact ? 'Trùng hoàn toàn' : 'Gần giống ~90%'}</span>
                      <span className="badge badge-success mono">Giữ: {p.keep.code}</span>
                      <span className="badge badge-danger mono">Trùng: {p.dup.code}</span>
                      <button
                        type="button"
                        className="lm-filter-btn"
                        style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11.5, color: 'var(--color-danger)', borderColor: 'color-mix(in oklch, var(--color-danger) 45%, transparent)' }}
                        onClick={() => removeDuplicateQuestion(p.dup.id)}
                      >
                        🗑️ Xóa câu trùng
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
                      <div style={{ borderLeft: '3px solid var(--color-success)', paddingLeft: 8 }}>
                        <LatexRenderer content={(p.keep.content || '').slice(0, 300)} />
                      </div>
                      <div style={{ borderLeft: '3px solid var(--color-danger)', paddingLeft: 8 }}>
                        <LatexRenderer content={(p.dup.content || '').slice(0, 300)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Kho dạng bài */}
      {showFormsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 50%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1850,
            padding: 16,
          }}
          onClick={() => setShowFormsModal(false)}
        >
          <div
            style={{
              background: 'var(--color-paper)',
              borderRadius: 14,
              maxWidth: 760,
              width: '100%',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>📐 Kho dạng bài</h2>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="toolbar-btn" onClick={addFormAction}>＋ Thêm dạng bài</button>
                <button className="toolbar-btn" onClick={() => setShowFormsModal(false)}>✕ Đóng</button>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
              Đổi tên dạng → tự cập nhật mọi câu hỏi · Gộp dạng trùng → câu chuyển sang dạng giữ · Xóa dạng → câu về "Không dạng bài"
            </p>

            {formBusy ? (
              <p style={{ color: 'var(--color-muted)' }}>Đang tải…</p>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {formMerges.length > 0 && (
                  <div
                    style={{
                      marginBottom: 12,
                      border: '1px dashed var(--color-rule-2)',
                      background: 'var(--color-paper-2)',
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-warning)', marginBottom: 6 }}>
                      🔍 Gợi ý gộp dạng gần giống ({formMerges.length})
                    </div>
                    {formMerges.map((s, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '4px 0', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--color-danger)' }}>"{s.drop}" ({s.dropCount} câu)</span>
                        <span>→</span>
                        <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>"{s.keep}" ({s.keepCount} câu)</span>
                        <button
                          type="button"
                          className="lm-filter-btn on"
                          style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11.5 }}
                          onClick={() => mergeFormAction(s.keep, s.drop)}
                        >
                          ✅ Gộp
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {forms.length === 0 ? (
                  <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Chưa có dạng bài nào.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {forms.map((f) => (
                      <div
                        key={f.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          border: '1px solid var(--color-rule)',
                          borderRadius: 8,
                          background: 'var(--color-surface)',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13 }}>{f.name}</span>
                        <span className="badge">{f.count} câu</span>
                        {Object.entries(f.byGrade || {}).map(([g, n]) => (
                          <span key={g} className="badge badge-accent" style={{ fontSize: 10.5 }}>
                            {g}: {n as number}
                          </span>
                        ))}
                        <button
                          type="button"
                          className="lm-filter-btn"
                          style={{ padding: '3px 10px', fontSize: 11.5 }}
                          onClick={() => {
                            setShowFormsModal(false);
                            setFForm(f.name);
                            loadQuestions({ form: f.name });
                          }}
                          title="Lọc câu hỏi theo dạng bài này"
                        >
                          🔍 Lọc
                        </button>
                        <button
                          type="button"
                          className="lm-filter-btn on"
                          style={{ padding: '3px 8px', fontSize: 11.5 }}
                          onClick={() => exportWorksheet(f.name, 'docx')}
                          title="Xuất phiếu luyện tập dạng bài này (Word)"
                        >
                          📋 DOCX
                        </button>
                        <button
                          type="button"
                          className="lm-filter-btn"
                          style={{ padding: '3px 8px', fontSize: 11.5 }}
                          onClick={() => exportWorksheet(f.name, 'tex')}
                          title="Xuất phiếu luyện tập dạng bài này (.tex)"
                        >
                          📄 TEX
                        </button>
                        <button
                          type="button"
                          className="lm-filter-btn"
                          style={{ padding: '3px 8px', fontSize: 11.5 }}
                          onClick={() => exportWorksheet(f.name, 'pdf')}
                          title="Xuất phiếu luyện tập dạng bài này (PDF)"
                        >
                          📕 PDF
                        </button>
                        <button
                          type="button"
                          className="lm-filter-btn"
                          style={{ padding: '3px 8px', fontSize: 11.5 }}
                          onClick={() => renameFormAction(f.name)}
                          title="Đổi tên dạng bài"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="lm-filter-btn"
                          style={{ padding: '3px 8px', fontSize: 11.5, color: 'var(--color-danger)', borderColor: 'color-mix(in oklch, var(--color-danger) 45%, transparent)' }}
                          onClick={() => deleteFormAction(f.name)}
                          title="Xóa dạng bài"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal nhập đề từ Word */}
      {showDocxImport && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in oklch, var(--color-ink) 50%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1800,
            padding: 16,
          }}
          onClick={() => setShowDocxImport(false)}
        >
          <div
            style={{
              background: 'var(--color-paper)',
              borderRadius: 14,
              maxWidth: 820,
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 18,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>📄 Nhập đề từ file Word (.docx)</h2>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 10 }}>
              Đáp án đúng: <strong>gạch chân hoặc bôi đỏ</strong> · Trả lời ngắn: "Đáp án: X" · Lời giải sau "Lời giải" · Công thức Word tự chuyển LaTeX · <strong>🤖 AI gợi ý chủ đề + dạng bài từng câu (vài đồng/lần)</strong>
            </p>

            {!docxPreview ? (
              <div
                style={{
                  border: '2px dashed var(--color-rule)',
                  borderRadius: 10,
                  padding: 28,
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => document.getElementById('docx-file-input')?.click()}
              >
                <div style={{ fontSize: 30 }}>{docxParsing ? '⏳' : '📄'}</div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>
                  {docxParsing ? 'Đang phân tích file…' : 'Bấm để chọn file .docx'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  File đề soạn theo mẫu (Azota/Word): PHẦN I, II, III, IV
                </p>
                <input
                  id="docx-file-input"
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  style={{ display: 'none' }}
                  disabled={docxParsing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleDocxFile(f);
                    e.target.value = '';
                  }}
                />
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div className="form-group" style={{ width: 120, margin: 0 }}>
                    <label style={{ fontSize: 11 }}>Khối lớp</label>
                    <select value={docxGrade} onChange={(e) => setDocxGrade(e.target.value)}>
                      <option value="">—</option>
                      <option value="10">10</option>
                      <option value="11">11</option>
                      <option value="12">12</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: 180, margin: 0 }}>
                    <label style={{ fontSize: 11 }}>Chủ đề (tùy chọn — tạo mới nếu chưa có)</label>
                    <input value={docxTopic} onChange={(e) => setDocxTopic(e.target.value)} placeholder="VD: Đạo hàm" />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: 180, margin: 0 }}>
                    <label style={{ fontSize: 11 }}>Dạng toán (tùy chọn)</label>
                    <input
                      value={docxForm}
                      onChange={(e) => setDocxForm(e.target.value)}
                      placeholder="VD: Hàm số, Tọa độ không gian..."
                      list="dang-toan-list"
                    />
                  </div>
                </div>

                <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--color-rule)', borderRadius: 8 }}>
                  <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-muted)', borderBottom: '1px solid var(--color-rule)' }}>
                    Phân tích được <strong>{docxPreview.count}</strong> câu — tick câu muốn nhập:
                  </div>
                  {docxPreview.questions.map((q: any, i: number) => (
                    <label
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        padding: '9px 12px',
                        borderBottom: '1px solid var(--color-rule)',
                        cursor: 'pointer',
                        background: docxChecked[i]
                          ? 'color-mix(in oklch, var(--color-success) 7%, var(--color-paper))'
                          : 'var(--color-paper-2)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!docxChecked[i]}
                        onChange={(e) => setDocxChecked((prev) => ({ ...prev, [i]: e.target.checked }))}
                        style={{ width: 'auto', marginTop: 4 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span className="badge badge-accent">
                            {q.type === 'MCQ' ? 'Trắc nghiệm' : q.type === 'TRUE_FALSE' ? 'Đúng/Sai' : q.type === 'SHORT_ANSWER' ? 'Trả lời ngắn' : 'Tự luận'}
                          </span>
                          {q.difficulty && <span className="badge badge-warning">{q.difficulty}</span>}
                          {q.duplicateOf && (
                            <span className="badge badge-danger" title="Câu này đã có trong kho — đã tự bỏ tick">
                              ⚠️ Trùng câu {q.duplicateOf.code}
                            </span>
                          )}
                          {q.type === 'MCQ' && <span className="badge badge-success">Đáp án: {String(q.answer)}</span>}
                          {q.type === 'TRUE_FALSE' && (
                            <span className="badge badge-success">
                              Đúng: {Object.entries(q.answer).filter(([, v]) => v).map(([k]) => k).join(', ') || '—'}
                            </span>
                          )}
                          {q.type === 'SHORT_ANSWER' && <span className="badge badge-success">Đáp án: {String(q.answer)}</span>}
                        </div>
                        <div style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>
                          {q.content.slice(0, 200)}
                          {q.content.length > 200 ? '…' : ''}
                        </div>
                        {q.ai && (q.ai.topic || q.ai.form) && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: 'var(--color-warning)',
                              background: 'var(--color-paper-2)',
                              border: '1px dashed var(--color-rule-2)',
                              borderRadius: 6,
                              padding: '4px 8px',
                              marginTop: 6,
                            }}
                          >
                            🤖 AI gợi ý — Chủ đề: <b>{q.ai.topic || '—'}</b> · Lớp {q.ai.grade || '—'} · Mức {q.ai.difficulty || '—'} · Dạng bài: <b>{q.ai.form || '—'}</b>
                          </div>
                        )}
                        {q.duplicateOf && (
                          <div style={{ fontSize: 12, marginTop: 6, border: '1px dashed color-mix(in oklch, var(--color-danger) 45%, transparent)', borderRadius: 6, padding: 8, background: 'var(--color-surface)' }}>
                            <div style={{ fontWeight: 800, color: 'var(--color-danger)', marginBottom: 4 }}>
                              📄 Câu nghi trùng đã có trong kho (so sánh — bỏ tick nếu không nhập):
                            </div>
                            <div style={{ maxHeight: 90, overflowY: 'auto' }}>
                              <LatexRenderer content={(q.duplicateOf.content || '').slice(0, 400)} />
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                          <input
                            value={q.topicName || ''}
                            onChange={(e) => updateDocxQuestion(i, { topicName: e.target.value })}
                            placeholder="Chỉnh Chủ đề…"
                            style={{ flex: 1, minWidth: 130, padding: '5px 8px', fontSize: 12, border: '1px solid var(--color-rule)', borderRadius: 6, background: 'var(--color-surface)' }}
                          />
                          <input
                            value={q.form || ''}
                            onChange={(e) => updateDocxQuestion(i, { form: e.target.value })}
                            placeholder="Chỉnh Dạng bài…"
                            style={{ flex: 1, minWidth: 150, padding: '5px 8px', fontSize: 12, border: '1px solid var(--color-rule)', borderRadius: 6, background: 'var(--color-surface)' }}
                          />
                        </div>
                      </div>
                    </label>
                  ))}
                  {docxPreview.warnings?.length > 0 && (
                    <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--color-warning, var(--color-warning))' }}>
                      ⚠️ {docxPreview.warnings.map((w: string, i: number) => (
                        <div key={i}>• {w}</div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button className="btn" style={{ flex: 1 }} onClick={confirmDocxImport} disabled={docxSaving}>
                    {docxSaving ? 'Đang nhập…' : '✅ Nhập vào ngân hàng đề'}
                  </button>
                  <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setDocxPreview(null); setShowDocxImport(false); }}>
                    Hủy
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
        </div>
        {/* ===== hết vùng nội dung ===== */}
      </div>
      {/* ===== hết bố cục 2 cột ===== */}
    </div>
  );
}
