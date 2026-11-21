// Vẽ + dò va chạm cho bảng chấm bài (GradingBoard).
// Toạ độ luôn tính theo "khổ logic" rộng LW px; hiển thị chỉ là phóng to/thu nhỏ.
// Dữ liệu cũ (AnnotateBoard) cùng định dạng nên bài đã chấm vẫn hiện đúng.

export const LW = 1150;

export type Pt = [number, number];

export type BoardEl =
  | {
      kind: 'stroke';
      tool: 'pen' | 'highlight' | 'eraser';
      penType?: 'pencil' | 'pen' | 'brush' | 'marker';
      color: string;
      size: number;
      eraserSize?: number;
      highlightSize?: number;
      points: Pt[];
      pressures?: number[];
    }
  | { kind: 'arrow'; color: string; size: number; points: Pt[] }
  | { kind: 'text'; x: number; y: number; text: string; color: string; size: number; boxed?: boolean }
  | { kind: 'stamp'; x: number; y: number; icon: 'check' | 'cross' | 'question'; color: string; size: number }
  | { kind: 'score'; x: number; y: number; value: number; color: string };

const PEN_SCALE: Record<string, number> = { pencil: 0.7, pen: 1.25, brush: 2.2, marker: 3.4 };
const HL_ALPHA = 0.45;

/** "+0,25" / "−0,5" (dấu phẩy thập phân, dấu trừ đúng) */
export function fmtScore(v: number): string {
  const a = Math.round(Math.abs(v) * 100) / 100;
  return (v < 0 ? '−' : '+') + String(a).replace('.', ',');
}

/** Tổng điểm của các dấu điểm trên mọi trang */
export function scoreNet(map: Record<string, BoardEl[]>): number {
  let t = 0;
  for (const k of Object.keys(map)) {
    for (const el of map[k] || []) if (el.kind === 'score') t += el.value;
  }
  return Math.round(t * 100) / 100;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function mctx(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

const FONT_UI = '"Be Vietnam Pro", "Segoe UI", sans-serif';
const FONT_MONO = '"JetBrains Mono", Consolas, monospace';

function textLayout(el: Extract<BoardEl, { kind: 'text' }>) {
  const ctx = mctx();
  const size = el.size;
  const font = `${el.boxed ? 500 : 400} ${size}px ${FONT_UI}`;
  if (ctx) ctx.font = font;
  const maxW = el.boxed ? 320 : 100000;
  const lines: string[] = [];
  for (const para of String(el.text).split('\n')) {
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx && line && ctx.measureText(test).width > maxW) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    lines.push(line);
  }
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx ? ctx.measureText(l).width : l.length * size * 0.55);
  return { lines, w, lh: size * 1.3, font };
}

function quadPath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) {
    ctx.lineTo(pts[1][0], pts[1][1]);
    return;
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
}

function drawPen(ctx: CanvasRenderingContext2D, el: Extract<BoardEl, { kind: 'stroke' }>) {
  const pts = el.points;
  if (!pts.length) return;
  const sc = PEN_SCALE[el.penType || 'pen'] || 1.25;
  const w = (i: number) => {
    const raw = el.pressures && el.pressures[i];
    const p = typeof raw === 'number' && !isNaN(raw) ? Math.max(0.05, raw) : 0.5;
    return Math.max(0.8, el.size * sc * (0.3 + 0.9 * p));
  };
  ctx.strokeStyle = el.color;
  ctx.fillStyle = el.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], w(0) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (pts.length === 2) {
    ctx.beginPath();
    ctx.lineWidth = w(1);
    quadPath(ctx, pts);
    ctx.stroke();
    return;
  }
  // Mượt: đường cong bậc hai qua trung điểm, bề rộng theo lực bút từng đoạn
  let cx = pts[0][0];
  let cy = pts[0][1];
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    ctx.lineWidth = (w(i) + w(i + 1)) / 2;
    ctx.stroke();
    cx = mx;
    cy = my;
  }
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(last[0], last[1]);
  ctx.lineWidth = w(pts.length - 1);
  ctx.stroke();
}

function drawHighlight(ctx: CanvasRenderingContext2D, el: Extract<BoardEl, { kind: 'stroke' }>) {
  const pts = el.points;
  if (!pts.length) return;
  const sz = el.highlightSize || 14;
  ctx.strokeStyle = el.color;
  ctx.fillStyle = el.color;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], sz / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.lineWidth = sz;
  ctx.beginPath();
  quadPath(ctx, pts);
  ctx.stroke();
}

function drawArrow(ctx: CanvasRenderingContext2D, el: Extract<BoardEl, { kind: 'arrow' }>) {
  const pts = el.points;
  if (!pts.length) return;
  ctx.strokeStyle = el.color;
  ctx.fillStyle = el.color;
  ctx.lineWidth = el.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.stroke();
  if (pts.length >= 2) {
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const len = Math.max(12, el.size * 4);
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(b[0] - len * Math.cos(ang - 0.42), b[1] - len * Math.sin(ang - 0.42));
    ctx.lineTo(b[0] - len * Math.cos(ang + 0.42), b[1] - len * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fill();
  }
}

function drawText(ctx: CanvasRenderingContext2D, el: Extract<BoardEl, { kind: 'text' }>) {
  const L = textLayout(el);
  ctx.font = L.font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (el.boxed) {
    const padX = 10;
    const padY = 6;
    const bw = L.w + padX * 2;
    const bh = L.lines.length * L.lh + padY * 2 - (L.lh - el.size);
    const x0 = el.x - padX;
    const y0 = el.y - el.size - padY + 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,253,248,0.94)';
    ctx.strokeStyle = el.color;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x0, y0, bw, bh, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = el.color;
  L.lines.forEach((l, i) => ctx.fillText(l, el.x, el.y + i * L.lh));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawStamp(ctx: CanvasRenderingContext2D, el: Extract<BoardEl, { kind: 'stamp' }>) {
  const { x, y, size: sz } = el;
  ctx.save();
  ctx.strokeStyle = el.color;
  ctx.fillStyle = el.color;
  ctx.lineWidth = Math.max(3, sz * 0.13);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (el.icon === 'check') {
    ctx.beginPath();
    ctx.moveTo(x - sz * 0.42, y + sz * 0.02);
    ctx.lineTo(x - sz * 0.12, y + sz * 0.34);
    ctx.lineTo(x + sz * 0.46, y - sz * 0.38);
    ctx.stroke();
  } else if (el.icon === 'cross') {
    ctx.beginPath();
    ctx.moveTo(x - sz * 0.34, y - sz * 0.34);
    ctx.lineTo(x + sz * 0.34, y + sz * 0.34);
    ctx.moveTo(x + sz * 0.34, y - sz * 0.34);
    ctx.lineTo(x - sz * 0.34, y + sz * 0.34);
    ctx.stroke();
  } else {
    ctx.font = `700 ${Math.round(sz * 1.1)}px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y);
  }
  ctx.restore();
}

function scoreBox(el: Extract<BoardEl, { kind: 'score' }>) {
  const ctx = mctx();
  const label = fmtScore(el.value);
  if (ctx) ctx.font = `600 17px ${FONT_MONO}`;
  const tw = ctx ? ctx.measureText(label).width : label.length * 10;
  return { label, w: tw + 18, h: 28 };
}

function drawScore(ctx: CanvasRenderingContext2D, el: Extract<BoardEl, { kind: 'score' }>) {
  const B = scoreBox(el);
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.rotate(-0.05);
  ctx.fillStyle = 'rgba(255,253,248,0.94)';
  ctx.strokeStyle = el.color;
  ctx.lineWidth = 2.2;
  roundRect(ctx, -B.w / 2, -B.h / 2, B.w, B.h, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = el.color;
  ctx.font = `600 17px ${FONT_MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(B.label, 0, 1);
  ctx.restore();
}

/**
 * Vẽ danh sách phần tử. layer:
 *  - 'hl'  : chỉ bút highlight (+ nét tẩy cũ) — dùng cho canvas có mix-blend-mode: multiply
 *  - 'ink' : mọi thứ trừ highlight
 *  - 'all' : tất cả trên một canvas (xuất ảnh / chế độ chỉ xem)
 */
export function drawEls(ctx: CanvasRenderingContext2D, els: BoardEl[], layer: 'hl' | 'ink' | 'all') {
  for (const el of els) {
    const isHl = el.kind === 'stroke' && el.tool === 'highlight';
    const isEr = el.kind === 'stroke' && el.tool === 'eraser';
    if (layer === 'hl' && !isHl && !isEr) continue;
    if (layer === 'ink' && isHl) continue;
    ctx.save();
    if (isEr) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const e = el as Extract<BoardEl, { kind: 'stroke' }>;
      const sz = e.eraserSize || 24;
      if (e.points.length === 1) {
        ctx.beginPath();
        ctx.arc(e.points[0][0], e.points[0][1], sz / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.points.length > 1) {
        ctx.lineWidth = sz;
        ctx.beginPath();
        quadPath(ctx, e.points);
        ctx.stroke();
      }
    } else if (isHl) {
      if (layer === 'all') {
        ctx.globalAlpha = HL_ALPHA;
        ctx.globalCompositeOperation = 'multiply';
      }
      drawHighlight(ctx, el as Extract<BoardEl, { kind: 'stroke' }>);
    } else if (el.kind === 'stroke') drawPen(ctx, el);
    else if (el.kind === 'arrow') drawArrow(ctx, el);
    else if (el.kind === 'text') drawText(ctx, el);
    else if (el.kind === 'stamp') drawStamp(ctx, el);
    else if (el.kind === 'score') drawScore(ctx, el);
    ctx.restore();
  }
}

export const HIGHLIGHT_ALPHA = HL_ALPHA;

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function polyHit(pts: Pt[], x: number, y: number, pad: number) {
  if (!pts.length) return false;
  if (pts.length === 1) return Math.hypot(x - pts[0][0], y - pts[0][1]) <= pad;
  for (let i = 1; i < pts.length; i++) {
    if (segDist(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= pad) return true;
  }
  return false;
}

/** Điểm (x,y) có chạm phần tử không (cho tẩy theo nét) */
export function hitEl(el: BoardEl, x: number, y: number, r: number): boolean {
  if (el.kind === 'stroke') {
    if (el.tool === 'eraser') return false;
    const half = el.tool === 'highlight' ? (el.highlightSize || 14) / 2 : el.size;
    return polyHit(el.points, x, y, r + half);
  }
  if (el.kind === 'arrow') return polyHit(el.points, x, y, r + el.size + 2);
  if (el.kind === 'text') {
    const L = textLayout(el);
    return x >= el.x - 12 - r && x <= el.x + L.w + 12 + r && y >= el.y - el.size - 8 - r && y <= el.y + (L.lines.length - 1) * L.lh + 8 + r;
  }
  if (el.kind === 'stamp') return Math.abs(x - el.x) <= el.size * 0.6 + r && Math.abs(y - el.y) <= el.size * 0.6 + r;
  const B = scoreBox(el);
  return Math.abs(x - el.x) <= B.w / 2 + r && Math.abs(y - el.y) <= B.h / 2 + r;
}
