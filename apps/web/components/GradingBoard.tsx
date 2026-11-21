'use client';

// Bảng chấm bài thống nhất cho ảnh bài làm và PDF.
// Dữ liệu: Record<khoá trang, BoardEl[]> — khoá là URL ảnh hoặc số trang PDF (giống định dạng cũ của AnnotateBoard).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BoardEl, HIGHLIGHT_ALPHA, LW, Pt, drawEls, hitEl, scoreNet } from '@/lib/board-render';
import { PdfDoc, renderPdfPage } from '@/lib/pdf-doc';

export type { BoardEl } from '@/lib/board-render';
export type BoardMap = Record<string, BoardEl[]>;

export type GbPage =
  | { key: string; kind: 'img'; url: string }
  | { key: string; kind: 'pdf'; doc: PdfDoc; pageNo: number; w: number; h: number };

type Tool = 'pen' | 'highlight' | 'eraser' | 'text' | 'arrow' | 'stamp' | 'note' | 'hand';
type StampId = 'check' | 'cross' | 'question' | 'p025' | 'm025' | 'm05';

const INK = ['#a3321f', '#2f6b3f', '#1f4e8c', '#b07514'];
const INK_NAME = ['Đỏ', 'Xanh lá', 'Xanh dương', 'Hổ phách'];
const HL = ['#f5c518', '#8fd19e', '#f4a6b8'];
const HL_NAME = ['Vàng', 'Xanh lá', 'Hồng'];
const HL_SIZES = [14, 26, 40];
const PEN_SIZES = [2, 3, 5];
const SIZE_NAME = ['Mảnh', 'Vừa', 'Dày'];

function makeStamp(id: StampId, x: number, y: number): BoardEl {
  if (id === 'check') return { kind: 'stamp', x, y, icon: 'check', color: '#2f6b3f', size: 38 };
  if (id === 'cross') return { kind: 'stamp', x, y, icon: 'cross', color: '#a3321f', size: 38 };
  if (id === 'question') return { kind: 'stamp', x, y, icon: 'question', color: '#b07514', size: 38 };
  if (id === 'p025') return { kind: 'score', x, y, value: 0.25, color: '#2f6b3f' };
  if (id === 'm025') return { kind: 'score', x, y, value: -0.25, color: '#a3321f' };
  return { kind: 'score', x, y, value: -0.5, color: '#a3321f' };
}

type Ctl = {
  tool: Tool;
  color: string;
  size: number;
  hlColor: string;
  hlSize: number;
  eraserR: number;
  stamp: StampId;
  noteText: string;
  penOnly: boolean;
};

/* ============================ Biểu tượng ============================ */
function Ic({ d, w = 20 }: { d: string; w?: number }) {
  return (
    <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const D = {
  pen: 'M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1z',
  hl: 'M14 4l6 6-8 8-6-6zM6 12l-2 6 4 2M10 20h8',
  eraser: 'M4 16l9-10 6 6-7 8H8zM9 20h10',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  arrow: 'M5 19L19 5M10 5h9v9',
  check: 'M5 12.5l4.5 4.5L19 7',
  cross: 'M6 6l12 12M18 6L6 18',
  question: 'M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 18h.01',
  hand: 'M9 11V5a1.5 1.5 0 0 1 3 0v5M12 10V4a1.5 1.5 0 0 1 3 0v6M15 10V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L9 14',
  note: 'M5 5h14v10H9l-4 4zM9 9h6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  minus: 'M6 12h12',
  plus: 'M6 12h12M12 6v12',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
};

/* ============================ Một trang ============================ */
function GbPageView({
  page,
  els,
  s,
  ctlRef,
  liveHl,
  scrollRef,
  pinching,
  onAdd,
  onErase,
  index,
  total,
}: {
  page: GbPage;
  els: BoardEl[];
  s: number;
  ctlRef: React.MutableRefObject<Ctl>;
  liveHl: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  pinching: React.MutableRefObject<boolean>;
  onAdd: (key: string, el: BoardEl) => void;
  onErase: (key: string, x: number, y: number, r: number, first: boolean) => void;
  index: number;
  total: number;
}) {
  const [ar, setAr] = useState(page.kind === 'pdf' ? page.h / page.w : 1.3);
  const [dpr, setDpr] = useState(1);
  const [vis, setVis] = useState(page.kind !== 'pdf');
  const [editing, setEditing] = useState<{ x: number; y: number; text: string } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const hlRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const cur = useRef<{ el: BoardEl; id: number } | null>(null);
  const erasing = useRef(false);
  const pan = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef(0);

  const cssW = LW * s;
  const cssH = LW * ar * s;

  useEffect(() => {
    setDpr(Math.min(2, window.devicePixelRatio || 1));
  }, []);

  // Trang PDF chỉ vẽ khi gần vào màn hình, ra xa thì thả bộ nhớ
  useEffect(() => {
    if (page.kind !== 'pdf' || !wrapRef.current) return;
    const io = new IntersectionObserver(
      (ents) => {
        for (const e of ents) setVis(e.isIntersecting);
      },
      { root: scrollRef.current, rootMargin: '120% 0px 120% 0px' },
    );
    io.observe(wrapRef.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.key]);

  useEffect(() => {
    if (page.kind !== 'pdf') return;
    const bg = bgRef.current;
    if (!bg) return;
    if (!vis) {
      bg.width = 1;
      bg.height = 1;
      return;
    }
    const proxy = page.doc.pages[page.pageNo - 1].proxy;
    const job = renderPdfPage(proxy, bg, LW * 1.5);
    job.done.catch(() => {});
    return () => job.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vis, page.key]);

  function fit(c: HTMLCanvasElement) {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d')!;
    const k = dpr * s;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, LW + 1, LW * ar + 1);
    return ctx;
  }

  useEffect(() => {
    if (hlRef.current) drawEls(fit(hlRef.current), els, 'hl');
    if (inkRef.current) drawEls(fit(inkRef.current), els, 'ink');
    if (liveRef.current) fit(liveRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [els, s, ar, dpr]);

  function pos(e: { clientX: number; clientY: number }): Pt {
    const r = liveRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / s, (e.clientY - r.top) / s];
  }

  function drawLive() {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const c = liveRef.current;
      if (!c) return;
      const ctx = fit(c);
      if (cur.current) {
        const el = cur.current.el;
        drawEls(ctx, [el], el.kind === 'stroke' && el.tool === 'highlight' ? 'hl' : 'ink');
      }
    });
  }

  function pressureOf(e: PointerEvent | React.PointerEvent): number {
    const p = (e as any).pressure;
    return typeof p === 'number' && !isNaN(p) && p > 0 ? p : 0.5;
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = ctlRef.current;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Kéo trang: công cụ Tay, hoặc ngón tay khi chế độ "Chỉ vẽ bằng bút"
    if (c.tool === 'hand' || (e.pointerType === 'touch' && c.penOnly)) {
      if (pinching.current) return;
      pan.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (pinching.current) return;
    e.preventDefault();
    const p = pos(e);
    if (c.tool === 'text') {
      setEditing({ x: p[0], y: p[1], text: '' });
      return;
    }
    if (c.tool === 'stamp') {
      onAdd(page.key, makeStamp(c.stamp, p[0], p[1]));
      return;
    }
    if (c.tool === 'note') {
      if (c.noteText) onAdd(page.key, { kind: 'text', boxed: true, x: p[0], y: p[1], text: c.noteText, color: c.color, size: 20 });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (c.tool === 'eraser') {
      erasing.current = true;
      onErase(page.key, p[0], p[1], c.eraserR, true);
      return;
    }
    let el: BoardEl;
    if (c.tool === 'arrow') el = { kind: 'arrow', color: c.color, size: Math.max(2, c.size), points: [p, p] };
    else if (c.tool === 'highlight')
      el = { kind: 'stroke', tool: 'highlight', color: c.hlColor, size: 1, highlightSize: c.hlSize, points: [p] };
    else el = { kind: 'stroke', tool: 'pen', penType: 'pen', color: c.color, size: c.size, points: [p], pressures: [pressureOf(e)] };
    cur.current = { el, id: e.pointerId };
    drawLive();
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (pan.current) {
      const sc = scrollRef.current;
      if (sc && !pinching.current) {
        sc.scrollLeft -= e.clientX - pan.current.x;
        sc.scrollTop -= e.clientY - pan.current.y;
      }
      pan.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (pinching.current) return;
    const c = ctlRef.current;
    if (erasing.current) {
      const evs: PointerEvent[] = ((e.nativeEvent as any).getCoalescedEvents?.() as PointerEvent[]) || [e.nativeEvent];
      for (const ev of evs.length ? evs : [e.nativeEvent]) {
        const p = pos(ev);
        onErase(page.key, p[0], p[1], c.eraserR, false);
      }
      return;
    }
    const st = cur.current;
    if (!st || st.id !== e.pointerId) return;
    const el: any = st.el;
    const evs: PointerEvent[] = ((e.nativeEvent as any).getCoalescedEvents?.() as PointerEvent[]) || [e.nativeEvent];
    for (const ev of evs.length ? evs : [e.nativeEvent]) {
      let p = pos(ev);
      if (el.kind === 'arrow') {
        el.points = [el.points[0], p];
        continue;
      }
      const last: Pt = el.points[el.points.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.8) continue;
      // Chuột: làm mượt nhẹ để bớt răng cưa; bút cảm ứng giữ nguyên độ chính xác
      if (ev.pointerType === 'mouse' && el.points.length > 1) p = [last[0] * 0.4 + p[0] * 0.6, last[1] * 0.4 + p[1] * 0.6];
      el.points.push(p);
      if (el.pressures) el.pressures.push(pressureOf(ev));
    }
    drawLive();
  }

  function finish(e: React.PointerEvent<HTMLCanvasElement>, cancel: boolean) {
    if (pan.current) {
      pan.current = null;
      return;
    }
    if (erasing.current) {
      erasing.current = false;
      return;
    }
    const st = cur.current;
    if (!st || st.id !== e.pointerId) return;
    cur.current = null;
    const el = st.el;
    let keep = !cancel;
    if (el.kind === 'arrow') {
      const a = el.points[0];
      const b = el.points[el.points.length - 1];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 10) keep = false;
    }
    if (el.kind === 'stroke' && el.tool === 'highlight' && el.points.length < 2) keep = false;
    const lc = liveRef.current;
    if (lc) fit(lc);
    if (keep) onAdd(page.key, JSON.parse(JSON.stringify(el)));
  }

  function commitText() {
    const t = editing;
    setEditing(null);
    if (!t || !t.text.trim()) return;
    const c = ctlRef.current;
    const size = Math.max(18, c.size * 7);
    onAdd(page.key, { kind: 'text', x: t.x, y: t.y + size, text: t.text.trim(), color: c.color, size });
  }

  const c0 = ctlRef.current;
  const cursor = c0.tool === 'hand' ? 'grab' : c0.tool === 'eraser' ? 'cell' : c0.tool === 'text' ? 'text' : 'crosshair';

  return (
    <div
      ref={wrapRef}
      className="gb-page"
      data-gbpage={index}
      style={{ width: cssW, height: cssH }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('text/lumi-note')) e.preventDefault();
      }}
      onDrop={(e) => {
        const text = e.dataTransfer.getData('text/lumi-note');
        if (!text) return;
        e.preventDefault();
        const p = pos(e);
        onAdd(page.key, { kind: 'text', boxed: true, x: p[0], y: p[1], text, color: ctlRef.current.color, size: 20 });
      }}
    >
      {page.kind === 'img' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="gb-bg"
          src={page.url}
          alt={`Trang ${index + 1} bài làm`}
          draggable={false}
          onLoad={(e) => {
            const im = e.currentTarget;
            if (im.naturalWidth) setAr(im.naturalHeight / im.naturalWidth);
          }}
        />
      ) : (
        <canvas ref={bgRef} className="gb-bg" />
      )}
      <canvas ref={hlRef} className="gb-layer gb-hl" style={{ opacity: HIGHLIGHT_ALPHA }} />
      <canvas ref={inkRef} className="gb-layer" />
      <canvas
        ref={liveRef}
        className="gb-layer gb-live"
        style={{ cursor, ...(liveHl ? { opacity: HIGHLIGHT_ALPHA, mixBlendMode: 'multiply' as const } : null) }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={(e) => finish(e, false)}
        onPointerCancel={(e) => finish(e, true)}
      />
      {editing && (
        <textarea
          autoFocus
          rows={2}
          className="gb-textin"
          value={editing.text}
          placeholder="Gõ nhận xét…"
          onChange={(e) => setEditing({ ...editing, text: e.target.value })}
          onBlur={commitText}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitText();
            } else if (e.key === 'Escape') setEditing(null);
          }}
          style={{
            left: editing.x * s,
            top: editing.y * s,
            fontSize: Math.max(18, ctlRef.current.size * 7) * s,
            color: ctlRef.current.color,
            borderColor: ctlRef.current.color,
          }}
        />
      )}
      {total > 1 && <span className="gb-pageno">Trang {index + 1}/{total}</span>}
    </div>
  );
}

/* ============================ Bảng chính ============================ */
export default function GradingBoard({
  pages,
  value,
  onChange,
  onAutosave,
  onScoreNet,
  templates = [],
  title,
  inline = false,
  height = '78vh',
  onClose,
}: {
  pages: GbPage[];
  value?: BoardMap;
  onChange?: (map: BoardMap) => void;
  onAutosave?: (map: BoardMap) => Promise<void>;
  onScoreNet?: (net: number) => void;
  templates?: { id: string; text: string }[];
  title?: string;
  inline?: boolean;
  height?: string;
  onClose?: () => void;
}) {
  const [els, setEls] = useState<BoardMap>(() => value || {});
  const elsRef = useRef<BoardMap>(value || {});
  const past = useRef<BoardMap[]>([]);
  const future = useRef<BoardMap[]>([]);
  const [, tick] = useState(0);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(INK[0]);
  const [size, setSize] = useState(3);
  const [hlColor, setHlColor] = useState(HL[0]);
  const [hlSize, setHlSize] = useState(HL_SIZES[1]);
  const [eraserR, setEraserR] = useState(18);
  const [stamp, setStamp] = useState<StampId>('check');
  const [noteText, setNoteText] = useState('');
  const [penOnly, setPenOnly] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [s, setS] = useState(0.8);
  const [curPage, setCurPage] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinching = useRef(false);
  const sRef = useRef(s);
  sRef.current = s;
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);

  const ctlRef = useRef<Ctl>({ tool, color, size, hlColor, hlSize, eraserR, stamp, noteText, penOnly });
  ctlRef.current = { tool, color, size, hlColor, hlSize, eraserR, stamp, noteText, penOnly };

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAutosaveRef = useRef(onAutosave);
  onAutosaveRef.current = onAutosave;
  const onScoreNetRef = useRef(onScoreNet);
  onScoreNetRef.current = onScoreNet;
  const lastNet = useRef(scoreNet(value || {}));

  /* ---------- lưu tự động ---------- */
  const dirty = useRef(false);
  const timer = useRef<any>(null);
  async function flush() {
    clearTimeout(timer.current);
    const fn = onAutosaveRef.current;
    if (!dirty.current || !fn) return;
    dirty.current = false;
    setSaveState('saving');
    try {
      await fn(elsRef.current);
      setSaveState(dirty.current ? 'dirty' : 'saved');
    } catch {
      dirty.current = true;
      setSaveState('error');
    }
  }
  function markDirty() {
    dirty.current = true;
    setSaveState('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 1200);
  }
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (dirty.current && onAutosaveRef.current) {
        dirty.current = false;
        onAutosaveRef.current(elsRef.current).catch(() => {});
      }
    },
    [],
  );

  /* ---------- sửa dữ liệu + lịch sử ---------- */
  function apply(next: BoardMap, pushHist: boolean) {
    if (pushHist) {
      past.current.push(elsRef.current);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
    }
    elsRef.current = next;
    setEls(next);
    onChangeRef.current?.(next);
    markDirty();
    const n = scoreNet(next);
    if (n !== lastNet.current) {
      lastNet.current = n;
      onScoreNetRef.current?.(n);
    }
    tick((x) => x + 1);
  }
  function addEl(key: string, el: BoardEl) {
    apply({ ...elsRef.current, [key]: [...(elsRef.current[key] || []), el] }, true);
  }
  const eraseFirst = useRef(true);
  function eraseAt(key: string, x: number, y: number, r: number, first: boolean) {
    if (first) eraseFirst.current = true;
    const list = elsRef.current[key] || [];
    const kept = list.filter((el) => !hitEl(el, x, y, r));
    if (kept.length === list.length) return;
    apply({ ...elsRef.current, [key]: kept }, eraseFirst.current);
    eraseFirst.current = false;
  }
  function undo() {
    if (!past.current.length) return;
    future.current.push(elsRef.current);
    apply(past.current.pop()!, false);
  }
  function redo() {
    if (!future.current.length) return;
    past.current.push(elsRef.current);
    apply(future.current.pop()!, false);
  }
  function clearPage() {
    const key = pages[Math.min(curPage, pages.length - 1)]?.key;
    if (!key || !(elsRef.current[key] || []).length) return;
    if (confirm('Xóa hết nét vẽ trên trang này?')) apply({ ...elsRef.current, [key]: [] }, true);
  }

  /* ---------- phím tắt ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (k === 'p') setTool('pen');
        else if (k === 'h') setTool('highlight');
        else if (k === 'e') setTool('eraser');
        else if (k === 't') setTool('text');
        else if (k === 'a') setTool('arrow');
        else if (k === 'v') setTool('hand');
        else if (k === 'c') { setStamp('check'); setTool('stamp'); }
        else if (k === 'x') { setStamp('cross'); setTool('stamp'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- phóng to / thu nhỏ ---------- */
  function setScale(next: number) {
    const sc = scrollRef.current;
    const clamped = Math.max(0.3, Math.min(3, next));
    if (sc) {
      const ratio = clamped / sRef.current;
      const cx = sc.clientWidth / 2;
      const cy = sc.clientHeight / 2;
      pendingScroll.current = { left: (sc.scrollLeft + cx) * ratio - cx, top: (sc.scrollTop + cy) * ratio - cy };
    }
    sRef.current = clamped;
    setS(clamped);
  }
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (sc && pendingScroll.current) {
      sc.scrollLeft = pendingScroll.current.left;
      sc.scrollTop = pendingScroll.current.top;
      pendingScroll.current = null;
    }
  }, [s]);
  function fitWidth() {
    const sc = scrollRef.current;
    if (!sc) return;
    const pad = window.matchMedia?.('(pointer: coarse)').matches ? 120 : 48;
    setScale(Math.min(1.4, Math.max(0.3, (sc.clientWidth - pad) / LW)));
    sc.scrollLeft = 0;
  }
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const pad = window.matchMedia?.('(pointer: coarse)').matches ? 120 : 48;
    const f = Math.min(1.4, Math.max(0.3, (sc.clientWidth - pad) / LW));
    sRef.current = f;
    setS(f);
    setPenOnly(!!window.matchMedia?.('(pointer: coarse)').matches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    let d0 = 0;
    let s0 = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const ts = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinching.current = true;
        d0 = dist(e.touches);
        s0 = sRef.current;
      }
    };
    const tm = (e: TouchEvent) => {
      if (e.touches.length === 2 && d0) {
        e.preventDefault();
        setScale(s0 * (dist(e.touches) / d0));
      }
    };
    const te = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        d0 = 0;
        setTimeout(() => {
          pinching.current = false;
        }, 120);
      }
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setScale(sRef.current * (e.deltaY < 0 ? 1.08 : 0.92));
    };
    sc.addEventListener('touchstart', ts, { passive: true });
    sc.addEventListener('touchmove', tm, { passive: false });
    sc.addEventListener('touchend', te);
    sc.addEventListener('touchcancel', te);
    sc.addEventListener('wheel', wheel, { passive: false });
    return () => {
      sc.removeEventListener('touchstart', ts);
      sc.removeEventListener('touchmove', tm);
      sc.removeEventListener('touchend', te);
      sc.removeEventListener('touchcancel', te);
      sc.removeEventListener('wheel', wheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    const sc = scrollRef.current;
    if (!sc) return;
    const nodes = sc.querySelectorAll<HTMLElement>('.gb-page');
    let idx = 0;
    nodes.forEach((n, i) => {
      if (n.offsetTop + n.offsetHeight / 2 <= sc.scrollTop + sc.clientHeight / 2) idx = i;
    });
    setCurPage(idx);
  }

  async function handleClose() {
    await flush();
    onClose?.();
  }

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;
  const net = scoreNet(els);

  function pick(t: Tool) {
    setTool(t);
    setTplOpen(false);
  }
  function pickStamp(id: StampId) {
    setStamp(id);
    setTool('stamp');
    setTplOpen(false);
  }

  const stampBtns: { id: StampId; label: string; icon?: string; text?: string; cls: string }[] = [
    { id: 'check', label: 'Dấu đúng (C)', icon: D.check, cls: 'ok' },
    { id: 'cross', label: 'Dấu sai (X)', icon: D.cross, cls: 'bad' },
    { id: 'question', label: 'Dấu hỏi', icon: D.question, cls: 'warn' },
    { id: 'p025', label: 'Cộng 0,25 điểm', text: '+0,25', cls: 'ok' },
    { id: 'm025', label: 'Trừ 0,25 điểm', text: '−0,25', cls: 'bad' },
    { id: 'm05', label: 'Trừ 0,5 điểm', text: '−0,5', cls: 'bad' },
  ];
  const toolBtns: { t: Tool; label: string; icon: string }[] = [
    { t: 'pen', label: 'Bút (P)', icon: D.pen },
    { t: 'highlight', label: 'Bút highlight (H)', icon: D.hl },
    { t: 'eraser', label: 'Tẩy theo nét (E)', icon: D.eraser },
    { t: 'text', label: 'Chữ (T)', icon: D.text },
    { t: 'arrow', label: 'Mũi tên (A)', icon: D.arrow },
    { t: 'hand', label: 'Kéo trang (V)', icon: D.hand },
  ];

  const saveLabel =
    saveState === 'saving' ? 'Đang lưu…' : saveState === 'dirty' ? 'Chưa lưu…' : saveState === 'saved' ? 'Đã lưu tự động' : saveState === 'error' ? 'Lưu lỗi — sẽ thử lại' : '';

  return (
    <div className={`gb-root ${inline ? 'gb-inline' : 'gb-modal'}`} style={inline ? { height } : undefined}>
      {!inline && (
        <div className="gb-head">
          <strong className="gb-title">{title || 'Chấm trực tiếp trên bài làm'}</strong>
          <span className={`gb-save gb-save-${saveState}`}>{saveLabel}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="gb-btn gb-btn-text" onClick={handleClose}>
            Xong
          </button>
        </div>
      )}

      <div className="gb-stage">
        {/* Thanh công cụ */}
        <div className="gb-toolbar" role="toolbar" aria-label="Công cụ chấm bài">
          {toolBtns.map((b) => (
            <button key={b.t} type="button" className={`gb-btn${tool === b.t ? ' on' : ''}`} aria-label={b.label} aria-pressed={tool === b.t} title={b.label} onClick={() => pick(b.t)}>
              <Ic d={b.icon} />
            </button>
          ))}
          <span className="gb-sep" />
          {stampBtns.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`gb-btn gb-stamp ${b.cls}${tool === 'stamp' && stamp === b.id ? ' on' : ''}`}
              aria-label={b.label}
              aria-pressed={tool === 'stamp' && stamp === b.id}
              title={b.label}
              onClick={() => pickStamp(b.id)}
            >
              {b.icon ? <Ic d={b.icon} /> : <span className="gb-mono">{b.text}</span>}
            </button>
          ))}
          <span className="gb-sep" />
          <button
            type="button"
            className={`gb-btn gb-btn-note${tool === 'note' || tplOpen ? ' on' : ''}`}
            aria-label="Nhận xét mẫu"
            aria-pressed={tplOpen}
            title="Nhận xét mẫu — kéo thả hoặc bấm chọn rồi chạm lên bài"
            onClick={() => setTplOpen((v) => !v)}
          >
            <Ic d={D.note} />
          </button>
          <span className="gb-sep" />
          <button type="button" className="gb-btn" aria-label="Hoàn tác" title="Hoàn tác (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <Ic d={D.undo} />
          </button>
          <button type="button" className="gb-btn" aria-label="Làm lại" title="Làm lại (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
            <Ic d={D.redo} />
          </button>
          <button type="button" className="gb-btn" aria-label="Xóa nét trên trang này" title="Xóa nét trên trang đang xem" onClick={clearPage}>
            <Ic d={D.trash} />
          </button>
        </div>

        {/* Tuỳ chọn theo công cụ */}
        <div className="gb-ctx">
          {(tool === 'pen' || tool === 'arrow' || tool === 'text' || tool === 'note') && (
            <>
              <span className="gb-lbl">Màu</span>
              {INK.map((c, i) => (
                <button key={c} type="button" className={`gb-swatch${color === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Màu ${INK_NAME[i]}`} aria-pressed={color === c} onClick={() => setColor(c)} />
              ))}
              {(tool === 'pen' || tool === 'arrow' || tool === 'text') && (
                <>
                  <span className="gb-lbl">Độ dày</span>
                  {PEN_SIZES.map((v, i) => (
                    <button key={v} type="button" className={`gb-size${size === v ? ' on' : ''}`} aria-label={SIZE_NAME[i]} aria-pressed={size === v} onClick={() => setSize(v)}>
                      <span style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
                    </button>
                  ))}
                </>
              )}
            </>
          )}
          {tool === 'highlight' && (
            <>
              <span className="gb-lbl">Màu highlight</span>
              {HL.map((c, i) => (
                <button key={c} type="button" className={`gb-swatch${hlColor === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Highlight ${HL_NAME[i]}`} aria-pressed={hlColor === c} onClick={() => setHlColor(c)} />
              ))}
              <span className="gb-lbl">Độ dày</span>
              {HL_SIZES.map((v, i) => (
                <button key={v} type="button" className={`gb-size${hlSize === v ? ' on' : ''}`} aria-label={SIZE_NAME[i]} aria-pressed={hlSize === v} onClick={() => setHlSize(v)}>
                  <span style={{ width: 16, height: 4 + i * 5, borderRadius: 3 }} />
                </button>
              ))}
            </>
          )}
          {tool === 'eraser' && (
            <label className="gb-lbl gb-range">
              Cỡ tẩy
              <input type="range" min={8} max={60} value={eraserR} onChange={(e) => setEraserR(Number(e.target.value))} />
            </label>
          )}
          {tool === 'stamp' && <span className="gb-lbl">Chạm lên bài để đặt dấu. Dấu điểm sẽ tự cộng/trừ vào điểm.</span>}
          {tool === 'hand' && <span className="gb-lbl">Kéo để di chuyển trang.</span>}
          {tool === 'note' && <span className="gb-lbl">{noteText ? `Chạm lên bài để đặt: “${noteText.slice(0, 40)}${noteText.length > 40 ? '…' : ''}”` : 'Chọn một nhận xét mẫu trước.'}</span>}
          <span style={{ flex: 1 }} />
          <button type="button" className={`gb-chip${penOnly ? ' on' : ''}`} aria-pressed={penOnly} onClick={() => setPenOnly((v) => !v)} title="Bút cảm ứng để vẽ, ngón tay để cuộn trang, hai ngón để phóng to">
            Chỉ vẽ bằng bút
          </button>
          {net !== 0 && <span className="gb-chip gb-net" title="Tổng các dấu điểm đã đặt trên bài">Dấu điểm: {net > 0 ? '+' : '−'}{String(Math.abs(net)).replace('.', ',')}</span>}
          {inline && saveLabel && <span className={`gb-save gb-save-${saveState}`}>{saveLabel}</span>}
        </div>

        {/* Hộp nhận xét mẫu */}
        {tplOpen && (
          <div className="gb-pop" role="dialog" aria-label="Nhận xét mẫu">
            <div className="gb-lbl">Kéo thả lên bài, hoặc bấm chọn rồi chạm vào chỗ cần ghi chú</div>
            {templates.length === 0 ? (
              <div className="gb-lbl">Chưa có nhận xét mẫu. Thêm ở khung nhận xét bên cạnh để dùng lại.</div>
            ) : (
              <div className="gb-chips">
                {templates.slice(0, 24).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`gb-tpl${tool === 'note' && noteText === t.text ? ' on' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/lumi-note', t.text);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => {
                      setNoteText(t.text);
                      setTool('note');
                      setTplOpen(false);
                    }}
                  >
                    {t.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Các trang */}
        <div className="gb-scroll" ref={scrollRef} onScroll={onScroll}>
          <div className="gb-pages">
            {pages.map((p, i) => (
              <GbPageView
                key={p.key}
                page={p}
                index={i}
                total={pages.length}
                els={els[p.key] || EMPTY}
                s={s}
                ctlRef={ctlRef}
                liveHl={tool === 'highlight'}
                scrollRef={scrollRef}
                pinching={pinching}
                onAdd={addEl}
                onErase={eraseAt}
              />
            ))}
          </div>
        </div>

        {/* Phóng to / trang */}
        <div className="gb-zoom">
          <button type="button" className="gb-btn gb-btn-sm" aria-label="Thu nhỏ" onClick={() => setScale(s / 1.15)}>
            <Ic d={D.minus} w={18} />
          </button>
          <span className="gb-mono gb-zoom-n">{Math.round(s * 100)}%</span>
          <button type="button" className="gb-btn gb-btn-sm" aria-label="Phóng to" onClick={() => setScale(s * 1.15)}>
            <Ic d={D.plus} w={18} />
          </button>
          <span className="gb-sep" />
          <button type="button" className="gb-btn gb-btn-sm gb-btn-text" onClick={fitWidth}>
            Vừa chiều rộng
          </button>
          {pages.length > 1 && <span className="gb-mono gb-zoom-n">Trang {Math.min(curPage + 1, pages.length)}/{pages.length}</span>}
        </div>
      </div>
    </div>
  );
}

const EMPTY: BoardEl[] = [];
