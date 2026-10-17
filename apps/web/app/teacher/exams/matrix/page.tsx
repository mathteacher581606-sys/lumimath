'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import BackButton from '@/components/BackButton';
import LatexRenderer from '@/components/LatexRenderer';

const TYPE_LABEL: Record<string, string> = {
  MCQ: 'Trắc nghiệm',
  TRUE_FALSE: 'Đúng/Sai',
  SHORT_ANSWER: 'Trả lời ngắn',
  ESSAY: 'Tự luận',
};

const DIFF_LABEL: Record<string, string> = {
  NHAN_BIET: 'Nhận biết',
  THONG_HIEU: 'Thông hiểu',
  VAN_DUNG: 'Vận dụng',
  VAN_DUNG_CAO: 'Vận dụng cao',
};

interface Slot {
  type: string;
  form: string;
  difficulty: string;
  grade: string;
  topicId: string;
  question: any | null;
  locked: boolean;
}

// Form THPTQG 2025: 12 trắc nghiệm + 4 đúng/sai + 6 trả lời ngắn = 22 câu
const THPTQG_PARTS = [
  { type: 'MCQ', count: 12 },
  { type: 'TRUE_FALSE', count: 4 },
  { type: 'SHORT_ANSWER', count: 6 },
];

function makeSlots(parts: { type: string; count: number }[]): Slot[] {
  const slots: Slot[] = [];
  for (const p of parts) {
    for (let i = 0; i < p.count; i++) {
      slots.push({
        type: p.type,
        form: '',
        difficulty: '',
        grade: '',
        topicId: '',
        question: null,
        locked: false,
      });
    }
  }
  return slots;
}

export default function ExamMatrixPage() {
  const router = useRouter();
  const [matrixName, setMatrixName] = useState('Ma trận đề');
  const [matrixId, setMatrixId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>(() => makeSlots(THPTQG_PARTS));
  const [preset, setPreset] = useState<'thptqg' | 'custom'>('thptqg');
  const [customCounts, setCustomCounts] = useState({
    MCQ: 12,
    TRUE_FALSE: 4,
    SHORT_ANSWER: 6,
    ESSAY: 0,
  });
  const [mode, setMode] = useState<'manual' | 'random'>('manual');
  const [forms, setForms] = useState<any[]>([]);
  const [showKho, setShowKho] = useState(false);
  const [matrices, setMatrices] = useState<any[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [pickerPool, setPickerPool] = useState<any[]>([]);
  const [pickerFilters, setPickerFilters] = useState({ q: '', difficulty: '', form: '' });
  const [pickerLoading, setPickerLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // ===== Thông tin ĐỀ THI (gộp Tạo đề thi vào trang ma trận) =====
  const [examTitle, setExamTitle] = useState('');
  const [examDuration, setExamDuration] = useState('45');
  const [examGrade, setExamGrade] = useState('12');
  const [examTopicId, setExamTopicId] = useState('');
  const [examDifficulty, setExamDifficulty] = useState('');
  const [published, setPublished] = useState(false);
  const [topics, setTopics] = useState<any[]>([]);
  const [examFolders, setExamFolders] = useState<any[]>([]);
  const [examFolderId, setExamFolderId] = useState('');
  const [partScores, setPartScores] = useState<Record<string, number>>({
    MCQ: 0.25,
    TRUE_FALSE: 0.5,
    SHORT_ANSWER: 0.5,
    ESSAY: 1,
  });

  // ===== TẠO NHANH THEO DẠNG BÀI =====
  const [showQuick, setShowQuick] = useState(false);
  const [quickGrade, setQuickGrade] = useState('');
  const [quickTopicId, setQuickTopicId] = useState('');
  const [quickList, setQuickList] = useState<any[]>([]);
  const [quickSel, setQuickSel] = useState<Record<string, { on: boolean; count: number }>>({});
  const [quickBusy, setQuickBusy] = useState(false);

  async function loadQuickList(grade?: string, topicId?: string) {
    setQuickBusy(true);
    try {
      const params = new URLSearchParams();
      if (grade) params.set('grade', grade);
      if (topicId) params.set('topicId', topicId);
      const list = await apiFetch(`/bank/forms-by-filter?${params.toString()}`);
      setQuickList(list);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setQuickBusy(false);
    }
  }

  function openQuick() {
    setQuickGrade('');
    setQuickTopicId('');
    setQuickSel({});
    setQuickList([]);
    setShowQuick(true);
    loadQuickList();
  }

  // Sinh ma trận từ các dạng đã tick + bốc câu (dùng lại bộ lọc từng ô)
  async function buildQuick(tongOn: boolean) {
    let picks = quickList.filter((f) => quickSel[f.name]?.on && (quickSel[f.name]?.count || 0) > 0);
    if (tongOn) {
      // Tổng ôn: mỗi dạng 2 câu, độ khó phân bố 70/30
      picks = quickList.filter((f) => f.count > 0).map((f) => ({ name: f.name, count: 2 }));
      setQuickSel(
        Object.fromEntries(quickList.map((f) => [f.name, { on: f.count > 0, count: 2 }])),
      );
    }
    const built: Slot[] = [];
    const diffs = ['NHAN_BIET', 'THONG_HIEU', 'VAN_DUNG', 'VAN_DUNG_CAO'];
    let idx = 0;
    for (const p of picks) {
      for (let k = 0; k < (p.count || 0); k++) {
        let difficulty = '';
        if (tongOn) {
          difficulty = diffs[idx % diffs.length];
          idx++;
        }
        built.push({
          type: 'MCQ',
          form: p.name,
          difficulty,
          grade: quickGrade,
          topicId: quickTopicId,
          question: null,
          locked: false,
        });
      }
    }
    if (!built.length) {
      alert('Chọn ít nhất 1 dạng bài với số câu > 0');
      return;
    }
    setSlots(built);
    setMatrixName(tongOn ? 'Đề tổng ôn' : 'Đề theo dạng bài');
    setPreset('custom');
    setShowQuick(false);
    // Bốc câu theo bộ lọc từng ô (dạng + lớp + chủ đề + mức)
    setBusy(true);
    try {
      await fillFromBank(false);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    apiFetch('/bank/forms').then(setForms).catch(() => {});
    apiFetch('/bank/topics').then(setTopics).catch(() => {});
    apiFetch('/exams/folders').then(setExamFolders).catch(() => {});
  }, []);

  const parts = useMemo(() => {
    const groups: { type: string; count: number }[] = [];
    for (const s of slots) {
      const g = groups[groups.length - 1];
      if (g && g.type === s.type) g.count++;
      else groups.push({ type: s.type, count: 1 });
    }
    return groups;
  }, [slots]);

  function applyPreset(p: 'thptqg' | 'custom') {
    setPreset(p);
    if (p === 'thptqg') {
      setSlots(makeSlots(THPTQG_PARTS));
    } else {
      setSlots(makeSlots([
        { type: 'MCQ', count: Number(customCounts.MCQ) || 0 },
        { type: 'TRUE_FALSE', count: Number(customCounts.TRUE_FALSE) || 0 },
        { type: 'SHORT_ANSWER', count: Number(customCounts.SHORT_ANSWER) || 0 },
        { type: 'ESSAY', count: Number(customCounts.ESSAY) || 0 },
      ]));
    }
  }

  function updateSlot(i: number, patch: Partial<Slot>) {
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  // ===== TẠO ĐỀ THI từ ma trận đã duyệt (gộp 2 tính năng) =====
  async function createExam() {
    if (!examTitle.trim()) {
      alert('Vui lòng nhập tên đề thi.');
      return;
    }
    const ids = slots.filter((s) => s.question?.id).map((s) => s.question.id);
    const missing = slots.length - ids.length;
    if (missing > 0) {
      if (!confirm(`${missing} ô chưa có câu hỏi — đề sẽ bỏ qua các ô đó. Tiếp tục?`)) return;
    }
    if (!ids.length) {
      alert('Ma trận chưa có câu hỏi nào. Hãy bấm "TẠO ĐỀ TỪ MA TRẬN" hoặc chọn câu thủ công.');
      return;
    }
    setBusy(true);
    try {
      const matrixParts = parts.map((p) => ({
        type: p.type,
        count: p.count,
        score: partScores[p.type] ?? 0.25,
      }));
      const body: any = {
        title: examTitle.trim(),
        duration: Number(examDuration) || 45,
        published,
        questionIds: ids,
        matrix: { parts: matrixParts },
      };
      if (examGrade) body.grade = Number(examGrade);
      if (examTopicId) body.topicId = examTopicId;
      if (examDifficulty) body.difficulty = examDifficulty;
      if (examFolderId) body.folderId = examFolderId;
      const data = await apiFetch('/exams', { method: 'POST', body: JSON.stringify(body) });
      alert('✅ Đã tạo đề thi từ ma trận!');
      router.push(`/teacher/exams/${data.id}`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  function resetMatrix() {
    if (!confirm('Xóa toàn bộ nội dung ma trận hiện tại?')) return;
    setSlots(makeSlots(preset === 'thptqg' ? THPTQG_PARTS : [
      { type: 'MCQ', count: Number(customCounts.MCQ) || 0 },
      { type: 'TRUE_FALSE', count: Number(customCounts.TRUE_FALSE) || 0 },
      { type: 'SHORT_ANSWER', count: Number(customCounts.SHORT_ANSWER) || 0 },
      { type: 'ESSAY', count: Number(customCounts.ESSAY) || 0 },
    ]));
    setMatrixId(null);
  }

  // ===== TẠO MA TRẬN TỪ FILE EXCEL (Giai đoạn B) =====
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function importFromExcel(file: File) {
    setBusy(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/exams/matrices/import-excel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: await file.arrayBuffer(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || 'Đọc file Excel thất bại').slice(-400));
        return;
      }
      const data = await res.json();
      const byId = new Map<string, any>();
      (data.matched || []).forEach((q: any) => byId.set(q.id, q));
      setSlots(
        (data.slots || []).map((s: any) => ({
          type: s.type || 'MCQ',
          form: s.form || '',
          difficulty: s.difficulty || '',
          grade: s.grade || '',
          topicId: s.topicId || '',
          question: s.questionId ? byId.get(s.questionId) || { id: s.questionId } : null,
          locked: false,
        })),
      );
      const baseName = file.name.replace(/\.(xlsx|xls)$/i, '');
      setMatrixName(baseName);
      setMatrixId(null);
      if (data.unmatched?.length) {
        alert(
          `✅ Đã nạp ${data.slots.length} ô ma trận từ Excel.\n⚠️ ${data.unmatched.length} mã câu không có trong ngân hàng: ${data.unmatched.join(', ')}`,
        );
      } else {
        alert(`✅ Đã nạp ${data.slots.length} ô ma trận từ file "${file.name}"`);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Tải file Excel mẫu (8 cột mới)
  async function downloadTemplate() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/exams/matrices/export-template', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || 'Tải file mẫu thất bại').slice(-300));
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Mau-ma-tran-de.xlsx';
      a.click();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function exportExcel() {
    setBusy(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/exams/matrices/export-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: matrixName, slots }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(String(err.message || 'Xuất Excel thất bại').slice(-300));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${matrixName || 'ma-tran-de'}.xlsx`;
      a.click();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ===== TẠO ĐỀ TỪ MA TRẬN =====
  // Chế độ TỰ CHỌN: tôn trọng bộ lọc từng dòng (lớp/chủ đề/mức/dạng, bỏ trống = không lọc)
  // Chế độ NGẪU NHIÊN: SINH MA TRẬN NGẪU NHIÊN — tự chọn mức theo chuẩn 70/30 của Bộ GD,
  // rồi bốc câu bất kỳ đúng kiểu; điền ngược mức/dạng/lớp/chủ đề của câu vào dòng ma trận.
  async function fillFromBank(random: boolean) {
    setBusy(true);
    try {
      const used: string[] = [];
      const next = [...slots];
      const n = next.length;
      const easy = ['NHAN_BIET', 'THONG_HIEU'];
      const hard = ['VAN_DUNG', 'VAN_DUNG_CAO'];
      const cut = Math.round(n * 0.7);

      for (let i = 0; i < n; i++) {
        const s = next[i];
        if (s.question) {
          used.push(s.question.id);
          continue;
        }
        // Mức mục tiêu: NGẪU NHIÊN → chuẩn 70/30; TỰ CHỌN → theo dòng
        let targetDiff = '';
        if (random) {
          const bucket = i < cut ? easy : hard;
          targetDiff = bucket[Math.floor(Math.random() * bucket.length)];
        } else {
          targetDiff = s.difficulty || '';
        }

        const buildParams = (diff: string) => {
          const p = new URLSearchParams({ type: s.type, limit: '30' });
          if (diff) p.set('difficulty', diff);
          if (!random) {
            if (s.form) p.set('form', s.form);
            if (s.grade) p.set('grade', s.grade);
            if (s.topicId) p.set('topicId', s.topicId);
          }
          return p;
        };

        let pool: any = { items: [] };
        try {
          let params = buildParams(targetDiff);
          pool = await apiFetch(`/bank/questions-paged?${params.toString()}`);
          let candidates = (pool.items || []).filter((q: any) => !used.includes(q.id));
          // Nới lọc mức nếu không đủ (chỉ ở chế độ ngẫu nhiên)
          if (!candidates.length && random && targetDiff) {
            const params2 = buildParams('');
            pool = await apiFetch(`/bank/questions-paged?${params2.toString()}`);
            candidates = (pool.items || []).filter((q: any) => !used.includes(q.id));
          }
          // Cuối cùng: chỉ theo đúng kiểu câu
          if (!candidates.length && (targetDiff || (!random && (s.form || s.grade || s.topicId)))) {
            const params3 = new URLSearchParams({ type: s.type, limit: '30' });
            pool = await apiFetch(`/bank/questions-paged?${params3.toString()}`);
            candidates = (pool.items || []).filter((q: any) => !used.includes(q.id));
          }
          if (!candidates.length) continue;
          const pick = candidates[Math.floor(Math.random() * candidates.length)];
          used.push(pick.id);
          if (random) {
            // Sinh ma trận từ câu bốc được: điền ngược các cột
            next[i] = {
              ...s,
              question: pick,
              difficulty: pick.difficulty || '',
              form: pick.form || '',
              grade: pick.grade ? String(pick.grade) : '',
              topicId: pick.topicId || '',
            };
          } else {
            next[i] = { ...s, question: pick };
          }
        } catch {
          /* bỏ qua ô này */
        }
      }
      setSlots(next);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ===== Chọn câu hỏi cho 1 ô =====
  async function openPicker(i: number) {
    setPickerFor(i);
    const s = slots[i];
    setPickerFilters({ q: '', difficulty: s.difficulty, form: s.form });
    setPickerPool([]);
    await loadPicker(i);
  }

  async function loadPicker(i: number) {
    setPickerLoading(true);
    try {
      const s = slots[i];
      const f = pickerFilters;
      const params = new URLSearchParams({ type: s.type, limit: '30' });
      if (f.difficulty) params.set('difficulty', f.difficulty);
      if (f.form) params.set('form', f.form);
      if (s.grade) params.set('grade', s.grade);
      if (s.topicId) params.set('topicId', s.topicId);
      if (f.q && f.q.trim()) params.set('q', f.q.trim());
      const data = await apiFetch(`/bank/questions-paged?${params.toString()}`);
      setPickerPool(data.items || []);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setPickerLoading(false);
    }
  }

  function pickQuestion(q: any) {
    if (pickerFor === null) return;
    updateSlot(pickerFor, { question: q });
    setPickerFor(null);
  }

  // Đổi ngẫu nhiên 1 ô (giữ nguyên dạng bài + kiểu + mức)
  async function swapSlotRandom(i: number) {
    const s = slots[i];
    setBusy(true);
    try {
      const used = slots.filter((x) => x.question?.id).map((x) => x.question.id);
      const params = new URLSearchParams({ type: s.type, limit: '30' });
      if (s.difficulty) params.set('difficulty', s.difficulty);
      if (s.form) params.set('form', s.form);
      if (s.grade) params.set('grade', s.grade);
      if (s.topicId) params.set('topicId', s.topicId);
      const data = await apiFetch(`/bank/questions-paged?${params.toString()}`);
      const candidates = (data.items || []).filter((q: any) => !used.includes(q.id));
      if (!candidates.length) {
        alert('Ngân hàng không còn câu nào khác phù hợp với ô này.');
        return;
      }
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      updateSlot(i, { question: pick });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ===== Kho ma trận =====
  async function loadMatrices() {
    try {
      setMatrices(await apiFetch('/exams/matrices'));
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function saveMatrix() {
    setBusy(true);
    try {
      const data = {
        parts: parts.map((p) => ({ type: p.type, count: p.count })),
        slots: slots.map((s) => ({
          type: s.type,
          form: s.form,
          difficulty: s.difficulty,
          questionId: s.question?.id || null,
        })),
      };
      const saved = await apiFetch('/exams/matrices', {
        method: 'POST',
        body: JSON.stringify({ id: matrixId || undefined, name: matrixName, data }),
      });
      setMatrixId(saved.id);
      alert('✅ Đã lưu ma trận vào kho!');
      loadMatrices();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadMatrix(m: any) {
    setMatrixId(m.id);
    setMatrixName(m.name);
    const data = m.data || {};
    if (Array.isArray(data.slots) && data.slots.length) {
      const byId = new Map<string, any>();
      const ids = data.slots.map((s: any) => s.questionId).filter(Boolean);
      if (ids.length) {
        try {
          const pool = await apiFetch(`/bank/questions?ids=${ids.join(',')}`);
          (Array.isArray(pool) ? pool : []).forEach((q: any) => byId.set(q.id, q));
        } catch {
          /* bỏ qua */
        }
      }
      setSlots(
        data.slots.map((s: any) => ({
          type: s.type || 'MCQ',
          form: s.form || '',
          difficulty: s.difficulty || '',
          question: s.questionId ? byId.get(s.questionId) || { id: s.questionId } : null,
          locked: false,
        })),
      );
    } else if (Array.isArray(data.parts)) {
      setSlots(makeSlots(data.parts));
    }
    setShowKho(false);
  }

  async function deleteMatrix(m: any) {
    if (!confirm(`Xóa ma trận "${m.name}"?`)) return;
    try {
      await apiFetch(`/exams/matrices/${m.id}`, { method: 'DELETE' });
      loadMatrices();
    } catch (e: any) {
      alert(e.message);
    }
  }

  // ===== Xuất file (đề .docx từ các câu đã chọn) =====
  async function exportFile(withAnswers: boolean) {
    const ids = slots.filter((s) => s.question?.id).map((s) => s.question.id);
    if (!ids.length) {
      alert('Chưa có câu hỏi nào trong ma trận. Hãy chọn câu trước.');
      return;
    }
    setBusy(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/bank/questions/export-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids, withAnswers, mathMode: 'omml' }),
      });
      if (!res.ok) {
        alert('Xuất file thất bại');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'de-thi-tu-ma-tran.docx';
      a.click();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  // ===== Thống kê sơ bộ (Giai đoạn D sẽ nâng cấp biểu đồ) =====
  const stats = useMemo(() => {
    const total = slots.length;
    const m12 = slots.filter((s) => s.difficulty === 'NHAN_BIET' || s.difficulty === 'THONG_HIEU').length;
    const m34 = slots.filter((s) => s.difficulty === 'VAN_DUNG' || s.difficulty === 'VAN_DUNG_CAO').length;
    const unfilled = total - m12 - m34;
    const filled = slots.filter((s) => s.question?.id).length;
    return { total, m12, m34, unfilled, filled };
  }, [slots]);

  return (
    <div className="page-container" data-theme="maroon" style={{ maxWidth: 1180 }}>
      {/* ================= THANH TIÊU ĐỀ ================= */}
      <div className="lm-band" style={{ borderRadius: 10 }}>
        <div style={{ fontSize: 20, width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          ▦
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2>
            <BackButton to="/teacher/exams" label="Về Kho đề thi" />
            Quản lý ma trận đề
          </h2>
          <p className="lm-band-sub">
            Form chuẩn THPTQG: 12 trắc nghiệm · 4 đúng/sai · 6 trả lời ngắn
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`toolbar-btn${mode === 'manual' ? ' active' : ''}`}
            onClick={() => setMode('manual')}
            title="Tự chọn: bấm TẠO ĐỀ TỪ MA TRẬN sẽ lấy câu theo đúng bộ lọc từng dòng"
          >
            ☑ TỰ CHỌN
          </button>
          <button
            type="button"
            className={`toolbar-btn${mode === 'random' ? ' active' : ''}`}
            onClick={() => setMode('random')}
            title="Ngẫu nhiên: bấm TẠO ĐỀ TỪ MA TRẬN sẽ SINH MA TRẬN NGẪU NHIÊN (mức độ theo chuẩn 70/30 Bộ GD) rồi bốc câu"
          >
            ⚡ NGẪU NHIÊN
          </button>
          <button
            type="button"
            className="toolbar-btn"
            style={{ background: 'var(--lm-amber)', borderColor: 'var(--lm-amber)', color: '#5c3404', fontWeight: 800 }}
            onClick={openQuick}
            title="Tạo nhanh đề theo dạng bài: tick dạng + số câu, hoặc tổng ôn cả chương"
          >
            ✨ TẠO NHANH THEO DẠNG
          </button>
          <select
            value={preset}
            onChange={(e) => applyPreset(e.target.value as any)}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--lm-line-2)', fontSize: 12.5, fontWeight: 700, background: '#fff' }}
          >
            <option value="thptqg">Form THPTQG</option>
            <option value="custom">Tùy chỉnh</option>
          </select>
          {preset === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {([
                ['MCQ', 'TN'],
                ['TRUE_FALSE', 'Đ/S'],
                ['SHORT_ANSWER', 'TLN'],
                ['ESSAY', 'TL'],
              ] as const).map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#f2d9d9' }}>
                  {label}
                  <input
                    type="number"
                    min={0}
                    value={customCounts[key]}
                    onChange={(e) => setCustomCounts({ ...customCounts, [key]: e.target.value })}
                    style={{ width: 48, padding: '4px 6px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.15)', color: '#fff' }}
                  />
                </label>
              ))}
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => applyPreset('custom')}
              >
                Áp dụng
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn-lm amber"
            onClick={() => setShowAll(true)}
          >
            ◎ XEM TẤT CẢ
          </button>
        </div>
      </div>

      {/* ================= THÔNG TIN ĐỀ THI ================= */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, marginBottom: 10, color: 'var(--lm-maroon)' }}>
          📝 Thông tin đề thi
        </h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="form-group" style={{ flex: 2, minWidth: 220, margin: 0 }}>
            <label style={{ fontSize: 12 }}>Tên đề thi *</label>
            <input
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              placeholder="VD: Đề kiểm tra HKI - Toán 12"
              style={{ padding: '8px 10px', fontSize: 13.5 }}
            />
          </div>
          <div className="form-group" style={{ width: 110, margin: 0 }}>
            <label style={{ fontSize: 12 }}>Thời gian (phút)</label>
            <input
              type="number"
              value={examDuration}
              onChange={(e) => setExamDuration(e.target.value)}
              style={{ padding: '8px 10px', fontSize: 13.5 }}
            />
          </div>
          <div className="form-group" style={{ width: 100, margin: 0 }}>
            <label style={{ fontSize: 12 }}>Lớp</label>
            <select value={examGrade} onChange={(e) => setExamGrade(e.target.value)} style={{ padding: '8px 10px', fontSize: 13.5 }}>
              <option value="10">Lớp 10</option>
              <option value="11">Lớp 11</option>
              <option value="12">Lớp 12</option>
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 160, margin: 0 }}>
            <label style={{ fontSize: 12 }}>Chủ đề (phân loại)</label>
            <select value={examTopicId} onChange={(e) => setExamTopicId(e.target.value)} style={{ padding: '8px 10px', fontSize: 13.5 }}>
              <option value="">— Không phân loại —</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.grade ? ` (L${t.grade})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ width: 140, margin: 0 }}>
            <label style={{ fontSize: 12 }}>Độ khó chung</label>
            <select value={examDifficulty} onChange={(e) => setExamDifficulty(e.target.value)} style={{ padding: '8px 10px', fontSize: 13.5 }}>
              <option value="">— Không xác định —</option>
              <option value="NHAN_BIET">Nhận biết</option>
              <option value="THONG_HIEU">Thông hiểu</option>
              <option value="VAN_DUNG">Vận dụng</option>
              <option value="VAN_DUNG_CAO">Vận dụng cao</option>
            </select>
          </div>
          <div className="form-group" style={{ minWidth: 150, margin: 0 }}>
            <label style={{ fontSize: 12 }}>📁 Thư mục (Kho đề thi)</label>
            <select value={examFolderId} onChange={(e) => setExamFolderId(e.target.value)} style={{ padding: '8px 10px', fontSize: 13.5 }}>
              <option value="">— Không thư mục —</option>
              {(() => {
                // Thư mục dạng cây thụt lề: chọn mẹ trước, con lùi sau
                const opts: { id: string; label: string }[] = [];
                (function walk(parentId: string | null, depth: number) {
                  for (const f of examFolders.filter((x) => (x.parentId || null) === parentId)) {
                    opts.push({ id: f.id, label: (depth ? '└ '.repeat(depth) + ' ' : '') + f.name });
                    walk(f.id, depth + 1);
                  }
                })(null, 0);
                return opts.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ));
              })()}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: 0, paddingTop: 18 }}>
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              style={{ width: 'auto' }}
            />
            📢 Công khai cho học sinh thi thử
          </label>
        </div>
      </div>

      {/* ================= BẢNG MA TRẬN ================= */}
      <div className="card" style={{ padding: 0, marginBottom: 14, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '44px 118px 96px 160px 140px 1.25fr 1.45fr 46px', background: 'var(--lm-maroon)', color: '#fff', fontWeight: 800, fontSize: 12.5 }}>
          <div style={{ padding: '10px 12px' }}>Câu</div>
          <div style={{ padding: '10px 12px' }}>Kiểu</div>
          <div style={{ padding: '10px 12px' }}>Lớp</div>
          <div style={{ padding: '10px 12px' }}>Chủ đề</div>
          <div style={{ padding: '10px 12px' }}>Mức độ</div>
          <div style={{ padding: '10px 12px' }}>Tên dạng bài</div>
          <div style={{ padding: '10px 12px' }}>Dữ liệu</div>
          <div style={{ padding: '10px 12px', textAlign: 'center' }}>☑</div>
        </div>

        {parts.map((part, pi) => (
          <div key={pi}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: '#fdf1dc', borderTop: '1px solid var(--lm-line)', borderBottom: '1px solid #f0dcb4' }}>
              <span style={{ background: 'var(--lm-amber)', color: '#4a2a06', fontWeight: 800, fontSize: 12.5, borderRadius: 6, padding: '4px 12px' }}>
                {TYPE_LABEL[part.type] || part.type}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#8a5a1a' }}>{part.count} câu</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#8a5a1a', marginLeft: 'auto' }}>
                Điểm/câu:
                <input
                  type="number"
                  step="0.05"
                  min={0}
                  value={partScores[part.type] ?? 0.25}
                  onChange={(e) =>
                    setPartScores({ ...partScores, [part.type]: Number(e.target.value) || 0 })
                  }
                  style={{ width: 62, padding: '4px 6px', borderRadius: 5, border: '1px solid #e0c48c', background: '#fff', fontSize: 12 }}
                />
              </label>
            </div>

            {(() => {
              const startIdx = slots.findIndex((s) => s.type === part.type);
              return slots
                .map((s, i) => ({ s, i }))
                .filter(({ s }) => s.type === part.type)
                .map(({ s, i }) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '44px 118px 96px 160px 140px 1.25fr 1.45fr 46px',
                      alignItems: 'center',
                      borderBottom: '1px solid var(--lm-line)',
                      background: i % 2 ? '#fffdf7' : '#fff',
                    }}
                  >
                    <div style={{ padding: '8px 12px', fontWeight: 800, fontSize: 13 }}>{i + 1}</div>
                    <div style={{ padding: '6px 6px' }}>
                      <select
                        value={s.type}
                        onChange={(e) => updateSlot(i, { type: e.target.value, question: null })}
                        style={{ width: '100%', padding: '7px 6px', borderRadius: 6, border: '1.5px solid #e8c585', background: '#fff7e6', fontSize: 12.5, fontWeight: 700, color: '#8a5a1a' }}
                      >
                        <option value="MCQ">Trắc nghiệm</option>
                        <option value="TRUE_FALSE">Đúng/Sai</option>
                        <option value="SHORT_ANSWER">Trả lời ngắn</option>
                        <option value="ESSAY">Tự luận</option>
                      </select>
                    </div>
                    <div style={{ padding: '6px 6px' }}>
                      <select
                        value={s.grade}
                        onChange={(e) => updateSlot(i, { grade: e.target.value, topicId: '', question: null })}
                        style={{ width: '100%', padding: '7px 6px', borderRadius: 6, border: '1.5px solid #e8c585', background: '#fff7e6', fontSize: 12, fontWeight: 700, color: '#8a5a1a' }}
                      >
                        <option value="">Lớp?</option>
                        <option value="10">Lớp 10</option>
                        <option value="11">Lớp 11</option>
                        <option value="12">Lớp 12</option>
                      </select>
                    </div>
                    <div style={{ padding: '6px 6px' }}>
                      <select
                        value={s.topicId}
                        onChange={(e) => updateSlot(i, { topicId: e.target.value, question: null })}
                        style={{ width: '100%', padding: '7px 6px', borderRadius: 6, border: '1.5px solid #e8c585', background: '#fff7e6', fontSize: 12, fontWeight: 700, color: '#8a5a1a' }}
                      >
                        <option value="">Chủ đề?</option>
                        {topics
                          .filter((t) => !s.grade || String(t.grade ?? '') === s.grade)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div style={{ padding: '6px 6px' }}>
                      <select
                        value={s.difficulty}
                        onChange={(e) => updateSlot(i, { difficulty: e.target.value, question: null })}
                        style={{ width: '100%', padding: '7px 6px', borderRadius: 6, border: '1.5px solid #e8c585', background: '#fff7e6', fontSize: 12, fontWeight: 700, color: '#8a5a1a' }}
                      >
                        <option value="">Mức?</option>
                        <option value="NHAN_BIET">Mức 1 · Nhận biết</option>
                        <option value="THONG_HIEU">Mức 2 · Thông hiểu</option>
                        <option value="VAN_DUNG">Mức 3 · Vận dụng</option>
                        <option value="VAN_DUNG_CAO">Mức 4 · VDC</option>
                      </select>
                    </div>
                    <div style={{ padding: '6px 8px' }}>
                      <input
                        value={s.form}
                        onChange={(e) => updateSlot(i, { form: e.target.value })}
                        placeholder="📄 Dạng bài (bỏ trống = không lọc)"
                        list="matrix-form-list"
                        style={{ width: '100%', padding: '7px 10px', border: '1px dashed var(--lm-line-2)', borderRadius: 6, background: '#fff', fontSize: 13 }}
                      />
                    </div>
                    <div style={{ padding: '6px 8px', minWidth: 0 }}>
                      {s.question?.content ? (
                        <div style={{ border: '1px solid var(--lm-line)', borderRadius: 6, padding: '6px 8px', fontSize: 12.5, background: '#fff', display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0, maxHeight: 40, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <LatexRenderer content={s.question.content} />
                          </div>
                          <button
                            type="button"
                            className="lm-filter-btn"
                            style={{ padding: '2px 8px', fontSize: 11 }}
                            title="Đổi ngẫu nhiên câu khác cùng dạng/kiểu/mức"
                            disabled={busy}
                            onClick={() => swapSlotRandom(i)}
                          >
                            🔄
                          </button>
                          <button
                            type="button"
                            className="lm-filter-btn"
                            style={{ padding: '2px 8px', fontSize: 11 }}
                            title="Bỏ câu này"
                            onClick={() => updateSlot(i, { question: null })}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openPicker(i)}
                          style={{
                            width: '100%',
                            border: '1.5px dashed var(--lm-line-2)',
                            borderRadius: 6,
                            padding: '8px',
                            background: 'transparent',
                            color: 'var(--color-muted)',
                            fontSize: 12.5,
                            cursor: 'pointer',
                          }}
                        >
                          Chưa có câu — bấm để chọn
                        </button>
                      )}
                    </div>
                    <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => updateSlot(i, { locked: !s.locked })}
                        title={s.locked ? 'Bỏ chốt' : 'Chốt ô này'}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 6,
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          background: s.locked ? 'var(--lm-maroon)' : '#efe6d5',
                          color: s.locked ? '#fff' : '#a39375',
                        }}
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                ));
            })()}
          </div>
        ))}

        <datalist id="matrix-form-list">
          {forms.map((f) => (
            <option key={f.name} value={f.name} />
          ))}
        </datalist>
      </div>

      {/* ================= THỐNG KÊ VÀ ĐÁNH GIÁ ĐỀ (Giai đoạn D) ================= */}
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--lm-maroon)' }}>
          📊 Thống kê và đánh giá đề
        </h3>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Biểu đồ tròn */}
          {(() => {
            const counted = stats.m12 + stats.m34;
            const r = 52;
            const C = 2 * Math.PI * r;
            const frac12 = counted ? stats.m12 / counted : 0;
            const frac34 = counted ? stats.m34 / counted : 0;
            return (
              <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
                <svg width={140} height={140} viewBox="0 0 140 140">
                  <circle cx={70} cy={70} r={r} fill="none" stroke="#e8e0d2" strokeWidth={16} />
                  {counted > 0 && (
                    <>
                      <circle
                        cx={70}
                        cy={70}
                        r={r}
                        fill="none"
                        stroke="var(--lm-maroon)"
                        strokeWidth={16}
                        strokeDasharray={`${C * frac12} ${C}`}
                        transform="rotate(-90 70 70)"
                      />
                      <circle
                        cx={70}
                        cy={70}
                        r={r}
                        fill="none"
                        stroke="#cfc4ae"
                        strokeWidth={16}
                        strokeDasharray={`${C * frac34} ${C}`}
                        strokeDashoffset={-C * frac12}
                        transform="rotate(-90 70 70)"
                      />
                    </>
                  )}
                </svg>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <b style={{ fontSize: 20, color: 'var(--lm-maroon)' }}>{stats.total}</b>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>câu</span>
                </div>
              </div>
            );
          })()}

          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>
              {stats.unfilled > 0
                ? '⚠️ Chưa đủ mức độ để đánh giá 70/30'
                : '✅ Đủ mức độ để đánh giá'}
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginBottom: 8 }}>
              Chuẩn Bộ GD: 70% nhận biết–thông hiểu (mức 1–2) • 30% vận dụng–vận dụng cao (mức ≥3)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--lm-maroon)', display: 'inline-block' }} />
                Nhận biết – Thông hiểu: <b>{stats.m12}</b> câu
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#cfc4ae', display: 'inline-block' }} />
                Vận dụng – Vận dụng cao: <b>{stats.m34}</b> câu
              </div>
              {stats.unfilled > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--color-warning)' }}>
                  {stats.unfilled} câu chưa chọn mức độ (không tính vào thống kê)
                </div>
              )}
            </div>

            {/* Thang độ khó đề */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Độ khó đề:</div>
              <div style={{ position: 'relative', height: 10, borderRadius: 999, background: 'linear-gradient(90deg, #79c07c, #e8c46a, #e58a4b, #c24a3f)', width: '100%', maxWidth: 380 }}>
                {(() => {
                  const m1 = slots.filter((s) => s.difficulty === 'NHAN_BIET').length;
                  const m2 = slots.filter((s) => s.difficulty === 'THONG_HIEU').length;
                  const m3 = slots.filter((s) => s.difficulty === 'VAN_DUNG').length;
                  const m4 = slots.filter((s) => s.difficulty === 'VAN_DUNG_CAO').length;
                  const sum = m1 + m2 + m3 + m4;
                  const avg = sum ? (m1 + 2 * m2 + 3 * m3 + 4 * m4) / sum : 0;
                  const pct = sum ? Math.min(100, Math.max(0, ((avg - 1) / 3) * 100)) : 0;
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        top: -5,
                        left: `calc(${pct}% - 8px)`,
                        width: 16,
                        height: 20,
                        borderRadius: 4,
                        background: '#2b1a14',
                        border: '2px solid #fff',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                      }}
                      title={avg ? `Trung bình mức ${avg.toFixed(2)}` : 'Chưa có dữ liệu'}
                    />
                  );
                })()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-muted)', maxWidth: 380, marginTop: 4 }}>
                <span>Dễ</span>
                <span>Trung bình</span>
                <span>Khá</span>
                <span>Khó</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= THANH DƯỚI ================= */}
      <div className="card" style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', position: 'sticky', bottom: 10 }}>
        <button type="button" className="toolbar-btn" onClick={resetMatrix}>⟲ RESET</button>
        <button
          type="button"
          className="toolbar-btn"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          📄 TẠO MA TRẬN TỪ FILE
        </button>
        <button type="button" className="toolbar-btn" disabled={busy} onClick={downloadTemplate} title="Tải file Excel mẫu 8 cột: Phần | Câu | Kiểu | Lớp | Chủ đề | Mức độ | Tên dạng bài | Mã câu hỏi">
          📥 FILE MẪU
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFromExcel(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="toolbar-btn"
          style={{ background: 'var(--lm-amber)', borderColor: 'var(--lm-amber)', color: '#5c3404', fontWeight: 800 }}
          disabled={busy}
          onClick={() => fillFromBank(mode === 'random')}
          title="Tạo đề ngẫu nhiên theo ma trận — dạng bài/lớp/chủ đề để trống thì không lọc theo tiêu chí đó"
        >
          {busy ? '⏳ Đang lấy…' : mode === 'random' ? '⚡ TẠO ĐỀ NGẪU NHIÊN' : '⚡ TẠO ĐỀ TỪ MA TRẬN'}
        </button>
        <button type="button" className="toolbar-btn" onClick={saveMatrix} disabled={busy}>
          💾 LƯU MA TRẬN VÀO KHO
        </button>
        <button
          type="button"
          className="toolbar-btn"
          onClick={() => {
            setShowKho(true);
            loadMatrices();
          }}
        >
          KHO CỦA TÔI
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="toolbar-btn"
            disabled={busy}
            onClick={exportExcel}
          >
            📊 XUẤT EXCEL
          </button>
          <button type="button" className="toolbar-btn" style={{ background: 'var(--lm-maroon)', borderColor: 'var(--lm-maroon)', color: '#fff' }} onClick={() => exportFile(false)}>
            ☁ XUẤT FILE ▾
          </button>
          <button
            type="button"
            className="toolbar-btn"
            disabled={busy}
            onClick={createExam}
            style={{
              background: 'linear-gradient(135deg, #b91c1c, #7b1113)',
              borderColor: '#7b1113',
              color: '#fff',
              fontWeight: 800,
              padding: '10px 20px',
              fontSize: 13.5,
            }}
          >
            💾 TẠO ĐỀ THI
          </button>
        </div>
      </div>

      {/* ================= MODAL CHỌN CÂU HỎI ================= */}
      {pickerFor !== null && (
        <div className="lm-detail-backdrop" onClick={() => setPickerFor(null)}>
          <div className="lm-detail" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head">
              <span className="q-no">Chọn câu hỏi cho ô {pickerFor + 1} — {TYPE_LABEL[slots[pickerFor].type]}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button type="button" className="q-level-pill" style={{ borderStyle: 'dashed' }} onClick={() => { updateSlot(pickerFor, { question: null }); setPickerFor(null); }}>
                  Bỏ trống
                </button>
                <button type="button" className="lm-detail-close" onClick={() => setPickerFor(null)}>✕</button>
              </div>
            </div>
            <div className="lm-detail-body">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <input
                  value={pickerFilters.q}
                  onChange={(e) => {
                    setPickerFilters({ ...pickerFilters, q: e.target.value });
                    loadPicker(pickerFor);
                  }}
                  placeholder="🔍 Tìm kiếm..."
                  style={{ flex: 2, minWidth: 160, padding: 8, border: '1.5px solid var(--lm-line-2)', borderRadius: 6, fontSize: 13, background: '#fff' }}
                />
                <select
                  value={pickerFilters.difficulty}
                  onChange={(e) => {
                    setPickerFilters({ ...pickerFilters, difficulty: e.target.value });
                    loadPicker(pickerFor);
                  }}
                  style={{ padding: 8, borderRadius: 6, border: '1.5px solid var(--lm-line-2)', fontSize: 12.5, background: '#fff' }}
                >
                  <option value="">Mọi mức độ</option>
                  <option value="NHAN_BIET">Mức 1 · Nhận biết</option>
                  <option value="THONG_HIEU">Mức 2 · Thông hiểu</option>
                  <option value="VAN_DUNG">Mức 3 · Vận dụng</option>
                  <option value="VAN_DUNG_CAO">Mức 4 · VDC</option>
                </select>
                <select
                  value={pickerFilters.form}
                  onChange={(e) => {
                    setPickerFilters({ ...pickerFilters, form: e.target.value });
                    loadPicker(pickerFor);
                  }}
                  style={{ padding: 8, borderRadius: 6, border: '1.5px solid var(--lm-line-2)', fontSize: 12.5, background: '#fff', maxWidth: 180 }}
                >
                  <option value="">Mọi dạng toán</option>
                  {forms.map((f) => (
                    <option key={f.name} value={f.name}>{f.name} ({f.count})</option>
                  ))}
                </select>
              </div>
              {pickerLoading ? (
                <p style={{ color: 'var(--color-muted)', padding: 12 }}>Đang tải...</p>
              ) : pickerPool.length === 0 ? (
                <p style={{ color: 'var(--color-muted)', padding: 12 }}>Không có câu hỏi phù hợp.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pickerPool.map((q: any) => {
                    const used = slots.some((s) => s.question?.id === q.id);
                    return (
                      <div key={q.id} style={{ border: '1px solid var(--lm-line)', borderRadius: 8, padding: 10, opacity: used ? 0.55 : 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                          <span className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{q.code}</span>
                          {q.difficulty && <span className="badge badge-success">{DIFF_LABEL[q.difficulty]}</span>}
                          {q.form && <span className="badge badge-warning">📐 {q.form}</span>}
                          <div style={{ marginLeft: 'auto' }}>
                            <button
                              type="button"
                              className="lm-filter-btn on"
                              style={{ padding: '4px 12px', fontSize: 12 }}
                              disabled={used}
                              onClick={() => pickQuestion(q)}
                            >
                              {used ? 'Đã dùng' : '✅ Chọn'}
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: 13.5 }} className="q-clamp">
                          <LatexRenderer content={q.content} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL KHO CỦA TÔI ================= */}
      {showKho && (
        <div className="lm-detail-backdrop" onClick={() => setShowKho(false)}>
          <div className="lm-detail" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head">
              <span className="q-no">📦 Kho ma trận của tôi</span>
              <div style={{ marginLeft: 'auto' }}>
                <button type="button" className="lm-detail-close" onClick={() => setShowKho(false)}>✕</button>
              </div>
            </div>
            <div className="lm-detail-body">
              {matrices.length === 0 ? (
                <p style={{ color: 'var(--color-muted)', padding: 12 }}>Chưa có ma trận nào. Bấm "💾 LƯU MA TRẬN VÀO KHO" để lưu.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {matrices.map((m) => (
                    <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--lm-line)', borderRadius: 8, padding: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: 13.5 }}>{m.name}</strong>
                        <div style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 2 }}>
                          {new Date(m.updatedAt).toLocaleString('vi-VN')}
                        </div>
                      </div>
                      <button type="button" className="lm-filter-btn on" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => loadMatrix(m)}>
                        📂 Mở
                      </button>
                      <button type="button" className="lm-filter-btn" style={{ padding: '5px 12px', fontSize: 12, color: 'var(--color-danger)' }} onClick={() => deleteMatrix(m)}>
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL XEM TẤT CẢ ================= */}
      {showAll && (
        <div className="lm-detail-backdrop" onClick={() => setShowAll(false)}>
          <div className="lm-detail" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head">
              <span className="q-no">◎ Xem tất cả — {matrixName}</span>
              <div style={{ marginLeft: 'auto' }}>
                <button type="button" className="lm-detail-close" onClick={() => setShowAll(false)}>✕</button>
              </div>
            </div>
            <div className="lm-detail-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {slots.map((s, i) => (
                  <div key={i} style={{ border: '1px solid var(--lm-line)', borderRadius: 8, padding: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, color: 'var(--lm-maroon)' }}>Câu {i + 1}</span>
                      <span className="q-type-badge">{TYPE_LABEL[s.type]}</span>
                      {s.form && <span className="badge badge-warning">📐 {s.form}</span>}
                      {s.difficulty && <span className="badge badge-success">{DIFF_LABEL[s.difficulty]}</span>}
                      {s.locked && <span className="badge">🔒 đã chốt</span>}
                    </div>
                    {s.question?.content ? (
                      <div style={{ fontSize: 13.5 }}>
                        <LatexRenderer content={s.question.content} />
                      </div>
                    ) : (
                      <span style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>Chưa có câu</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal TẠO NHANH THEO DẠNG BÀI */}
      {showQuick && (
        <div className="lm-detail-backdrop" onClick={() => setShowQuick(false)}>
          <div className="lm-detail" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head">
              <span className="q-no">✨ Tạo đề nhanh theo dạng bài</span>
              <div style={{ marginLeft: 'auto' }}>
                <button type="button" className="lm-detail-close" onClick={() => setShowQuick(false)}>✕</button>
              </div>
            </div>
            <div className="lm-detail-body">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <div className="form-group" style={{ flex: 1, minWidth: 110 }}>
                  <label style={{ fontSize: 12 }}>Lớp</label>
                  <select
                    value={quickGrade}
                    onChange={(e) => {
                      setQuickGrade(e.target.value);
                      setQuickSel({});
                      loadQuickList(e.target.value, quickTopicId);
                    }}
                  >
                    <option value="">— Tất cả lớp —</option>
                    <option value="10">Lớp 10</option>
                    <option value="11">Lớp 11</option>
                    <option value="12">Lớp 12</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 2, minWidth: 200 }}>
                  <label style={{ fontSize: 12 }}>Chủ đề (chương)</label>
                  <select
                    value={quickTopicId}
                    onChange={(e) => {
                      setQuickTopicId(e.target.value);
                      setQuickSel({});
                      loadQuickList(quickGrade, e.target.value);
                    }}
                  >
                    <option value="">— Tất cả chủ đề —</option>
                    {topics
                      .filter((t) => !quickGrade || String(t.grade ?? '') === quickGrade)
                      .map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                  </select>
                </div>
              </div>

              {quickBusy ? (
                <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>Đang tải dạng bài…</p>
              ) : quickList.length === 0 ? (
                <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
                  Chưa có câu hỏi nào có dạng bài trong bộ lọc này — hãy nới bộ lọc hoặc nhập thêm câu.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      maxHeight: 300,
                      overflowY: 'auto',
                      border: '1px solid var(--lm-line)',
                      borderRadius: 8,
                    }}
                  >
                    {quickList.map((f) => {
                      const sel = quickSel[f.name] || { on: false, count: 0 };
                      return (
                        <div
                          key={f.name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '7px 10px',
                            borderBottom: '1px solid var(--lm-line)',
                            background: sel.on ? '#fdf1dc' : '#fff',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={sel.on}
                            onChange={(e) =>
                              setQuickSel((prev) => ({
                                ...prev,
                                [f.name]: {
                                  on: e.target.checked,
                                  count: e.target.checked ? Math.max(1, prev[f.name]?.count || 1) : 0,
                                },
                              }))
                            }
                            style={{ width: 'auto' }}
                          />
                          <span style={{ flex: 1, fontSize: 13, fontWeight: sel.on ? 800 : 600 }}>📐 {f.name}</span>
                          <span className="badge" style={{ fontSize: 11 }}>{f.count} câu có sẵn</span>
                          <input
                            type="number"
                            min={1}
                            max={f.count}
                            value={sel.count || ''}
                            disabled={!sel.on}
                            onChange={(e) =>
                              setQuickSel((prev) => ({
                                ...prev,
                                [f.name]: { on: true, count: Math.max(1, Number(e.target.value) || 1) },
                              }))
                            }
                            style={{ width: 64, padding: '5px 6px', borderRadius: 6, border: '1px solid #e0c48c', fontSize: 13 }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="toolbar-btn"
                      style={{ background: 'var(--lm-maroon)', borderColor: 'var(--lm-maroon)', color: '#fff', flex: 1, justifyContent: 'center' }}
                      onClick={() => buildQuick(false)}
                    >
                      ⚡ TẠO ĐỀ THEO CÁC DẠNG ĐÃ TICK
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn"
                      style={{ background: 'var(--lm-amber)', borderColor: 'var(--lm-amber)', color: '#5c3404', flex: 1, justifyContent: 'center', fontWeight: 800 }}
                      onClick={() => buildQuick(true)}
                      disabled={!quickTopicId && !quickGrade}
                      title="Tổng ôn: tự lấy mỗi dạng bài 2 câu, mức độ phân bố 70/30"
                    >
                      🎯 TỔNG ÔN CHƯƠNG (mỗi dạng 2 câu)
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
