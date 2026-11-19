'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import BackButton from '@/components/BackButton';
import LatexRenderer from '@/components/LatexRenderer';

// Bảng "Chọn lớp → hạn nộp" có nút + để giao hạn cho nhiều lớp
function ClassDeadlineEditor({
  classes,
  value,
  onChange,
}: {
  classes: string[];
  value: { className: string; dueDate: string }[];
  onChange: (v: { className: string; dueDate: string }[]) => void;
}) {
  const rows = Array.isArray(value) ? value : [];
  const used = new Set(rows.map((r) => r.className).filter(Boolean));
  const availableFor = (current: string) =>
    classes.filter((c) => c === current || !used.has(c));

  const addRow = () => {
    const free = classes.find((c) => !used.has(c));
    onChange([...rows, { className: free || '', dueDate: '' }]);
  };
  const updateRow = (i: number, patch: Partial<{ className: string; dueDate: string }>) => {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const removeRow = (i: number) => onChange(rows.filter((_, j) => j !== i));

  return (
    <div className="card" style={{ padding: 14, marginBottom: 14, background: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>
        🕐 Hạn nộp riêng theo lớp{' '}
        <span style={{ fontWeight: 400, color: 'var(--color-muted)', fontSize: 12 }}>
          (bỏ trống = dùng hạn chung)
        </span>
      </div>

      {rows.length === 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--color-muted)', marginBottom: 8 }}>
          Chưa có lớp nào được đặt hạn riêng.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={r.className}
              onChange={(e) => updateRow(i, { className: e.target.value })}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--color-rule)', background: 'var(--color-paper)', color: 'var(--color-ink)', fontSize: 13.5, minWidth: 120 }}
            >
              <option value="">— Chọn lớp —</option>
              {availableFor(r.className).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={r.dueDate || ''}
              onChange={(e) => updateRow(i, { dueDate: e.target.value })}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--color-rule)', background: 'var(--color-paper)', color: 'var(--color-ink)', fontSize: 13.5 }}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              title="Xoá dòng này"
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-rule)', background: 'var(--color-paper)', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 13 }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn btn-outline"
          style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5 }}
          onClick={addRow}
          disabled={rows.length >= classes.length}
        >
          ＋ Thêm lớp
        </button>
      </div>
    </div>
  );
}

export default function CourseAssignments() {
  const params = useParams();
  const courseId = params.id as string;
  const [course, setCourse] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Tạo bài giao
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<'EXAM' | 'TULUAN' | 'CUSTOM'>('EXAM');
  const [exams, setExams] = useState<any[]>([]);
  const [examSearch, setExamSearch] = useState('');
  const [examFolders, setExamFolders] = useState<any[]>([]);
  const [examFolderId, setExamFolderId] = useState('');
  const [essays, setEssays] = useState<any[]>([]);
  const [essaySearch, setEssaySearch] = useState('');
  const [topics, setTopics] = useState<any[]>([]);
  const [topicId, setTopicId] = useState('');
  const [tuluanMode, setTuluanMode] = useState<'bank' | 'type'>('bank');
  const [customQuestions, setCustomQuestions] = useState<string[]>([]);
  const [form, setForm] = useState<any>({
    title: '',
    description: '',
    examId: '',
    questionIds: [] as string[],
    customContent: '',
    pdfUrl: '',
    assignDate: '',
    dueDate: '',
    classDeadlines: [] as { className: string; dueDate: string }[],
    minScoreForAnswers: '',
    maxAttempts: '',
    maxResubmit: '',
    lockAfterGraded: true,
    hideAnswers: true,
    revealAnswersAt: '',
    showLeaderboard: false,
    allowResubmit: false,
    lateDeductionPercent: '',
    lateIntervalHours: 24,
    lateMinPercent: '',
    missingDeductionPercent: '',
    postManually: false,
  });
  const [saving, setSaving] = useState(false);
  // Danh sách lớp của khóa học (để đặt hạn riêng theo lớp)
  const [classes, setClasses] = useState<string[]>([]);

  // Chi tiết bài giao
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Lớp được chọn để xuất bảng điểm
  const [scoreClass, setScoreClass] = useState('__all__');

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    try {
      setCourse(await apiFetch(`/courses/${courseId}`));
      setData(await apiFetch(`/courses/${courseId}/assignments`));
      loadClasses();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function loadClasses() {
    try {
      const students = await apiFetch(`/courses/${courseId}/students`);
      const seen = new Set<string>();
      const cls: string[] = [];
      for (const s of (students || []) as any[]) {
        // API trả về enrollment lồng student: { student: { className } } (hỗ trợ cả dạng phẳng)
        const c = String(s?.student?.className ?? s?.className ?? '').trim();
        if (c && !seen.has(c)) {
          seen.add(c);
          cls.push(c);
        }
      }
      cls.sort((a, b) => a.localeCompare(b, 'vi'));
      setClasses(cls);
    } catch {
      /* bỏ qua */
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function loadExams() {
    try {
      setExams(await apiFetch('/exams'));
      const folders = await apiFetch('/exams/folders');
      setExamFolders(Array.isArray(folders) ? folders : []);
    } catch {
      /* ignore */
    }
  }

  async function loadEssays() {
    try {
      const r = await apiFetch('/bank/questions-paged?page=1&limit=200&type=ESSAY');
      setEssays(r.items || []);
      const tops = await apiFetch('/bank/topics');
      setTopics(Array.isArray(tops) ? tops : []);
    } catch {
      /* ignore */
    }
  }

  async function selectExamFolder(id: string) {
    setExamFolderId(id);
    try {
      setExams(await apiFetch(`/exams${id ? `?folderId=${id}` : ''}`));
    } catch {
      /* ignore */
    }
  }

  async function openCreate() {
    setShowForm(true);
    loadExams();
    loadEssays();
  }

  async function uploadPdf(file: File): Promise<string | null> {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/uploads/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', Authorization: `Bearer ${token}` },
        body: file,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Không tải được PDF' }));
        showToast('❌ ' + err.message);
        return null;
      }
      return (await res.json()).url;
    } catch (e: any) {
      showToast('❌ ' + e.message);
      return null;
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) {
      showToast('⚠️ Vui lòng nhập tiêu đề');
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/courses/${courseId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          kind,
          examId: kind === 'EXAM' ? form.examId || null : null,
          questionIds: kind === 'TULUAN' ? form.questionIds : [],
          customContent: kind === 'CUSTOM' ? form.customContent : null,
          customQuestions: kind === 'TULUAN' ? customQuestions.filter((c) => c.trim()) : [],
          assignDate: toIso(form.assignDate),
          dueDate: toIso(form.dueDate),
          classDeadlines: (form.classDeadlines || [])
            .filter((d: any) => d?.className && d?.dueDate)
            .map((d: any) => ({ className: d.className, dueDate: toIso(d.dueDate) })),
          revealAnswersAt: toIso(form.revealAnswersAt),
          minScoreForAnswers:
            form.minScoreForAnswers === '' ? null : Number(form.minScoreForAnswers),
        }),
      });
      setShowForm(false);
      setCustomQuestions([]);
      setTuluanMode('bank');
      setForm({ ...form, title: '', description: '', examId: '', questionIds: [], customContent: '', pdfUrl: '', assignDate: '', dueDate: '', classDeadlines: [], minScoreForAnswers: '', hideAnswers: true, revealAnswersAt: '', showLeaderboard: false, allowResubmit: false, lateDeductionPercent: '', lateIntervalHours: 24, lateMinPercent: '', postManually: false });
      showToast('✅ Đã giao bài tập (học sinh đã nhận thông báo)');
      load();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  // ===== SỬA BÀI TẬP ĐÃ GIAO =====
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<any>({
    title: '',
    description: '',
    assignDate: '',
    dueDate: '',
    classDeadlines: [] as { className: string; dueDate: string }[],
    minScoreForAnswers: '',
    maxAttempts: '',
    maxResubmit: '',
    lockAfterGraded: true,
    hideAnswers: true,
    revealAnswersAt: '',
    showLeaderboard: false,
    allowResubmit: false,
    lateDeductionPercent: '',
    lateIntervalHours: 24,
    lateMinPercent: '',
    missingDeductionPercent: '',
    postManually: false,
  });
  const [savingEdit, setSavingEdit] = useState(false);

  function toLocalInput(v: string | null | undefined): string {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Chuyển chuỗi datetime-local (giờ địa phương) → ISO để gửi lên server đúng múi giờ
  function toIso(v: string | null | undefined): string | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function openEdit(a: any) {
    // Đóng tab chi tiết để không che khuất giao diện sửa
    setDetail(null);
    setEditing(a);
    setEditForm({
      title: a.title || '',
      description: a.description || '',
      assignDate: toLocalInput(a.assignDate),
      dueDate: toLocalInput(a.dueDate),
      classDeadlines: (Array.isArray(a.classDeadlines) ? a.classDeadlines : []).map(
        (d: any) => ({ className: d.className, dueDate: toLocalInput(d.dueDate) }),
      ),
      minScoreForAnswers:
        a.minScoreForAnswers === null || a.minScoreForAnswers === undefined
          ? ''
          : String(a.minScoreForAnswers),
      maxAttempts:
        a.maxAttempts === null || a.maxAttempts === undefined
          ? ''
          : String(a.maxAttempts),
      maxResubmit:
        a.maxResubmit === null || a.maxResubmit === undefined
          ? ''
          : String(a.maxResubmit),
      lockAfterGraded: a.lockAfterGraded !== false,
      hideAnswers: !!a.hideAnswers,
      revealAnswersAt: toLocalInput(a.revealAnswersAt),
      showLeaderboard: !!a.showLeaderboard,
      allowResubmit: !!a.allowResubmit,
      lateDeductionPercent:
        a.lateDeductionPercent === null || a.lateDeductionPercent === undefined
          ? ''
          : String(a.lateDeductionPercent),
      lateIntervalHours: a.lateIntervalHours ?? 24,
      lateMinPercent:
        a.lateMinPercent === null || a.lateMinPercent === undefined
          ? ''
          : String(a.lateMinPercent),
      missingDeductionPercent:
        a.missingDeductionPercent === null ||
        a.missingDeductionPercent === undefined
          ? ''
          : String(a.missingDeductionPercent),
      postManually: !!a.postManually,
    });
  }

  async function saveEdit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!editing) return;
    if (!editForm.title.trim()) {
      showToast('⚠️ Vui lòng nhập tiêu đề');
      return;
    }
    setSavingEdit(true);
    try {
      await apiFetch(`/courses/${courseId}/assignments/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          assignDate: toIso(editForm.assignDate),
          dueDate: toIso(editForm.dueDate),
          classDeadlines: (editForm.classDeadlines || [])
            .filter((d: any) => d?.className && d?.dueDate)
            .map((d: any) => ({ className: d.className, dueDate: toIso(d.dueDate) })),
          revealAnswersAt: toIso(editForm.revealAnswersAt),
          minScoreForAnswers:
            editForm.minScoreForAnswers === ''
              ? null
              : Number(editForm.minScoreForAnswers),
          maxAttempts:
            editForm.maxAttempts === '' ? 0 : Number(editForm.maxAttempts),
          maxResubmit:
            editForm.maxResubmit === '' ? null : Number(editForm.maxResubmit),
          lockAfterGraded: !!editForm.lockAfterGraded,
          hideAnswers: editForm.hideAnswers,
          showLeaderboard: editForm.showLeaderboard,
          allowResubmit: editForm.allowResubmit,
          lateDeductionPercent:
            editForm.lateDeductionPercent === ''
              ? null
              : Number(editForm.lateDeductionPercent),
          lateIntervalHours:
            editForm.lateIntervalHours === ''
              ? 24
              : Number(editForm.lateIntervalHours),
          lateMinPercent:
            editForm.lateMinPercent === ''
              ? null
              : Number(editForm.lateMinPercent),
          missingDeductionPercent:
            editForm.missingDeductionPercent === ''
              ? null
              : Number(editForm.missingDeductionPercent),
          postManually: editForm.postManually,
        }),
      });
      showToast('✅ Đã cập nhật bài tập');
      const editedId = editing.id;
      setEditing(null);
      await load();
      // Mở lại chi tiết bài tập sau khi lưu
      await openDetail(editedId);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    setScoreClass('__all__');
    try {
      setDetail(await apiFetch(`/courses/${courseId}/assignments/${id}`));
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function gradeQuick(submissionId: string, patch: any) {
    try {
      await apiFetch(`/courses/${courseId}/assignments/${detail.id}/submissions/${submissionId}/grade`, {
        method: 'POST',
        body: JSON.stringify(patch),
      });
      showToast('✅ Đã lưu điểm');
      openDetail(detail.id);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function removeAssignment(id: string) {
    if (!confirm('Xóa bài giao này (kèm toàn bộ bài nộp)?')) return;
    try {
      await apiFetch(`/courses/${courseId}/assignments/${id}`, { method: 'DELETE' });
      setDetail(null);
      load();
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function exportScores(format: 'pdf' | 'xlsx') {
    if (!detail) return;
    try {
      const token = localStorage.getItem('token');
      const cls = scoreClass === '__all__' ? '' : scoreClass;
      const res = await fetch(
        `/api/courses/${courseId}/assignments/${detail.id}/scores/export?format=${format}${cls ? `&className=${encodeURIComponent(cls)}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert('❌ ' + (err.message || 'Không xuất được'));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bang-diem-${detail.title || 'bai-tap'}${cls ? '-' + cls : ''}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('❌ ' + e.message);
    }
  }

  async function sendEmail() {
    if (!detail) return;
    const subject = prompt('Tiêu đề email:', `LumiMath: ${detail.title}`) || undefined;
    const body = prompt('Nội dung email (HTML đơn giản):', `<p>Thông báo về bài tập <b>${detail.title}</b> — mời em truy cập LumiMath để làm bài.</p>`) || undefined;
    if (!subject && !body) return;
    const toAll = confirm('Gửi cho TOÀN BỘ học sinh đã đăng ký?\n(Bấm Hủy để chọn từng học sinh — tạm thời hỗ trợ gửi đồng loạt)');
    try {
      const res = await apiFetch(`/courses/${courseId}/assignments/${detail.id}/notify-email`, {
        method: 'POST',
        body: JSON.stringify({ subject, body, studentIds: toAll ? [] : [] }),
      });
      showToast(`📧 Đã gửi email cho ${res.sent}/${res.total} học sinh`);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  // Nhóm theo ngày
  const groups: { date: string; items: any[] }[] = [];
  if (data?.assignments) {
    const map = new Map<string, any[]>();
    for (const a of data.assignments) {
      const d = new Date(a.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    map.forEach((items, key) => {
      const d = new Date(Number(key.split('-')[0]), Number(key.split('-')[1]), Number(key.split('-')[2]));
      groups.push({ date: d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' }), items });
    });
    groups.sort((a, b) => (a.items[0].createdAt < b.items[0].createdAt ? 1 : -1));
  }

  const filteredExams = exams.filter((x) => x.title.toLowerCase().includes(examSearch.toLowerCase()));
  const filteredEssays = essays.filter(
    (q) =>
      (!topicId || q.topicId === topicId) &&
      (q.content || '').toLowerCase().includes(essaySearch.toLowerCase()),
  );
  // Cây thư mục
  const renderFolderTree = (parentId: string | null, depth: number): any[] => {
    const items = examFolders.filter((f) => (f.parentId || null) === parentId);
    return items.map((f) => (
      <div key={f.id}>
        <button
          type="button"
          onClick={() => selectExamFolder(f.id)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '6px 8px',
            paddingLeft: 8 + depth * 16,
            borderRadius: 6,
            border: 'none',
            background: examFolderId === f.id ? 'var(--color-track)' : 'transparent',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: examFolderId === f.id ? 800 : 500,
            color: examFolderId === f.id ? 'var(--lm-maroon)' : 'inherit',
          }}
        >
          📁 {f.name}
        </button>
        {renderFolderTree(f.id, depth + 1)}
      </div>
    ));
  };
  const renderTopicTree = (parentId: string | null, depth: number): any[] => {
    const items = topics.filter((t) => (t.parentId || null) === parentId);
    return items.map((t) => (
      <div key={t.id}>
        <button
          type="button"
          onClick={() => setTopicId(topicId === t.id ? '' : t.id)}
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '6px 8px',
            paddingLeft: 8 + depth * 16,
            borderRadius: 6,
            border: 'none',
            background: topicId === t.id ? 'var(--color-track)' : 'transparent',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: topicId === t.id ? 800 : 500,
            color: topicId === t.id ? 'var(--lm-maroon)' : 'inherit',
          }}
        >
          📚 {t.name} <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>({t._count?.questions ?? 0})</span>
        </button>
        {renderTopicTree(t.id, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="page-container" style={{ maxWidth: 1100 }}>
      {toast && <div className="toast" style={{ position: 'fixed', top: 20, right: 20, zIndex: 60 }}>{toast}</div>}
      <div className="lm-band">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>
            <BackButton to={`/teacher/courses/${courseId}`} label="Về khóa học" />
            📚 Giao bài tập
          </h2>
          <p className="lm-band-sub">
            {course?.title || ''} · {data?.studentCount ?? 0} học sinh
          </p>
        </div>
        <button className="btn-lm amber" onClick={openCreate}>＋ Giao bài mới</button>
      </div>

      {data === null ? (
        <p style={{ marginTop: 20, color: 'var(--color-muted)' }}>Đang tải…</p>
      ) : data.assignments.length === 0 ? (
        <div className="card" style={{ marginTop: 20, textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📚</div>
          <p>Chưa có bài nào được giao. Bấm "＋ Giao bài mới" để giao bài đầu tiên!</p>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          {groups.map((g) => (
            <div key={g.date} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--lm-maroon)', padding: '6px 4px', borderBottom: '2px solid var(--lm-amber)', marginBottom: 10 }}>
                📅 {g.date}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {g.items.map((a) => (
                  <div
                    key={a.id}
                    className="card"
                    style={{ padding: 14, cursor: 'pointer', borderLeft: '4px solid var(--lm-amber)' }}
                    onClick={() => openDetail(a.id)}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 26 }}>📄</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{a.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>
                          {a.kind === 'EXAM' ? '📝 Đề thi' : a.kind === 'TULUAN' ? '✍️ Tự luận' : '🖊 Tự gõ đề'}
                          {a.dueDate ? ` · hạn ${new Date(a.dueDate).toLocaleDateString('vi-VN')}` : ''}
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <span className="badge badge-accent" style={{ fontSize: 11.5 }}>
                            Đã nộp: {a.submissionCount}/{data.studentCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== MODAL TẠO BÀI GIAO ===== */}
      {showForm && (
        <div className="lm-detail-backdrop" onClick={() => setShowForm(false)}>
          <div className="lm-detail" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head">
              <strong>📚 Giao bài tập mới</strong>
              <button className="lm-detail-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="lm-detail-body" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
              <form onSubmit={create}>
                <div className="form-group">
                  <label>Tiêu đề bài giao *</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="VD: Buổi 16: Ôn tập ước và bội" required />
                </div>

                {/* Chọn loại */}
                <div className="form-group">
                  <label>Loại bài giao</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([
                      ['EXAM', '📝 Đề thi (từ kho đề)'],
                      ['TULUAN', '✍️ Tự luận (từ ngân hàng)'],
                      ['CUSTOM', '🖊 Tự gõ đề'],
                    ] as const).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        className={`lm-filter-btn${kind === k ? ' on' : ''}`}
                        style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700 }}
                        onClick={() => setKind(k)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {kind === 'EXAM' && (
                  <div className="form-group">
                    <label>Chọn đề thi — giao diện Kho đề thi (duyệt thư mục → chọn đề)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 10, border: '1px solid var(--color-rule)', borderRadius: 10, padding: 10, background: 'var(--color-surface)' }}>
                      {/* Cây thư mục đề thi */}
                      <div style={{ borderRight: '1px solid var(--color-rule)', paddingRight: 8, maxHeight: 320, overflowY: 'auto' }}>
                        <button
                          type="button"
                          onClick={() => selectExamFolder('')}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                            borderRadius: 6, border: 'none',
                            background: examFolderId === '' ? 'var(--color-track)' : 'transparent',
                            cursor: 'pointer', fontSize: 13,
                            fontWeight: examFolderId === '' ? 800 : 500,
                            color: examFolderId === '' ? 'var(--lm-maroon)' : 'inherit',
                          }}
                        >
                          🗂 Tất cả đề thi
                        </button>
                        {renderFolderTree(null, 0)}
                      </div>
                      {/* Danh sách đề trong thư mục đang chọn */}
                      <div>
                        <input value={examSearch} onChange={(e) => setExamSearch(e.target.value)} placeholder="🔍 Tìm đề thi…" style={{ marginBottom: 8 }} />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                          {filteredExams.length === 0 && (
                            <p style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>Thư mục này chưa có đề thi.</p>
                          )}
                          {filteredExams.map((ex) => (
                            <div
                              key={ex.id}
                              onClick={() => setForm({ ...form, examId: ex.id })}
                              style={{
                                padding: 10,
                                borderRadius: 8,
                                border: form.examId === ex.id ? '2px solid var(--lm-amber)' : '1px solid var(--color-rule)',
                                background: form.examId === ex.id ? 'var(--color-track)' : 'var(--color-surface)',
                                cursor: 'pointer',
                                fontSize: 12.5,
                              }}
                            >
                              <div style={{ fontWeight: 700 }}>{form.examId === ex.id ? '✓ ' : ''}{ex.title}</div>
                              <div style={{ color: 'var(--color-muted)', fontSize: 11.5, marginTop: 2 }}>
                                {ex.totalScore} điểm · {ex.duration} phút · {ex._count?.items ?? 0} câu
                                {ex.folder?.name ? ` · 📁 ${ex.folder.name}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {form.examId && (
                      <p style={{ fontSize: 12.5, marginTop: 6, color: 'var(--color-success)', fontWeight: 700 }}>
                        ✓ Đã chọn đề: {filteredExams.find((x) => x.id === form.examId)?.title}
                      </p>
                    )}
                  </div>
                )}

                {kind === 'TULUAN' && (
                  <div className="form-group">
                    <label>Chọn bài tự luận — ngân hàng đề hoặc tự gõ nhiều câu</label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <button type="button" className={`lm-filter-btn${tuluanMode === 'bank' ? ' on' : ''}`} style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 700 }} onClick={() => setTuluanMode('bank')}>
                        📚 Chọn từ ngân hàng đề
                      </button>
                      <button type="button" className={`lm-filter-btn${tuluanMode === 'type' ? ' on' : ''}`} style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 700 }} onClick={() => setTuluanMode('type')}>
                        ✍️ Tự gõ nhiều câu
                      </button>
                    </div>

                    {tuluanMode === 'bank' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 10, border: '1px solid var(--color-rule)', borderRadius: 10, padding: 10, background: 'var(--color-surface)' }}>
                        <div style={{ borderRight: '1px solid var(--color-rule)', paddingRight: 8, maxHeight: 320, overflowY: 'auto' }}>
                          <button
                            type="button"
                            onClick={() => setTopicId('')}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px',
                              borderRadius: 6, border: 'none',
                              background: topicId === '' ? 'var(--color-track)' : 'transparent',
                              cursor: 'pointer', fontSize: 13,
                              fontWeight: topicId === '' ? 800 : 500,
                              color: topicId === '' ? 'var(--lm-maroon)' : 'inherit',
                            }}
                          >
                            🗂 Tất cả chủ đề
                          </button>
                          {renderTopicTree(null, 0)}
                        </div>
                        <div>
                          <input value={essaySearch} onChange={(e) => setEssaySearch(e.target.value)} placeholder="🔍 Tìm câu tự luận…" style={{ marginBottom: 8 }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                            {filteredEssays.length === 0 && (
                              <p style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>Chủ đề này chưa có câu tự luận.</p>
                            )}
                            {filteredEssays.map((q) => (
                              <label
                                key={q.id}
                                style={{
                                  display: 'flex', gap: 8, alignItems: 'flex-start', padding: 8, borderRadius: 8,
                                  border: form.questionIds.includes(q.id) ? '1.5px solid var(--lm-amber)' : '1px solid var(--color-rule)',
                                  background: form.questionIds.includes(q.id) ? 'var(--color-track)' : 'var(--color-surface)', cursor: 'pointer', fontSize: 13,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={form.questionIds.includes(q.id)}
                                  onChange={(e) =>
                                    setForm({
                                      ...form,
                                      questionIds: e.target.checked
                                        ? [...form.questionIds, q.id]
                                        : form.questionIds.filter((x: string) => x !== q.id),
                                    })
                                  }
                                  style={{ width: 'auto', marginTop: 4 }}
                                />
                                <span style={{ flex: 1 }}><LatexRenderer content={q.content} /></span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {customQuestions.map((c, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <span style={{ fontWeight: 800, paddingTop: 8, fontSize: 12.5 }}>Câu {i + 1}.</span>
                            <textarea
                              rows={3}
                              value={c}
                              onChange={(e) => setCustomQuestions((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                              placeholder="Gõ câu hỏi tự luận, hỗ trợ LaTeX $...$"
                              style={{ flex: 1, padding: 8, borderRadius: 6, border: '1px solid var(--color-rule)', fontSize: 13 }}
                            />
                            <button
                              type="button"
                              className="lm-filter-btn"
                              style={{ padding: '4px 8px', fontSize: 12, color: 'var(--color-danger)' }}
                              onClick={() => setCustomQuestions((p) => p.filter((_, j) => j !== i))}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button type="button" className="lm-filter-btn" style={{ width: 'auto', padding: '6px 14px', fontSize: 12.5 }} onClick={() => setCustomQuestions((p) => [...p, ''])}>
                          ＋ Thêm câu tự luận
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {kind === 'CUSTOM' && (
                  <div className="form-group">
                    <label>Đề bài (gõ trực tiếp, hỗ trợ LaTeX $...$)</label>
                    <textarea rows={5} value={form.customContent} onChange={(e) => setForm({ ...form, customContent: e.target.value })} placeholder="Cho hàm số $f(x)=x^2$…" />
                  </div>
                )}

                <div className="form-group">
                  <label>📄 Đính kèm PDF đề (tùy chọn, ≤10MB tự nén)</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const url = await uploadPdf(f);
                      if (url) setForm({ ...form, pdfUrl: url });
                    }}
                  />
                  {form.pdfUrl && (
                    <a href={form.pdfUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: 'var(--color-accent)' }}>
                      ✅ Đã đính kèm PDF đề (xem)
                    </a>
                  )}
                </div>

                <div className="form-group">
                  <label>Mô tả / hướng dẫn (tùy chọn)</label>
                  <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label>Ngày giao</label>
                    <input type="datetime-local" value={form.assignDate} onChange={(e) => setForm({ ...form, assignDate: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Hạn nộp (chung)</label>
                    <input type="datetime-local" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                  </div>
                </div>

                {/* Hạn nộp riêng theo lớp */}
                {classes.length > 0 && (
                  <ClassDeadlineEditor
                    classes={classes}
                    value={form.classDeadlines || []}
                    onChange={(v) => setForm({ ...form, classDeadlines: v })}
                  />
                )}

                <div className="card" style={{ padding: 14, marginBottom: 14, background: 'var(--color-paper-2)' }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--color-warning)', marginBottom: 10 }}>🔐 Cài đặt đáp án & kết quả</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label>Điểm tối thiểu đạt để xem đáp án</label>
                      <input type="number" min={0} step={0.5} value={form.minScoreForAnswers} onChange={(e) => setForm({ ...form, minScoreForAnswers: e.target.value })} placeholder="VD: 5 (để trống = không yêu cầu)" />
                    </div>
                    <div className="form-group">
                      <label>🔁 Số lần nộp tối đa</label>
                      <input type="number" min={0} step={1} value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: e.target.value })} placeholder="VD: 1 (0 = không giới hạn)" />
                    </div>
                    <div className="form-group">
                      <label>✏️ Số lần được SỬA tối đa</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={form.maxResubmit}
                        onChange={(e) => setForm({ ...form, maxResubmit: e.target.value })}
                        placeholder="VD: 3 (để trống = không giới hạn, 0 = không cho sửa)"
                      />
                    </div>
                    <div className="form-group">
                      <label>Thời điểm công bố đáp án</label>
                      <input type="datetime-local" value={form.revealAnswersAt} onChange={(e) => setForm({ ...form, revealAnswersAt: e.target.value })} placeholder="Ẩn đáp án đến thời điểm này" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13.5 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={form.hideAnswers} onChange={(e) => setForm({ ...form, hideAnswers: e.target.checked })} style={{ width: 'auto' }} />
                      🙈 Ẩn đáp án
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={form.showLeaderboard} onChange={(e) => setForm({ ...form, showLeaderboard: e.target.checked })} style={{ width: 'auto' }} />
                      🏆 Hiện bảng xếp hạng
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={form.allowResubmit} onChange={(e) => setForm({ ...form, allowResubmit: e.target.checked })} style={{ width: 'auto' }} />
                      🔁 Cho nộp lại
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={form.lockAfterGraded} onChange={(e) => setForm({ ...form, lockAfterGraded: e.target.checked })} style={{ width: 'auto' }} />
                      🔒 Khoá sửa sau khi đã chấm
                    </label>
                  </div>

                  {/* ===== CHÍNH SÁCH NỘP MUỘN (Canvas late_policy) ===== */}
                  <div style={{ border: '1px dashed var(--color-rule)', borderRadius: 10, padding: 12, marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>⏰ Chính sách nộp muộn</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                      <label style={{ fontSize: 12.5 }}>
                        Trừ % mỗi khoảng
                        <input type="number" min={0} max={100} step={1} value={form.lateDeductionPercent} onChange={(e) => setForm({ ...form, lateDeductionPercent: e.target.value })} placeholder="VD: 10 (%/khoảng)" />
                      </label>
                      <label style={{ fontSize: 12.5 }}>
                        Mỗi khoảng (giờ)
                        <input type="number" min={1} max={720} step={1} value={form.lateIntervalHours} onChange={(e) => setForm({ ...form, lateIntervalHours: e.target.value })} placeholder="24" />
                      </label>
                      <label style={{ fontSize: 12.5 }}>
                        Sàn tối thiểu (% điểm giữ lại)
                        <input type="number" min={0} max={100} step={5} value={form.lateMinPercent} onChange={(e) => setForm({ ...form, lateMinPercent: e.target.value })} placeholder="VD: 50" />
                      </label>
                    </div>
                    <p style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 6 }}>
                      VD: trừ 10% mỗi 24 giờ, sàn 50% → nộp trễ 2 ngày = còn 80% điểm (không dưới 50%).
                    </p>
                  </div>

                  {/* ===== POST POLICY ===== */}
                  <div style={{ border: '1px dashed var(--color-rule)', borderRadius: 10, padding: 12, marginTop: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!form.postManually}
                        onChange={(e) => setForm({ ...form, postManually: e.target.checked })}
                        style={{ width: 'auto' }}
                      />
                      🔒 Chấm ẩn điểm — học sinh chỉ thấy điểm/nhận xét khi bạn bấm "Công bố điểm" (hoặc hẹn giờ)
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Hủy</button>
                  <button className="btn-lm amber" style={{ width: 'auto' }} disabled={saving}>
                    {saving ? '⏳ Đang giao…' : '📚 Giao bài tập'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL CHI TIẾT BÀI GIAO ===== */}
      {detail && (
        <div className="lm-detail-backdrop" onClick={() => setDetail(null)}>
          <div className="lm-detail" style={{ maxWidth: 1000 }} onClick={(e) => e.stopPropagation()}>
            <div className="lm-detail-head">
              <strong>📚 {detail.title}</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline" style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5 }} onClick={sendEmail} title="Gửi email thông báo (chỉ gửi khi bạn bấm nút này)">
                  📧 Gửi email
                </button>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5 }}
                  onClick={() => openEdit(detail)}
                  title="Sửa thông tin bài tập đã giao (tiêu đề, hạn nộp, cài đặt...)"
                >
                  ✏️ Sửa bài tập
                </button>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5 }}
                  onClick={() => exportScores('pdf')}
                  title="Xuất bảng điểm học sinh của bài tập này (PDF) — xếp từ cao xuống thấp"
                >
                  📄 Điểm PDF
                </button>
                <button
                  className="btn btn-outline"
                  style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5 }}
                  onClick={() => exportScores('xlsx')}
                  title="Xuất bảng điểm học sinh của bài tập này (Excel) — xếp từ cao xuống thấp"
                >
                  📊 Điểm Excel
                </button>
                <select
                  value={scoreClass}
                  onChange={(e) => setScoreClass(e.target.value)}
                  title="Xuất bảng điểm theo lớp"
                  style={{ padding: '6px 8px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--color-rule)', background: 'var(--color-paper)', color: 'var(--color-ink)' }}
                >
                  <option value="__all__">Tất cả lớp</option>
                  {(() => {
                    const classes: string[] = [];
                    const seen = new Set<string>();
                    for (const s of (detail.students || []) as any[]) {
                      const c = String(s?.className || '');
                      if (c && !seen.has(c)) {
                        seen.add(c);
                        classes.push(c);
                      }
                    }
                    return classes.map((c: string) => (
                      <option key={c} value={c}>{c}</option>
                    ));
                  })()}
                </select>
                <Link href={`/teacher/courses/${courseId}/assignments/${detail.id}/grade`} className="btn-lm ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5 }}>
                  🖊 Vào chấm bài →
                </Link>
                <button className="btn btn-outline" style={{ width: 'auto', padding: '6px 12px', fontSize: 12, color: 'var(--color-danger)' }} onClick={() => removeAssignment(detail.id)}>
                  🗑️
                </button>
                <button className="lm-detail-close" onClick={() => setDetail(null)}>✕</button>
              </div>
            </div>
            <div className="lm-detail-body" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
              {detailLoading ? (
                <p style={{ color: 'var(--color-muted)' }}>Đang tải…</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
                  {/* Panel trái: thông tin */}
                  <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                    <p><strong>Loại:</strong> {detail.kind === 'EXAM' ? '📝 Đề thi' : detail.kind === 'TULUAN' ? '✍️ Tự luận' : '🖊 Tự gõ đề'}</p>
                    {detail.exam?.title && <p><strong>Đề:</strong> {detail.exam.title} ({detail.exam.totalScore}đ)</p>}
                    <p><strong>Ngày giao:</strong> {detail.assignDate ? new Date(detail.assignDate).toLocaleString('vi-VN') : '—'}</p>
                    <p><strong>Hạn nộp:</strong> {detail.dueDate ? new Date(detail.dueDate).toLocaleString('vi-VN') : 'Không giới hạn'}</p>
                    {Array.isArray(detail.classDeadlines) && detail.classDeadlines.length > 0 && (
                      <div style={{ margin: '4px 0 4px 0' }}>
                        <strong>Hạn riêng theo lớp:</strong>
                        <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                          {detail.classDeadlines.map((d: any, i: number) => (
                            <li key={i}>
                              <b>{d.className}</b> → {new Date(d.dueDate).toLocaleString('vi-VN')}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p><strong>Điểm tối thiểu xem đáp án:</strong> {detail.minScoreForAnswers ?? '—'}</p>
                    <p><strong>Đáp án:</strong> {detail.hideAnswers ? `🙈 Ẩn${detail.revealAnswersAt ? ` đến ${new Date(detail.revealAnswersAt).toLocaleString('vi-VN')}` : ''}` : 'Hiện'}</p>
                    <p><strong>Bảng xếp hạng:</strong> {detail.showLeaderboard ? '🏆 Hiện' : 'Ẩn'}</p>
                    <p><strong>Nộp lại:</strong> {detail.allowResubmit ? 'Cho phép' : 'Không'}</p>
                    {detail.description && (
                      <div style={{ marginTop: 8, background: 'var(--color-paper-2)', padding: 10, borderRadius: 8, whiteSpace: 'pre-wrap' }}>
                        {detail.description}
                      </div>
                    )}
                    {detail.pdfUrl && (
                      <a href={detail.pdfUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 13, color: 'var(--color-accent)' }}>
                        📄 Xem PDF đề đính kèm
                      </a>
                    )}
                  </div>

                  {/* Panel phải: danh sách học sinh */}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 13.5, marginBottom: 10 }}>
                      Danh sách nộp bài ({detail.submissions?.length}/{detail.students?.length})
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                      {(detail.students || []).map((s: any) => {
                        const sub = detail.submissions.find((x: any) => x.studentId === s.id);
                        return (
                          <div key={s.id} style={{ padding: 10, borderRadius: 10, border: '1px solid var(--color-rule)', background: 'var(--color-surface)' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <div style={{ width: 34, height: 34, borderRadius: 17, background: 'var(--lm-maroon)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                                {(s.fullName || '?')[0]}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.fullName}</div>
                                <div className="mono" style={{ fontSize: 10.5, color: 'var(--color-muted)' }}>{s.studentCode || ''}</div>
                              </div>
                            </div>
                            <div style={{ marginTop: 8, fontSize: 12 }}>
                              {!sub ? (
                                <span className="badge" style={{ fontSize: 11 }}>Chưa nộp</span>
                              ) : (
                                <>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                                    <span className="mono" style={{ fontWeight: 800, fontSize: 13 }}>
                                      {sub.score != null ? `${sub.score}đ` : sub.aiScore != null ? `~${sub.aiScore} (AI)` : 'Chưa chấm'}
                                    </span>
                                    <span className="badge" style={{ fontSize: 10.5 }}>
                                      {sub.status === 'RETURNED' ? '🔁 Đã yêu cầu nộp lại' : sub.status === 'GRADED' ? (sub.published ? '✅ Đã chốt' : '✏️ Chưa chốt') : '📥 Đã nộp'}
                                    </span>
                                  </div>
                                  {sub.imageUrls?.length > 0 && (
                                    <div style={{ marginTop: 4, color: 'var(--color-muted)', fontSize: 11 }}>
                                      🖼 {sub.imageUrls.length} ảnh{sub.pdfUrl ? ' + 📄 PDF' : ''}
                                    </div>
                                  )}
                                  {sub.assessment && <div style={{ marginTop: 4, color: 'var(--lm-maroon)', fontSize: 11.5, fontWeight: 700 }}>Đánh giá: {sub.assessment}</div>}
                                  {sub.teacherComment && (
                                    <div style={{ marginTop: 4, color: 'var(--color-muted)', fontSize: 11.5, fontStyle: 'italic' }}>
                                      "{sub.teacherComment.slice(0, 60)}{sub.teacherComment.length > 60 ? '…' : ''}"
                                    </div>
                                  )}
                                  <Link
                                    href={`/teacher/courses/${courseId}/assignments/${detail.id}/grade?submission=${sub.id}`}
                                    className="btn-lm ghost"
                                    style={{ display: 'inline-block', marginTop: 6, width: 'auto', padding: '4px 10px', fontSize: 11.5, textDecoration: 'none' }}
                                  >
                                    🖊 Chấm bài
                                  </Link>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal sửa bài tập đã giao */}
      {editing && (
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
          onClick={() => setEditing(null)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 760, maxHeight: '90vh', overflowY: 'auto', padding: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <strong style={{ fontSize: 17 }}>✏️ Sửa bài tập</strong>
              <button className="lm-detail-close" onClick={() => setEditing(null)}>✕</button>
            </div>
            <form onSubmit={saveEdit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                  <label>Tiêu đề</label>
                  <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} required />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                  <label>Mô tả / Ghi chú</label>
                  <textarea rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Ngày giao</label>
                  <input type="datetime-local" value={editForm.assignDate} onChange={(e) => setEditForm({ ...editForm, assignDate: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Hạn nộp (chung)</label>
                  <input type="datetime-local" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} />
                </div>
                {classes.length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <ClassDeadlineEditor
                      classes={classes}
                      value={editForm.classDeadlines || []}
                      onChange={(v) => setEditForm({ ...editForm, classDeadlines: v })}
                    />
                  </div>
                )}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>⭐ Điểm tối thiểu được xem đáp án</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={editForm.minScoreForAnswers}
                    onChange={(e) => setEditForm({ ...editForm, minScoreForAnswers: e.target.value })}
                    placeholder="VD: 5 (để trống = không yêu cầu)"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>🔁 Số lần nộp tối đa</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editForm.maxAttempts}
                    onChange={(e) => setEditForm({ ...editForm, maxAttempts: e.target.value })}
                    placeholder="VD: 1 (0 = không giới hạn)"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>✏️ Số lần được SỬA tối đa</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editForm.maxResubmit}
                    onChange={(e) => setEditForm({ ...editForm, maxResubmit: e.target.value })}
                    placeholder="VD: 3 (trống = không giới hạn, 0 = không cho sửa)"
                  />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={editForm.lockAfterGraded}
                    onChange={(e) => setEditForm({ ...editForm, lockAfterGraded: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  🔒 Khoá sửa sau khi đã chấm
                </label>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Ẩn đáp án đến thời điểm</label>
                  <input type="datetime-local" value={editForm.revealAnswersAt} onChange={(e) => setEditForm({ ...editForm, revealAnswersAt: e.target.value })} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Trừ điểm nộp muộn (%/khoảng giờ)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="number" min={0} max={100} value={editForm.lateDeductionPercent} onChange={(e) => setEditForm({ ...editForm, lateDeductionPercent: e.target.value })} placeholder="VD: 10" />
                    <input type="number" min={1} max={720} value={editForm.lateIntervalHours} onChange={(e) => setEditForm({ ...editForm, lateIntervalHours: e.target.value })} placeholder="24" style={{ width: 90 }} />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Mức trừ tối đa (%)</label>
                  <input type="number" min={0} max={100} value={editForm.lateMinPercent} onChange={(e) => setEditForm({ ...editForm, lateMinPercent: e.target.value })} placeholder="VD: 50" />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 6 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                    <input type="checkbox" checked={editForm.hideAnswers} onChange={(e) => setEditForm({ ...editForm, hideAnswers: e.target.checked })} style={{ width: 'auto' }} />
                    Ẩn đáp án
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                    <input type="checkbox" checked={editForm.showLeaderboard} onChange={(e) => setEditForm({ ...editForm, showLeaderboard: e.target.checked })} style={{ width: 'auto' }} />
                    Bảng xếp hạng
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                    <input type="checkbox" checked={editForm.allowResubmit} onChange={(e) => setEditForm({ ...editForm, allowResubmit: e.target.checked })} style={{ width: 'auto' }} />
                    Cho nộp lại
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
                    <input type="checkbox" checked={editForm.postManually} onChange={(e) => setEditForm({ ...editForm, postManually: e.target.checked })} style={{ width: 'auto' }} />
                    Chấm ẩn điểm
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
                <button className="btn" type="submit" style={{ flex: 1 }} disabled={savingEdit}>
                  {savingEdit ? 'Đang lưu…' : '💾 Lưu thay đổi'}
                </button>
                <button className="btn btn-outline" type="button" style={{ flex: 1 }} onClick={() => setEditing(null)}>
                  Hủy
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 10, marginBottom: 0 }}>
                Học sinh sẽ thấy thay đổi ngay. Bài đã nộp vẫn giữ nguyên điểm.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
