'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { formatAnswer } from '@/lib/answer';
import BackButton from '@/components/BackButton';
import LatexRenderer from '@/components/LatexRenderer';
import AnnotateBoard from '@/components/AnnotateBoard';
import dynamic from 'next/dynamic';

const PdfAnnotator = dynamic(() => import('@/components/PdfAnnotator'), { ssr: false });

type Stroke = {
  tool: 'pen' | 'eraser' | 'highlight';
  color: string;
  size: number;
  points: { x: number; y: number }[];
};

export default function GradeAssignmentPage() {
  const params = useParams();
  const search = useSearchParams();
  const courseId = params.id as string;
  const assignmentId = params.assignmentId as string;

  const [detail, setDetail] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Công cụ vẽ
  const [tool, setTool] = useState<'pen' | 'eraser' | 'highlight'>('pen');
  const [color, setColor] = useState('#e11d48');
  const [size, setSize] = useState(3);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [zoom, setZoom] = useState(1);
  const drawing = useRef(false);
  const current = useRef<Stroke | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);

  // Panel chấm
  const [score, setScore] = useState('');
  const [assessment, setAssessment] = useState('');
  const [comment, setComment] = useState('');
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  // Chấm đề thi (trắc nghiệm + tự luận từng phần)
  const [examReview, setExamReview] = useState<any>(null);
  const [essayScores, setEssayScores] = useState<Record<string, number[]>>({});

  // Chú thích trực tiếp trên ảnh tự luận của đề thi
  const [annoImage, setAnnoImage] = useState<string | null>(null);
  const [annoStrokes, setAnnoStrokes] = useState<Record<string, Stroke[]>>({});
  const [annoRedo, setAnnoRedo] = useState<Record<string, Stroke[]>>({});
  const [tldrawSnapshots, setTldrawSnapshots] = useState<Record<string, any>>({});
  const [useTldraw, setUseTldraw] = useState(true);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBoard, setPdfBoard] = useState<Record<number, any[]>>({});
  const [imgIndex, setImgIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'images' | 'pdf'>('images');
  const commentRef = useRef<HTMLDivElement>(null);
  // Ngân hàng nhận xét gợi ý
  const [templates, setTemplates] = useState<{ id: string; text: string }[]>([]);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplQuery, setTplQuery] = useState('');
  const [tplNew, setTplNew] = useState('');

  async function loadTemplates() {
    try {
      const data = await apiFetch('/comment-templates');
      setTemplates(data || []);
    } catch (e) {
      /* bỏ qua */
    }
  }
  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addTemplate() {
    const text = tplNew.trim();
    if (!text) return;
    try {
      const t = await apiFetch('/comment-templates', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setTemplates((p) => [t, ...p]);
      setTplNew('');
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }
  async function delTemplate(id: string) {
    try {
      await apiFetch(`/comment-templates/${id}`, { method: 'DELETE' });
      setTemplates((p) => p.filter((t) => t.id !== id));
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  // Gợi ý theo từ đang gõ (cuối cùng)
  const suggestionList = (() => {
    const q = tplQuery.trim().toLowerCase();
    if (!q) return [];
    const lastWord = q.split(/[\s,.;:]+/).pop() || '';
    if (lastWord.length < 2) return [];
    return templates
      .filter((t) => t.text.toLowerCase().includes(lastWord))
      .slice(0, 6);
  })();

  function insertTemplate(text: string) {
    const el = commentRef.current;
    if (el) {
      el.innerHTML = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      setComment(el.innerHTML);
    }
    setTplQuery('');
  }
  const [annotatedImages, setAnnotatedImages] = useState<Record<string, string>>({});
  const annoCanvasRef = useRef<HTMLCanvasElement>(null);
  const annoImgRef = useRef<HTMLImageElement>(null);
  const annoDrawing = useRef(false);
  const annoCurrent = useRef<Stroke | null>(null);

  async function saveAnnotatedImage(originalUrl: string, dataUrl: string) {
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const token = localStorage.getItem('token');
      const up = await fetch('/api/uploads/image', {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', Authorization: `Bearer ${token}` },
        body: blob,
      });
      if (!up.ok) throw new Error('Không tải ảnh đã chấm lên được');
      const { url } = await up.json();
      const map = { ...annotatedImages, [originalUrl]: url };
      setAnnotatedImages(map);
      await apiFetch(
        `/courses/${courseId}/assignments/${assignmentId}/submissions/${submission?.id}/annotations`,
        {
          method: 'POST',
          body: JSON.stringify({
            annotations: {
              strokes,
              essayStrokes: annoStrokes,
              boardSnapshots: tldrawSnapshots,
              pdfBoard,
              annotatedImages: map,
            },
          }),
        },
      );
      showToast('✅ Đã lưu ảnh đã chấm cho học sinh');
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function persistPdfBoard(map: Record<number, any[]>) {
    setPdfBoard(map);
    try {
      await apiFetch(
        `/courses/${courseId}/assignments/${assignmentId}/submissions/${submission?.id}/annotations`,
        {
          method: 'POST',
          body: JSON.stringify({
            annotations: {
              strokes,
              essayStrokes: annoStrokes,
              boardSnapshots: tldrawSnapshots,
              pdfBoard: map,
            },
          }),
        },
      );
      showToast('✅ Đã lưu nét vẽ trên PDF');
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function persistTldraw(imageUrl: string, snapshot: any) {
    setTldrawSnapshots((p) => ({ ...p, [imageUrl]: snapshot }));
    // Lưu ngay về server để không mất nét vẽ
    try {
      await apiFetch(
        `/courses/${courseId}/assignments/${assignmentId}/submissions/${submission?.id}/annotations`,
        {
          method: 'POST',
          body: JSON.stringify({
            annotations: {
              strokes,
              essayStrokes: annoStrokes,
              boardSnapshots: { ...tldrawSnapshots, [imageUrl]: snapshot },
            },
          }),
        },
      );
      showToast('✅ Đã lưu nét vẽ');
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  function annoRedraw() {
    const canvas = annoCanvasRef.current;
    const img = annoImgRef.current;
    if (!canvas || !img || !annoImage) return;
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of annoStrokes[annoImage] || []) {
      if (!s.points.length) continue;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (const p of s.points) ctx.lineTo(p.x, p.y);
      ctx.lineWidth = s.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else if (s.tool === 'highlight') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(250,204,21,0.45)';
        ctx.lineWidth = s.size * 4;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = s.color;
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function annoPos(e: React.PointerEvent) {
    const rect = annoCanvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function annoDown(e: React.PointerEvent) {
    if (!annoImage) return;
    e.preventDefault();
    annoDrawing.current = true;
    annoCurrent.current = {
      tool,
      color,
      size,
      points: [annoPos(e)],
    };
    setAnnoRedo((p) => ({ ...p, [annoImage!]: [] }));
  }

  function annoMove(e: React.PointerEvent) {
    if (!annoDrawing.current || !annoCurrent.current || !annoImage) return;
    annoCurrent.current.points.push(annoPos(e));
    const cur = annoCurrent.current;
    setAnnoStrokes((prev) => {
      const list = [...(prev[annoImage!] || [])];
      const idx = list.indexOf(cur);
      if (idx >= 0) list[idx] = { ...cur, points: [...cur.points] };
      else list.push(cur);
      return { ...prev, [annoImage!]: list };
    });
    requestAnimationFrame(annoRedraw);
  }

  function annoUp() {
    if (annoDrawing.current && annoCurrent.current && annoCurrent.current.points.length > 0) {
      const s = { ...annoCurrent.current, points: [...annoCurrent.current.points] };
      setAnnoStrokes((prev) => ({
        ...prev,
        [annoImage!]: [...(prev[annoImage!] || []).filter((x) => x !== annoCurrent.current), s],
      }));
      annoCurrent.current = null;
    }
    annoDrawing.current = false;
    annoRedraw();
  }

  function annoUndo() {
    if (!annoImage) return;
    setAnnoStrokes((prev) => {
      const list = [...(prev[annoImage] || [])];
      if (!list.length) return prev;
      const last = list.pop()!;
      setAnnoRedo((r) => ({ ...r, [annoImage]: [...(r[annoImage] || []), last] }));
      return { ...prev, [annoImage]: list };
    });
    setTimeout(annoRedraw, 20);
  }

  function annoRedoFn() {
    if (!annoImage) return;
    setAnnoRedo((r) => {
      const list = [...(r[annoImage] || [])];
      if (!list.length) return r;
      const last = list.pop()!;
      setAnnoStrokes((prev) => ({ ...prev, [annoImage]: [...(prev[annoImage] || []), last] }));
      return { ...r, [annoImage]: list };
    });
    setTimeout(annoRedraw, 20);
  }

  function partLabel(i: number) {
    return String.fromCharCode(97 + i); // a, b, c, d...
  }

  function essayTotal(): number {
    let s = 0;
    for (const k of Object.keys(essayScores)) {
      for (const v of essayScores[k]) s += Number(v) || 0;
    }
    return Math.round(s * 100) / 100;
  }

  async function runAi() {
    if (!submission) return;
    setAiBusy(true);
    try {
      await apiFetch(
        `/courses/${courseId}/assignments/${assignmentId}/submissions/${submission.id}/ai-grade`,
        { method: 'POST' },
      );
      showToast('🤖 AI đã chấm các câu tự luận xong');
      load(submission.id);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setAiBusy(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function load(selectedId?: string) {
    try {
      const d = await apiFetch(`/courses/${courseId}/assignments/${assignmentId}`);
      setDetail(d);
      const sid = selectedId || search.get('submission') || d.submissions?.[0]?.id;
      if (sid) await openSubmission(d, sid);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  async function openSubmission(d: any, sid: string) {
    const sub = d.submissions.find((s: any) => s.id === sid);
    setSubmission(sub);
    setScore(sub?.score != null ? String(sub.score) : '');
    setAssessment(sub?.assessment || '');
    setComment(sub?.teacherComment || '');
    setViewMode('images');
    setImgIndex(0);
    // Đặt nội dung khung nhận xét (contentEditable không điều khiển)
    setTimeout(() => {
      if (commentRef.current) commentRef.current.innerHTML = sub?.teacherComment || '';
    }, 0);
    setPublished(!!sub?.published);
    // Nạp nét vẽ đã lưu
    setStrokes([]);
    setRedoStack([]);
    if (sub?.annotations?.strokes) {
      setStrokes(sub.annotations.strokes);
    }
    setTimeout(redraw, 50);

    // Bài nộp từ hệ thống thi online → tải chi tiết bài làm (TN + TL) để chấm
    setExamReview(null);
    setEssayScores({});
    if (sub?.answers?.__fromExam) {
      try {
        const review = await apiFetch(
          `/courses/${courseId}/assignments/${d.id}/submissions/${sub.id}/exam-review`,
        );
        setExamReview(review);
        const stored: Record<string, number[]> = review.essayScores || {};
        const init: Record<string, number[]> = {};
        for (const r of review.results || []) {
          if (r.type === 'ESSAY') {
            init[r.itemId] = stored[r.itemId] && stored[r.itemId].length
              ? stored[r.itemId]
              : [r.aiScore != null && r.aiScore !== '' ? Number(r.aiScore) : 0];
          }
        }
        setEssayScores(init);
      } catch (e: any) {
        showToast('❌ ' + e.message);
      }
    }
    // Nét vẽ trên ảnh tự luận
    setAnnoImage(null);
    setAnnoStrokes((sub?.annotations?.essayStrokes as any) || {});
    setTldrawSnapshots(
      (sub?.annotations?.boardSnapshots as any) || {},
    );
    setPdfBoard((sub?.annotations?.pdfBoard as any) || {});
    setAnnotatedImages((sub?.annotations?.annotatedImages as any) || {});
    setPdfOpen(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function redraw() {
    const canvas = canvasRef.current;
    const img = viewRef.current?.querySelector('img');
    if (!canvas || !img) return;
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) {
      if (!s.points.length) continue;
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (const p of s.points) ctx.lineTo(p.x, p.y);
      ctx.lineWidth = s.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (s.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else if (s.tool === 'highlight') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(250,204,21,0.45)';
        ctx.lineWidth = s.size * 4;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = s.color;
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function pos(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  }

  function onDown(e: React.PointerEvent) {
    if (!submission) return;
    e.preventDefault();
    drawing.current = true;
    const p = pos(e);
    current.current = { tool, color, size, points: [p] };
    setRedoStack([]);
  }

  function onMove(e: React.PointerEvent) {
    if (!drawing.current || !current.current) return;
    current.current.points.push(pos(e));
    setStrokes((prev) => {
      const next = [...prev];
      if (next[next.length - 1] !== current.current) next.push(current.current!);
      else next[next.length - 1] = { ...current.current!, points: [...current.current!.points] };
      return next;
    });
    requestAnimationFrame(redraw);
  }

  function onUp() {
    if (drawing.current && current.current && current.current.points.length > 0) {
      const s = { ...current.current, points: [...current.current.points] };
      setStrokes((prev) => [...prev.filter((x) => x !== current.current), s]);
      setRedoStack([]);
      current.current = null;
    }
    drawing.current = false;
    redraw();
  }

  function undo() {
    setStrokes((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
    setTimeout(redraw, 20);
  }

  function redo() {
    setRedoStack((r) => {
      if (!r.length) return r;
      const last = r[r.length - 1];
      setStrokes((prev) => [...prev, last]);
      return r.slice(0, -1);
    });
    setTimeout(redraw, 20);
  }

  async function save() {
    if (!submission) return;
    setSaving(true);
    try {
      await apiFetch(
        `/courses/${courseId}/assignments/${assignmentId}/submissions/${submission.id}/annotations`,
        {
          method: 'POST',
          body: JSON.stringify({
            annotations: {
              strokes,
              essayStrokes: annoStrokes,
              boardSnapshots: tldrawSnapshots,
              pdfBoard,
            },
          }),
        },
      );
      // Đọc nhận xét (rich text) từ khung contentEditable
      const commentHtml =
        (commentRef.current && commentRef.current.innerHTML) || comment || null;
      await apiFetch(
        `/courses/${courseId}/assignments/${assignmentId}/submissions/${submission.id}/grade`,
        {
          method: 'POST',
          body: JSON.stringify(
            examReview
              ? {
                  essayScores,
                  assessment: assessment || null,
                  teacherComment: commentHtml,
                  published,
                }
              : {
                  score: score === '' ? null : Number(score),
                  assessment: assessment || null,
                  teacherComment: commentHtml,
                  published,
                },
          ),
        },
      );
      showToast('✅ Đã lưu điểm + nét chấm bài');
      load(submission.id);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function requestReturn() {
    if (!submission) return;
    const note = prompt('Ghi chú cho học sinh (tùy chọn):') || undefined;
    try {
      await apiFetch(
        `/courses/${courseId}/assignments/${assignmentId}/submissions/${submission.id}/return`,
        { method: 'POST', body: JSON.stringify({ note }) },
      );
      showToast('🔁 Đã yêu cầu học sinh nộp lại');
      load(submission.id);
    } catch (e: any) {
      showToast('❌ ' + e.message);
    }
  }

  function zoomBy(delta: number) {
    setZoom((z) => Math.min(3, Math.max(0.5, Math.round((z + delta) * 10) / 10)));
    setTimeout(redraw, 30);
  }

  function fullscreen() {
    viewRef.current?.requestFullscreen?.().catch(() => {});
  }

  // Lịch sử các lần nộp/sửa của bài nộp đang chọn
  const [history, setHistory] = useState<{ forId: string; rows: any[] } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // ===== Phím tắt chấm bài cho giáo viên =====
  const [showKeys, setShowKeys] = useState(false);
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = save;
  const openRef = useRef<(d: any, sid: string) => void>(() => {});
  openRef.current = openSubmission;

  useEffect(() => {
    function isTyping(el: any) {
      if (!el) return false;
      const tag = String(el.tagName || '').toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || !!el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (!detail || !detail.submissions?.length) return;
      if (isTyping(document.activeElement)) return;
      const subs: any[] = detail.submissions;
      const idx = subs.findIndex((s: any) => s.id === submission?.id);

      // Cmd/Ctrl + Enter → Lưu điểm
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveRef.current();
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setShowKeys((v) => !v);
        return;
      }
      if (e.key === 'j' || e.key === 'ArrowDown') {
        const n = subs[Math.min(subs.length - 1, idx + 1)];
        if (n && n.id !== submission?.id) {
          e.preventDefault();
          openRef.current(detail, n.id);
        }
        return;
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        const p = subs[Math.max(0, idx - 1)];
        if (p && p.id !== submission?.id) {
          e.preventDefault();
          openRef.current(detail, p.id);
        }
        return;
      }
      // 1..9 → điểm 1..9 ; 0 → 10
      if (/^[0-9]$/.test(e.key)) {
        setScore(e.key === '0' ? '10' : e.key);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, submission]);

  async function loadHistory() {
    if (!submission?.id) return;
    try {
      const rows = await apiFetch(
        `/courses/${courseId}/assignments/${assignmentId}/submissions/${submission.id}/history`,
      );
      setHistory({ forId: submission.id, rows: Array.isArray(rows) ? rows : [] });
      setShowHistory(true);
    } catch (e: any) {
      alert(e.message);
    }
  }

  const images = submission?.imageUrls || [];
  const firstImage = images[0] || submission?.pdfUrl ? null : null;
  // Lịch sử của ĐÚNG bài nộp đang chọn (null nếu chưa tải / khác bài)
  const histRows: any[] | null =
    history && submission?.id && history.forId === submission.id ? history.rows : null;

  return (    <div className="page-container" style={{ maxWidth: 1300 }}>
      {toast && <div className="toast" style={{ position: 'fixed', top: 20, right: 20, zIndex: 60 }}>{toast}</div>}

      {/* Gợi ý phím tắt chấm bài */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          type="button"
          className="lm-filter-btn"
          style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700 }}
          onClick={() => setShowKeys((v) => !v)}
          title="Xem phím tắt chấm bài"
        >
          ⌨️ Phím tắt {showKeys ? '▲' : '▼'}
        </button>
      </div>
      {showKeys && (
        <div
          className="card"
          style={{ padding: '10px 14px', marginBottom: 12, fontSize: 12.5, lineHeight: 1.9, color: 'var(--color-muted)' }}
        >
          <b style={{ color: 'var(--color-ink)' }}>Phím tắt chấm bài:</b>{' '}
          <kbd>J</kbd> / <kbd>↓</kbd> bài kế tiếp · <kbd>K</kbd> / <kbd>↑</kbd> bài trước ·{' '}
          <kbd>1</kbd>–<kbd>9</kbd> nhập điểm nhanh (<kbd>0</kbd> = 10) ·{' '}
          <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> lưu điểm · <kbd>?</kbd> ẩn/hiện gợi ý
        </div>
      )}
      <div className="lm-band">
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>
            <BackButton to={`/teacher/courses/${courseId}/assignments`} label="Về giao bài tập" />
            🖊 Chấm bài — {detail?.title || '…'}
          </h2>
          <p className="lm-band-sub">
            {submission?.student?.fullName || 'Chọn bài nộp bên phải'}
          </p>
        </div>
        {detail?.postManually && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
              {detail.gradesPosted ? '✅ Đã công bố' : detail.postAt ? '⏰ Hẹn công bố' : '🔒 Chưa công bố'}
            </span>
            <input
              type="datetime-local"
              defaultValue={detail.postAt ? String(detail.postAt).slice(0, 16) : ''}
              onChange={async (e) => {
                try {
                  await apiFetch(
                    `/courses/${courseId}/assignments/${assignmentId}/post-grades`,
                    {
                      method: 'POST',
                      body: JSON.stringify({ postAt: e.target.value ? new Date(e.target.value).toISOString() : null }),
                    },
                  );
                  showToast(e.target.value ? '✅ Đã đặt hẹn giờ công bố' : '✅ Đã bỏ hẹn giờ');
                } catch (err: any) {
                  showToast('❌ ' + err.message);
                }
              }}
              style={{ padding: '5px 8px', borderRadius: 8, border: 'none', fontSize: 12 }}
              title="Hẹn giờ tự công bố điểm"
            />
            <button
              className={detail.gradesPosted ? 'btn-lm ghost' : 'btn-lm amber'}
              style={{ width: 'auto', padding: '8px 16px', fontSize: 13, fontWeight: 800 }}
              onClick={async () => {
                try {
                  const r = await apiFetch(
                    `/courses/${courseId}/assignments/${assignmentId}/post-grades`,
                    { method: 'POST', body: JSON.stringify({ posted: !detail.gradesPosted }) },
                  );
                  showToast(detail.gradesPosted ? '🔒 Đã ẩn điểm khỏi học sinh' : `📢 Đã công bố điểm cho ${r.notified} học sinh`);
                  load(submission?.id);
                } catch (err: any) {
                  showToast('❌ ' + err.message);
                }
              }}
            >
              {detail.gradesPosted ? '🔒 Ẩn điểm' : '📢 Công bố điểm'}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, alignItems: 'start', marginTop: 20 }}>
        {/* ===== TRÌNH XEM BÀI LÀM + VẼ ===== */}
        <div>
          <div className="card" style={{ padding: 10 }}>
            {/* ===== XEM BÀI LÀM ĐỀ THI (trắc nghiệm + tự luận) ===== */}
            {examReview && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span className="badge badge-accent">📝 Trắc nghiệm: {examReview.mcqScore}đ</span>
                  <span className="badge badge-warning">✍️ Tự luận (thủ công): {essayTotal()}đ / {examReview.essayMaxScore}đ</span>
                  <span className="badge badge-success">Tổng: {Math.round((examReview.mcqScore + essayTotal()) * 100) / 100}đ / {examReview.totalScore}đ</span>
                  <span className="badge">Hệ thống: {examReview.attemptScore}đ</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {examReview.results.map((r: any, i: number) => (
                    <div
                      key={r.itemId}
                      style={{
                        padding: 12,
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-rule)',
                        borderRadius: 10,
                        borderLeft: r.type === 'ESSAY' ? '3px solid var(--lm-amber)' : r.correct === false ? '3px solid var(--color-danger)' : '3px solid var(--color-success)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="q-type-badge" style={{ fontSize: 10.5 }}>
                            {r.type === 'MCQ' ? 'Trắc nghiệm' : r.type === 'TRUE_FALSE' ? 'Đúng/Sai' : r.type === 'SHORT_ANSWER' ? 'Đáp án ngắn' : 'Tự luận'}
                          </span>
                          {r.code && (
                            <span
                              className="mono"
                              style={{ fontSize: 10.5, color: 'var(--color-muted)' }}
                              title="Mã câu hỏi — dùng để đối chiếu khi học sinh khiếu nại"
                            >
                              #{r.code}
                            </span>
                          )}
                        </span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                          {r.type === 'ESSAY' ? `${r.maxScore} điểm` : `${r.earned}/${r.maxScore ?? ''} điểm`}
                        </span>
                      </div>
                      <div style={{ fontSize: 13.5, marginBottom: 6 }}>
                        <b>Câu {i + 1}.</b> <LatexRenderer content={r.content} />
                      </div>

                      {r.type === 'ESSAY' ? (
                        <>
                          <div style={{ padding: 8, background: 'var(--color-paper-2)', borderRadius: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                            {r.studentText || <span style={{ color: 'var(--color-muted)' }}>(học sinh không gõ chữ)</span>}
                          </div>
                          {r.images?.length > 0 && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                              {r.images.map((u: string, j: number) => (
                                <div key={j} style={{ position: 'relative', cursor: 'pointer' }} title="Bấm để chấm trực tiếp trên ảnh" onClick={() => { setAnnoImage(u); setTimeout(annoRedraw, 50); }}>
                                  <img src={annotatedImages[u] || u} alt="" style={{ width: 110, height: 110, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-rule)' }} />
                                  {annotatedImages[u] && (
                                    <span style={{ position: 'absolute', top: 4, left: 4, background: 'var(--color-success)', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 8 }}>
                                      ✓ đã chấm
                                    </span>
                                  )}
                                  {(annoStrokes[u] || []).length > 0 && (
                                    <span style={{ position: 'absolute', top: 4, right: 4, background: 'var(--color-danger)', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 8 }}>
                                      ✏️ {(annoStrokes[u] || []).length}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {r.aiScore != null && (
                            <div style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 6 }}>
                              🤖 AI gợi ý: {r.aiScore}đ {r.aiFeedback ? `— ${String(r.aiFeedback).slice(0, 120)}` : ''}
                            </div>
                          )}
                          {/* Chấm điểm từng phần (a, b, c...) */}
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--lm-maroon)', marginBottom: 6 }}>
                              ✍️ Chấm từng phần (tối đa {r.maxScore}đ):
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {(essayScores[r.itemId] || [0]).map((v: number, pi: number) => (
                                <div key={pi} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span style={{ fontWeight: 800, fontSize: 12.5, minWidth: 52 }}>
                                    Phần {partLabel(pi)})
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.25}
                                    value={v}
                                    onChange={(e) =>
                                      setEssayScores((p) => ({
                                        ...p,
                                        [r.itemId]: (p[r.itemId] || [0]).map((x, j) => (j === pi ? e.target.value : x)),
                                      }))
                                    }
                                    style={{ width: 90, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-rule)', fontSize: 13 }}
                                    placeholder="điểm"
                                  />
                                  {(essayScores[r.itemId] || [0]).length > 1 && (
                                    <button
                                      type="button"
                                      className="lm-filter-btn"
                                      style={{ padding: '3px 8px', fontSize: 11, color: 'var(--color-danger)' }}
                                      onClick={() =>
                                        setEssayScores((p) => ({
                                          ...p,
                                          [r.itemId]: (p[r.itemId] || [0]).filter((_, j) => j !== pi),
                                        }))
                                      }
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                type="button"
                                className="lm-filter-btn"
                                style={{ width: 'auto', padding: '4px 12px', fontSize: 12 }}
                                onClick={() =>
                                  setEssayScores((p) => ({
                                    ...p,
                                    [r.itemId]: [...(p[r.itemId] || [0]), 0],
                                  }))
                                }
                              >
                                ＋ Thêm phần ({partLabel((essayScores[r.itemId] || [0]).length)})
                              </button>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 12.5 }}>
                          {/* MCQ — hiện TOÀN BỘ phương án, tô màu lựa chọn của HS */}
                          {r.type === 'MCQ' && Array.isArray(r.options) && r.options.length > 0 && (
                            <div style={{ margin: '4px 0 8px' }}>
                              <div
                                style={{
                                  marginBottom: 6,
                                  fontWeight: 800,
                                  fontSize: 12.5,
                                  color: r.correct ? 'var(--color-success)' : 'var(--color-danger)',
                                }}
                              >
                                {r.correct ? '✅ HS chọn đúng' : '❌ HS chọn sai'}
                                {' — '}
                                <span style={{ fontWeight: 700 }}>
                                  HS chọn:{' '}
                                  <span className="mono">
                                    {formatAnswer(r.studentAnswer) || 'bỏ trống'}
                                  </span>
                                </span>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {r.options.map((opt: any) => {
                                  const norm = (v: any) =>
                                    String(v ?? '')
                                      .replace(/[^a-zA-Z0-9]/g, '')
                                      .toLowerCase();
                                  const chosen = norm(r.studentAnswer) !== '' && norm(r.studentAnswer) === norm(opt.id);
                                  const isCorrect = norm(r.correctAnswer) !== '' && norm(r.correctAnswer) === norm(opt.id);
                                  const good = chosen && isCorrect;
                                  const bad = chosen && !isCorrect;
                                  return (
                                    <div
                                      key={opt.id}
                                      style={{
                                        display: 'flex',
                                        gap: 8,
                                        alignItems: 'flex-start',
                                        padding: '6px 10px',
                                        borderRadius: 8,
                                        background: good
                                          ? 'color-mix(in oklch, var(--color-success) 16%, var(--color-paper))'
                                          : bad
                                            ? 'color-mix(in oklch, var(--color-danger) 14%, var(--color-paper))'
                                            : isCorrect
                                              ? 'color-mix(in oklch, var(--color-success) 8%, var(--color-paper))'
                                              : 'transparent',
                                        border: `1.5px solid ${
                                          good || isCorrect
                                            ? 'var(--color-success)'
                                            : bad
                                              ? 'var(--color-danger)'
                                              : 'transparent'
                                        }`,
                                      }}
                                    >
                                      <span
                                        className="stt-badge"
                                        style={{
                                          background:
                                            good || isCorrect
                                              ? 'var(--color-success)'
                                              : bad
                                                ? 'var(--color-danger)'
                                                : undefined,
                                          color: good || isCorrect || bad ? '#fff' : undefined,
                                          borderColor:
                                            good || isCorrect
                                              ? 'var(--color-success)'
                                              : bad
                                                ? 'var(--color-danger)'
                                                : undefined,
                                        }}
                                      >
                                        {String(opt.id).toLowerCase()}
                                      </span>
                                      <span
                                        style={{
                                          flex: 1,
                                          minWidth: 0,
                                          fontWeight: good || isCorrect ? 700 : undefined,
                                        }}
                                      >
                                        <LatexRenderer content={opt.text} />
                                      </span>
                                      {chosen && isCorrect && (
                                        <span style={{ color: 'var(--color-success)', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                          ✓ Đã chọn
                                        </span>
                                      )}
                                      {chosen && !isCorrect && (
                                        <span style={{ color: 'var(--color-danger)', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                          ✗ Đã chọn
                                        </span>
                                      )}
                                      {!chosen && isCorrect && (
                                        <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: 11.5, whiteSpace: 'nowrap' }}>
                                          Đáp án đúng
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* TRUE_FALSE — bảng từng mệnh đề, tô màu lựa chọn của HS */}
                          {r.type === 'TRUE_FALSE' && Array.isArray(r.options) && r.options.length > 0 && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '4px 0 8px', fontSize: 12.5 }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9' }}>
                                  <th style={{ padding: '6px 8px', textAlign: 'left' }}>Mệnh đề</th>
                                  <th style={{ padding: '6px 8px', width: 72 }}>HS chọn</th>
                                  <th style={{ padding: '6px 8px', width: 72 }}>Đáp án</th>
                                  <th style={{ padding: '6px 8px', width: 52 }}>KQ</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.options.map((opt: any) => {
                                  const picked = r.studentAnswer?.[opt.id];
                                  const right = r.correctAnswer?.[opt.id] === true;
                                  const ok = picked !== undefined && picked === right;
                                  return (
                                    <tr
                                      key={opt.id}
                                      style={{
                                        borderTop: '1px solid #e2e8f0',
                                        background: ok
                                          ? 'color-mix(in oklch, var(--color-success) 8%, transparent)'
                                          : picked !== undefined
                                            ? 'color-mix(in oklch, var(--color-danger) 8%, transparent)'
                                            : undefined,
                                      }}
                                    >
                                      <td style={{ padding: '6px 8px' }}>
                                        <strong>{String(opt.id).toUpperCase()}.</strong>{' '}
                                        <LatexRenderer content={opt.text} />
                                      </td>
                                      <td
                                        style={{
                                          padding: '6px 8px',
                                          textAlign: 'center',
                                          fontWeight: 800,
                                          color:
                                            picked === undefined
                                              ? 'var(--color-muted)'
                                              : ok
                                                ? 'var(--color-success)'
                                                : 'var(--color-danger)',
                                        }}
                                      >
                                        {picked === undefined ? '—' : picked ? 'Đ' : 'S'}
                                      </td>
                                      <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>
                                        {right ? 'Đ' : 'S'}
                                      </td>
                                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>{ok ? '✅' : '❌'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}

                          {/* Câu trả lời ngắn: so đáp án */}
                          {r.type === 'SHORT_ANSWER' && (
                            <div style={{ marginBottom: 6 }}>
                              <span>
                                {r.correct ? '✅ Đúng' : '❌ Sai'} · HS trả lời:{' '}
                                <b className="mono">{formatAnswer(r.studentAnswer) || '—'}</b>
                              </span>
                              <span style={{ color: 'var(--color-muted)', marginLeft: 8 }}>
                                · Đáp án: <b className="mono">{formatAnswer(r.correctAnswer) || '—'}</b>
                              </span>
                            </div>
                          )}

                          {r.type === 'TRUE_FALSE' && r.tfDetail && (
                            <div style={{ color: 'var(--color-muted)', marginBottom: 4 }}>
                              Đúng {r.tfDetail.correctCount}/{r.tfDetail.total} ý · Điểm bậc thang {r.earned}/{r.maxScore}
                            </div>
                          )}

                          {r.solution && (
                            <div style={{ color: 'var(--color-muted)' }}>
                              💡 <LatexRenderer content={r.solution} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ===== TRÌNH XEM + CHẤM BÀI LÀM (ảnh hoặc PDF) ===== */}
            {(() => {
              const imgs: string[] = submission?.imageUrls || [];
              const hasPdf = !!submission?.pdfUrl;
              const both = imgs.length > 0 && hasPdf;
              // Tab Ảnh / PDF khi học sinh nộp cả hai
              const tab: 'images' | 'pdf' = !hasPdf ? 'images' : imgs.length === 0 ? 'pdf' : viewMode;
              if (both) {
                const cur = imgs[Math.min(imgIndex, imgs.length - 1)];
                return (
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <button
                        className={`lm-filter-btn${tab === 'images' ? ' on' : ''}`}
                        style={{ padding: '6px 16px', fontSize: 13, fontWeight: 800 }}
                        onClick={() => setViewMode('images')}
                      >
                        🖼 Ảnh bài làm ({imgs.length})
                      </button>
                      <button
                        className={`lm-filter-btn${tab === 'pdf' ? ' on' : ''}`}
                        style={{ padding: '6px 16px', fontSize: 13, fontWeight: 800 }}
                        onClick={() => {
                          setViewMode('pdf');
                          setPdfOpen(true); // mở ngay trình chấm PDF
                        }}
                      >
                        📄 PDF bài làm
                      </button>
                    </div>
                    {tab === 'images' ? (
                      <div>
                        {imgs.length > 1 && (
                          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#ddd' }}>Ảnh:</span>
                            {imgs.map((u, i) => (
                              <button
                                key={i}
                                className={`lm-filter-btn${imgIndex === i ? ' on' : ''}`}
                                style={{ padding: '4px 10px', fontSize: 12 }}
                                onClick={() => setImgIndex(i)}
                              >
                                Ảnh {i + 1}
                                {(tldrawSnapshots[u] || []).length > 0 ? ' ✏️' : ''}
                              </button>
                            ))}
                          </div>
                        )}
                        <AnnotateBoard
                          inline
                          backgroundUrl={cur}
                          snapshot={tldrawSnapshots[cur]}
                          onSave={(els) => persistTldraw(cur, els)}
                        />
                      </div>
                    ) : (
                      <div style={{ padding: 24, textAlign: 'center', background: '#26292f', borderRadius: 10 }}>
                        <p style={{ color: '#ddd', marginBottom: 12, fontSize: 13.5 }}>
                          📄 Bài nộp kèm PDF — bấm để mở trình chấm PDF (vẽ trên từng trang)
                        </p>
                        <button
                          className="btn-lm amber"
                          style={{ width: 'auto', padding: '9px 22px', fontSize: 13.5, fontWeight: 800 }}
                          onClick={() => setPdfOpen(true)}
                        >
                          🖊 Mở PDF để chấm (bút, highlight, tẩy…)
                        </button>
                      </div>
                    )}
                  </div>
                );
              }
              const cur = imgs.length ? imgs[Math.min(imgIndex, imgs.length - 1)] : null;
              if (cur) {
                return (
                  <div>
                    {imgs.length > 1 && (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#ddd' }}>Ảnh:</span>
                        {imgs.map((u, i) => (
                          <button
                            key={i}
                            className={`lm-filter-btn${imgIndex === i ? ' on' : ''}`}
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => setImgIndex(i)}
                          >
                            Ảnh {i + 1}
                            {(tldrawSnapshots[u] || []).length > 0 ? ' ✏️' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                    <AnnotateBoard
                      inline
                      backgroundUrl={cur}
                      snapshot={tldrawSnapshots[cur]}
                      onSave={(els) => persistTldraw(cur, els)}
                    />
                  </div>
                );
              }
              if (hasPdf) {
                return (
                  <div style={{ padding: 24, textAlign: 'center', background: '#26292f', borderRadius: 10 }}>
                    <p style={{ color: '#ddd', marginBottom: 12, fontSize: 13.5 }}>
                      📄 Bài nộp là PDF — mở trình chấm PDF để vẽ trên từng trang
                    </p>
                    <button
                      className="btn-lm amber"
                      style={{ width: 'auto', padding: '9px 22px', fontSize: 13.5, fontWeight: 800 }}
                      onClick={() => setPdfOpen(true)}
                    >
                      🖊 Mở PDF để chấm (bút, highlight, tẩy…)
                    </button>
                  </div>
                );
              }
              return (
                <div style={{ padding: 20, color: '#999', textAlign: 'center' }}>
                  Bài nộp không có ảnh hoặc PDF.
                </div>
              );
            })()}
            {submission?.content && (
              <div style={{ marginTop: 10, padding: 10, background: 'var(--color-paper-2)', borderRadius: 8, fontSize: 13.5, whiteSpace: 'pre-wrap' }}>
                {submission.content}
              </div>
            )}

            {/* ===== LỊCH SỬ NỘP BÀI (đối chiếu các lần sửa) ===== */}
            {submission?.id && (
              <div style={{ marginTop: 14, borderTop: '1px dashed var(--color-rule)', paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="lm-filter-btn"
                    style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 700 }}
                    onClick={() => (showHistory && histRows ? setShowHistory(false) : loadHistory())}
                  >
                    📜 Lịch sử nộp bài
                    {histRows ? ` (${histRows.length})` : ''}
                  </button>
                  {histRows && (
                    <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                      {histRows.length} lần nộp
                      {histRows.length > 1 ? ` · đã sửa ${histRows.length - 1} lần` : ''}
                    </span>
                  )}
                </div>

                {showHistory && histRows && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {histRows.length === 0 ? (
                      <p style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
                        Chưa có lịch sử (bài nộp trước khi bật tính năng này).
                      </p>
                    ) : (
                      histRows.map((h: any) => (
                        <div
                          key={h.id}
                          style={{
                            border: '1px solid var(--color-rule)',
                            borderRadius: 10,
                            padding: 10,
                            background: 'var(--color-surface)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                            <b style={{ fontSize: 12.5, color: 'var(--lm-maroon)' }}>
                              Lần {h.version}
                              {h.version === 1 ? ' (nộp đầu)' : ' (sửa)'}
                            </b>
                            <span style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                              {h.submittedAt ? new Date(h.submittedAt).toLocaleString('vi-VN') : ''}
                            </span>
                          </div>
                          {h.content && (
                            <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', background: 'var(--color-paper-2)', borderRadius: 6, padding: 8, marginBottom: 6 }}>
                              {h.content}
                            </div>
                          )}
                          {Array.isArray(h.imageUrls) && h.imageUrls.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {h.imageUrls.map((u: string, k: number) => (
                                <a key={k} href={u} target="_blank" rel="noreferrer" title={`Trang ${k + 1}`}>
                                  <img
                                    src={u}
                                    alt={`Trang ${k + 1}`}
                                    style={{ width: 74, height: 74, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--color-rule)' }}
                                  />
                                </a>
                              ))}
                            </div>
                          )}
                          {h.pdfUrl && (
                            <a href={h.pdfUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--color-accent)' }}>
                              📄 PDF đính kèm
                            </a>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ===== PANEL CHẤM ===== */}
        <div className="card" style={{ padding: 16, position: 'sticky', top: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>🧑‍🎓 Học sinh</div>
          {detail?.submissions?.length ? (
            <select
              value={submission?.id || ''}
              onChange={(e) => openSubmission(detail, e.target.value)}
              style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid var(--color-rule)', fontSize: 13, marginBottom: 12 }}
            >
              {detail.submissions.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.student?.fullName} {s.score != null ? `(${s.score}đ)` : ''} {s.published ? '✓' : ''}
                </option>
              ))}
            </select>
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>Chưa có bài nộp nào.</p>
          )}

          {submission && (
            <>
              {examReview ? (
                <div style={{ padding: 12, borderRadius: 10, background: 'var(--color-paper-2)', marginBottom: 12 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--color-warning)', marginBottom: 6 }}>
                    📊 Điểm đề thi ({examReview.totalScore}đ)
                  </div>
                  <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>📝 Trắc nghiệm (tự động): <b className="mono">{examReview.mcqScore}đ</b></span>
                    <span>✍️ Tự luận (bạn chấm): <b className="mono">{essayTotal()}đ</b> / {examReview.essayMaxScore}đ</span>
                    <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--lm-maroon)' }}>
                      Tổng: {Math.round((examReview.mcqScore + essayTotal()) * 100) / 100}đ
                    </span>
                    {(submission?.penaltyPoints || 0) > 0 && (
                      <span style={{ color: 'var(--color-danger)', fontSize: 12.5 }}>
                        ⏰ Phạt nộp muộn: −{submission.penaltyPoints}đ
                        {submission.score != null && submission.score !== Math.round((examReview.mcqScore + essayTotal()) * 100) / 100 && (
                          <> → điểm sau phạt: <b className="mono">{submission.score}đ</b></>
                        )}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} title="Cộng/trừ điểm tay cho bài này (điểm cuối = điểm chấm + nới − phạt)">
                      ✋ Nới điểm:
                      <input
                        type="number"
                        step={0.25}
                        value={examReview.fudgePoints ?? 0}
                        onChange={async (e) => {
                          const f = Number(e.target.value);
                          setExamReview((er: any) => ({ ...er, fudgePoints: f }));
                          try {
                            const r = await apiFetch(
                              `/exams/${detail?.examId}/attempts/${examReview.attemptId}/fudge`,
                              { method: 'PATCH', body: JSON.stringify({ fudgePoints: f }) },
                            );
                            showToast(`✅ Điểm sau nới: ${r.score}đ`);
                            await load(submission?.id);
                          } catch (err: any) {
                            showToast('❌ ' + err.message);
                          }
                        }}
                        style={{ width: 64, padding: 4, borderRadius: 6, border: '1px solid var(--color-rule)' }}
                      />
                    </label>
                    <button
                      className="lm-filter-btn"
                      title="Chấm lại riêng bài làm đang mở, theo đáp án hiện tại của đề"
                      style={{ padding: '5px 12px', fontSize: 12.5, fontWeight: 700 }}
                      onClick={async () => {
                        if (!confirm('Chấm lại bài làm đang mở? Nếu điểm thay đổi, học sinh sẽ được thông báo.')) return;
                        try {
                          const r = await apiFetch(
                            `/exams/${detail?.examId}/attempts/${examReview.attemptId}/regrade`,
                            { method: 'POST' },
                          );
                          showToast(r.changed ? `↻ Điểm mới: ${r.score}đ (cũ ${r.oldScore}đ)` : '✅ Chấm lại xong — điểm không đổi');
                          load(submission?.id);
                        } catch (err: any) {
                          showToast('❌ ' + err.message);
                        }
                      }}
                    >
                      ↻ Chấm lại bài này
                    </button>
                    <button
                      className="lm-filter-btn"
                      title="Chấm lại mọi bài nộp CỦA BÀI TẬP NÀY (chỉ học sinh trong khóa học đã nộp bài tập này)"
                      style={{ padding: '5px 12px', fontSize: 12.5, fontWeight: 700 }}
                      onClick={async () => {
                        if (!confirm('Chấm lại TẤT CẢ bài đã nộp của bài tập này? Học sinh bị đổi điểm sẽ được thông báo.')) return;
                        try {
                          const r = await apiFetch(
                            `/courses/${courseId}/assignments/${assignmentId}/regrade`,
                            { method: 'POST' },
                          );
                          showToast(
                            r.message ||
                              `↻ Đã chấm lại ${r.total} bài — ${r.changed} bài đổi điểm`,
                          );
                          load(submission?.id);
                        } catch (err: any) {
                          showToast('❌ ' + err.message);
                        }
                      }}
                    >
                      ↻ Chấm lại cả bài tập
                    </button>
                    <button
                      className="lm-filter-btn"
                      title="Chấm lại MỌI bài đã nộp của đề thi này — kể cả các lớp khác đang dùng cùng đề"
                      style={{ padding: '5px 12px', fontSize: 12.5, fontWeight: 700 }}
                      onClick={async () => {
                        if (!confirm('Chấm lại MỌI bài đã nộp của đề thi này (kể cả lớp khác)? Học sinh bị đổi điểm sẽ được thông báo.')) return;
                        try {
                          const r = await apiFetch(`/exams/${detail?.examId}/regrade-all`, { method: 'POST' });
                          showToast(`↻ Đã chấm lại ${r.total} bài — ${r.changed} bài đổi điểm`);
                          load(submission?.id);
                        } catch (err: any) {
                          showToast('❌ ' + err.message);
                        }
                      }}
                    >
                      ↻ Chấm lại toàn bộ đề
                    </button>
                  </div>
                </div>
              ) : (
              <div className="form-group">
                <label>Điểm</label>
                <input type="number" min={0} step={0.25} value={score} onChange={(e) => setScore(e.target.value)} placeholder="VD: 8.5" style={{ fontSize: 18, fontWeight: 800 }} />
              </div>
              )}

              <div className="form-group">
                <label>Đánh giá nhanh</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    ['Đ', 'Đạt'],
                    ['CĐ', 'Chưa đạt'],
                    ['HT', 'Hoàn thành'],
                    ['CHT', 'Chưa hoàn thành'],
                    ['HTT', 'Hoàn thành tốt'],
                  ].map(([code, title]) => (
                    <button
                      key={code}
                      type="button"
                      title={title}
                      className="lm-filter-btn"
                      style={{
                        padding: '6px 10px',
                        fontSize: 12.5,
                        fontWeight: 800,
                        background: assessment === code ? 'var(--lm-amber)' : undefined,
                        color: assessment === code ? '#fff' : undefined,
                      }}
                      onClick={() => setAssessment(assessment === code ? '' : code)}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Nhận xét (học sinh chỉ thấy sau khi chốt)</label>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="lm-filter-btn" style={{ padding: '3px 9px', fontSize: 12, fontWeight: 800 }} onMouseDown={(e) => { e.preventDefault(); document.execCommand('bold'); }}>B</button>
                  <button type="button" className="lm-filter-btn" style={{ padding: '3px 9px', fontSize: 12, fontStyle: 'italic' }} onMouseDown={(e) => { e.preventDefault(); document.execCommand('italic'); }}>I</button>
                  <button type="button" className="lm-filter-btn" style={{ padding: '3px 9px', fontSize: 12, textDecoration: 'underline' }} onMouseDown={(e) => { e.preventDefault(); document.execCommand('underline'); }}>U</button>
                  <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                    Màu chữ
                    <input
                      type="color"
                      defaultValue="#e11d48"
                      style={{ width: 26, height: 22, border: 'none', background: 'none' }}
                      onChange={(e) => document.execCommand('foreColor', false, e.target.value)}
                    />
                  </label>
                  <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Cỡ
                    <select
                      defaultValue={3}
                      style={{ padding: '2px 4px', borderRadius: 6, fontSize: 12 }}
                      onChange={(e) => document.execCommand('fontSize', false, e.target.value)}
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="lm-filter-btn"
                    style={{ padding: '3px 10px', fontSize: 12, fontWeight: 700 }}
                    onClick={() => setTplOpen(!tplOpen)}
                  >
                    ⭐ Ngân hàng nhận xét ({templates.length})
                  </button>
                </div>
                {/* Gợi ý nhận xét khi đang gõ */}
                {suggestionList.length > 0 && (
                  <div style={{ marginBottom: 6, border: '1px solid var(--color-rule)', borderRadius: 8, overflow: 'hidden', background: 'var(--color-surface)' }}>
                    {suggestionList.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => insertTemplate(t.text)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '7px 12px',
                          border: 'none',
                          borderBottom: '1px solid #f1f5f9',
                          background: 'var(--color-surface)',
                          cursor: 'pointer',
                          fontSize: 12.5,
                        }}
                      >
                        💬 {t.text}
                      </button>
                    ))}
                  </div>
                )}
                {/* Quản lý ngân hàng nhận xét */}
                {tplOpen && (
                  <div style={{ marginBottom: 8, padding: 10, border: '1px dashed var(--color-rule)', borderRadius: 8, background: 'var(--color-paper-2)' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      <input
                        value={tplNew}
                        onChange={(e) => setTplNew(e.target.value)}
                        placeholder='Thêm câu nhận xét mới (VD: "Sai dấu khi bình phương")'
                        style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid var(--color-rule)', fontSize: 12.5 }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addTemplate();
                          }
                        }}
                      />
                      <button type="button" className="lm-filter-btn" style={{ padding: '4px 12px', fontSize: 12 }} onClick={addTemplate}>
                        ＋ Thêm
                      </button>
                    </div>
                    <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                      {templates.length === 0 ? (
                        <p style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
                          Chưa có câu nhận xét nào — thêm câu đầu tiên để dùng lại nhanh khi chấm bài.
                        </p>
                      ) : (
                        templates.map((t) => (
                          <div key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                            <button
                              type="button"
                              onClick={() => insertTemplate(t.text)}
                              style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'inherit' }}
                            >
                              💬 {t.text}
                            </button>
                            <button type="button" onClick={() => delTemplate(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }} title="Xóa">
                              🗑
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
                <div
                  ref={commentRef}
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => setComment((e.currentTarget as HTMLElement).innerHTML)}
                  onInput={(e) => setTplQuery((e.currentTarget as HTMLElement).textContent || '')}
                  style={{
                    minHeight: 96,
                    padding: 8,
                    borderRadius: 8,
                    border: '1px solid var(--color-rule)',
                    fontSize: 13.5,
                    background: 'var(--color-surface)',
                    lineHeight: 1.6,
                  }}
                />
              </div>

              {submission.aiScore != null && (
                <div style={{ padding: 10, borderRadius: 8, background: 'var(--color-paper-2)', fontSize: 12.5, marginBottom: 12 }}>
                  <div style={{ fontWeight: 800, color: 'var(--color-warning)', marginBottom: 4 }}>🤖 AI chấm thô: {submission.aiScore}đ</div>
                  {submission.aiFeedback && (
                    <div style={{ color: '#7a5a1a', whiteSpace: 'pre-wrap' }}>{String(submission.aiFeedback).slice(0, 300)}</div>
                  )}
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} style={{ width: 'auto' }} />
                ✅ Hiển thị điểm (chốt — học sinh sẽ nhận kết quả + thông báo)
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn" style={{ width: '100%' }} disabled={saving} onClick={save}>
                  {saving ? '⏳ Đang lưu…' : '💾 Lưu dữ liệu'}
                </button>
                <button className="btn" style={{ width: '100%', background: 'var(--lm-maroon)', color: '#fff' }} disabled={aiBusy} onClick={runAi}>
                  {aiBusy ? '⏳ AI đang chấm tự luận…' : '🤖 Chấm bằng AI (câu tự luận)'}
                </button>
                <button className="btn btn-outline" style={{ width: '100%', color: '#b45309', borderColor: '#f0b355' }} onClick={requestReturn}>
                  🔁 Yêu cầu nộp lại
                </button>
                <Link href={`/teacher/courses/${courseId}/assignments`} className="btn btn-outline" style={{ width: '100%', textDecoration: 'none' }}>
                  ← Quay lại
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== MODAL VẼ LÊN PDF ===== */}
      {pdfOpen && submission?.pdfUrl && (
        <PdfAnnotator
          pdfUrl={submission.pdfUrl}
          snapshot={pdfBoard}
          onSave={(map) => persistPdfBoard(map)}
          onClose={() => setPdfOpen(false)}
        />
      )}

      {/* ===== MODAL CHẤM TRỰC TIẾP TRÊN ẢNH TỰ LUẬN ===== */}
      {annoImage && useTldraw && (
        <AnnotateBoard
          backgroundUrl={annoImage}
          snapshot={tldrawSnapshots[annoImage]}
          onSave={(els) => persistTldraw(annoImage, els)}
          onClose={() => setAnnoImage(null)}
        />
      )}
      {annoImage && !useTldraw && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(20,16,12,0.82)', zIndex: 90, display: 'flex', flexDirection: 'column', padding: 18 }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            {([
              ['pen', '✏️ Bút'],
              ['eraser', '🧽 Tẩy'],
              ['highlight', '🖍 Highlight'],
            ] as const).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: tool === t ? 'var(--lm-amber)' : '#fff',
                  color: tool === t ? '#fff' : '#1c1917',
                }}
              >
                {label}
              </button>
            ))}
            <label style={{ fontSize: 12, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
              Màu
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 30, height: 24, border: 'none', background: 'none' }} />
            </label>
            <label style={{ fontSize: 12, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
              Cỡ
              <input type="range" min={1} max={12} value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ width: 70 }} />
            </label>
            <span style={{ flex: 1 }} />
            <button
              onClick={() => setUseTldraw(true)}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--color-surface)', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
              title="Chuyển sang bảng vẽ tldraw (nhiều công cụ hơn)"
            >
              🎨 Bảng vẽ pro
            </button>
            <button onClick={annoUndo} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--color-surface)', cursor: 'pointer', fontSize: 14 }}>↶</button>
            <button onClick={annoRedoFn} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--color-surface)', cursor: 'pointer', fontSize: 14 }}>↷</button>
            <button
              onClick={() => {
                if (confirm('Xóa hết nét vẽ trên ảnh này?')) {
                  setAnnoStrokes((p) => ({ ...p, [annoImage]: [] }));
                  setAnnoRedo((p) => ({ ...p, [annoImage]: [] }));
                  setTimeout(annoRedraw, 20);
                }
              }}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--color-danger-wash)', cursor: 'pointer', fontSize: 13 }}
            >
              🗑 Xóa nét
            </button>
            <button
              onClick={() => {
                setAnnoImage(null);
                showToast('✅ Đã giữ nét vẽ — bấm "💾 Lưu dữ liệu" để lưu cho học sinh');
              }}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--lm-maroon)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
            >
              ✅ Xong
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-block', background: '#22242a', borderRadius: 10, padding: 8 }}>
              <img
                ref={annoImgRef}
                src={annoImage}
                alt="Bài làm"
                style={{ display: 'block', maxWidth: 'min(1100px, 94vw)', borderRadius: 6 }}
                onLoad={() => setTimeout(annoRedraw, 50)}
              />
              <canvas
                ref={annoCanvasRef}
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  touchAction: 'none',
                  cursor: tool === 'eraser' ? 'cell' : 'crosshair',
                }}
                onPointerDown={annoDown}
                onPointerMove={annoMove}
                onPointerUp={annoUp}
                onPointerLeave={annoUp}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
