'use client';

import { useEffect, useRef, useState } from 'react';

export type BoardEl =
  | {
      kind: 'stroke';
      tool: 'pen' | 'highlight' | 'eraser';
      penType?: 'pencil' | 'pen' | 'brush' | 'marker';
      color: string;
      size: number;
      eraserSize?: number;
      highlightSize?: number;
      points: [number, number][];
      pressures?: number[]; // lực bút 0..1 (Apple Pencil / bảng vẽ điện tử)
    }
  | {
      kind: 'arrow';
      color: string;
      size: number;
      points: [number, number][];
    }
  | {
      kind: 'text';
      x: number;
      y: number;
      text: string;
      color: string;
      size: number;
    };

type Tool = 'pen' | 'highlight' | 'eraser' | 'text' | 'arrow' | 'hand';
type PenType = 'pencil' | 'pen' | 'brush' | 'marker';

const PEN_SCALE: Record<PenType, number> = {
  pencil: 0.7,
  pen: 1.25,
  brush: 2.2,
  marker: 3.4,
};

const PEN_LABEL: Record<PenType, string> = {
  pencil: '✏️ Chì',
  pen: '🖊 Bút',
  brush: '🖌 Cọ',
  marker: '🖍 Bút dạ',
};

export default function AnnotateBoard({
  backgroundUrl,
  snapshot,
  onSave,
  onClose,
  inline = false,
}: {
  backgroundUrl: string;
  snapshot?: BoardEl[] | null;
  onSave: (els: BoardEl[]) => void;
  onClose?: () => void;
  inline?: boolean;
}) {
  const [tool, setTool] = useState<Tool>('pen');
  const [penType, setPenType] = useState<PenType>('pen');
  const [color, setColor] = useState('#e11d48');
  const [size, setSize] = useState(3);
  const [eraserSize, setEraserSize] = useState(24);
  const [highlightSize, setHighlightSize] = useState(12);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [els, setEls] = useState<BoardEl[]>([]);
  const [editingText, setEditingText] = useState<{ x: number; y: number; text: string } | null>(null);

  const past = useRef<BoardEl[][]>([]);
  const future = useRef<BoardEl[][]>([]);
  const elsRef = useRef<BoardEl[]>([]);

  useEffect(() => {
    elsRef.current = els;
  }, [els]);

  function commit(next: BoardEl[]) {
    past.current.push(elsRef.current);
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    elsRef.current = next;
    setEls(next);
  }

  function undo() {
    if (!past.current.length) return;
    future.current.push(elsRef.current);
    const prev = past.current.pop()!;
    elsRef.current = prev;
    setEls(prev);
  }

  function redo() {
    if (!future.current.length) return;
    past.current.push(elsRef.current);
    const next = future.current.pop()!;
    elsRef.current = next;
    setEls(next);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (!e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'p') setTool('pen');
        else if (k === 'h') setTool('highlight');
        else if (k === 'e') setTool('eraser');
        else if (k === 't') setTool('text');
        else if (k === 'a') setTool('arrow');
        else if (k === 'v') setTool('hand');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (snapshot && Array.isArray(snapshot) && snapshot.length) {
      elsRef.current = snapshot;
      setEls(snapshot);
      past.current = [];
      future.current = [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [els, zoom, pan, editingText]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drawing = useRef(false);
  const current = useRef<BoardEl | null>(null);
  const panning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Bán kính nét theo lực bút (nét thanh ↔ nét đậm)
  function radiusAt(el: any, i: number): number {
    if (el.kind === 'stroke' && el.tool === 'eraser') {
      return (el.eraserSize || eraserSize) / 2;
    }
    if (el.kind === 'stroke' && el.tool === 'highlight') {
      return (el.highlightSize || highlightSize) / 2;
    }
    const scale = PEN_SCALE[(el.penType as PenType) || 'pen'] || 1.25;
    const pressure =
      el.pressures && el.pressures.length > i ? el.pressures[i] : 0.5;
    const p = typeof pressure === 'number' && !isNaN(pressure) ? Math.max(0.05, pressure) : 0.5;
    const width = el.size * scale * (0.3 + 0.9 * p);
    return Math.max(0.5, width / 2);
  }

  function strokeColor(el: any): string {
    if (el.kind === 'stroke' && el.tool === 'eraser') return 'rgba(0,0,0,1)';
    if (el.kind === 'stroke' && el.tool === 'highlight') return 'rgba(250,204,21,0.45)';
    return el.color;
  }

  function drawStroke(ctx: CanvasRenderingContext2D, el: any) {
    if (!el.points || !el.points.length) return;
    if (el.points.length === 1) {
      const r = radiusAt(el, 0);
      ctx.beginPath();
      ctx.arc(el.points[0][0], el.points[0][1], r, 0, Math.PI * 2);
      ctx.fillStyle = strokeColor(el);
      ctx.fill();
      return;
    }
    const pts = el.points;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = strokeColor(el);
    // Vẽ từng đoạn với độ rộng riêng (nét thanh → nét đậm theo lực bút)
    for (let i = 1; i < pts.length; i++) {
      const r = radiusAt(el, i);
      const rPrev = radiusAt(el, i - 1);
      const midX = (pts[i][0] + pts[i - 1][0]) / 2;
      const midY = (pts[i][1] + pts[i - 1][1]) / 2;
      ctx.beginPath();
      ctx.lineWidth = rPrev * 2;
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
      ctx.lineTo(midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.lineWidth = r * 2;
      ctx.moveTo(midX, midY);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }

  function redraw() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const el of els) {
      if (el.kind === 'text') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = `${el.size}px "Segoe UI", sans-serif`;
        ctx.fillStyle = el.color;
        ctx.fillText(el.text, el.x, el.y);
        continue;
      }
      if (el.kind === 'arrow') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = el.color;
        ctx.lineWidth = el.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(el.points[0][0], el.points[0][1]);
        for (const p of el.points) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
        if (el.points.length >= 2) {
          const a = el.points[el.points.length - 2];
          const b = el.points[el.points.length - 1];
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          const len = Math.max(10, el.size * 3.5);
          ctx.fillStyle = el.color;
          ctx.beginPath();
          ctx.moveTo(b[0], b[1]);
          ctx.lineTo(b[0] - len * Math.cos(ang - 0.45), b[1] - len * Math.sin(ang - 0.45));
          ctx.lineTo(b[0] - len * Math.cos(ang + 0.45), b[1] - len * Math.sin(ang + 0.45));
          ctx.closePath();
          ctx.fill();
        }
        continue;
      }
      ctx.globalCompositeOperation = el.tool === 'eraser' ? 'destination-out' : 'source-over';
      drawStroke(ctx, el);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function pos(e: React.PointerEvent): [number, number] {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom];
  }

  function pressureOf(e: React.PointerEvent): number {
    const p = (e as any).pressure;
    return typeof p === 'number' && !isNaN(p) && p > 0 ? p : 0.5;
  }

  function onDown(e: React.PointerEvent) {
    if (tool === 'hand' || e.button === 1) {
      panning.current = true;
      panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }
    if (tool === 'text') {
      const [x, y] = pos(e);
      setEditingText({ x, y, text: '' });
      return;
    }
    e.preventDefault();
    drawing.current = true;
    const p = pos(e);
    if (tool === 'arrow') {
      current.current = { kind: 'arrow', color, size, points: [p] };
    } else if (tool === 'eraser') {
      current.current = { kind: 'stroke', tool: 'eraser', color: '#000', size, eraserSize, points: [p] };
    } else if (tool === 'highlight') {
      current.current = { kind: 'stroke', tool: 'highlight', color: '#facc15', size, highlightSize, points: [p] };
    } else {
      current.current = {
        kind: 'stroke',
        tool: 'pen',
        penType,
        color,
        size,
        points: [p],
        pressures: [pressureOf(e)],
      };
    }
  }

  function onMove(e: React.PointerEvent) {
    if (panning.current) {
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
      return;
    }
    if (!drawing.current || !current.current) return;
    const el: any = current.current;
    el.points.push(pos(e));
    if (el.kind === 'stroke' && el.tool === 'pen') {
      el.pressures.push(pressureOf(e));
    }
    requestAnimationFrame(() => {
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        redraw();
        const cur: any = current.current;
        if (!cur || !cur.points.length) return;
        ctx.globalCompositeOperation = cur.tool === 'eraser' ? 'destination-out' : 'source-over';
        drawStroke(ctx, cur);
        ctx.globalCompositeOperation = 'source-over';
      }
    });
  }

  function onUp() {
    if (drawing.current && current.current) {
      const cur = JSON.parse(JSON.stringify(current.current)) as BoardEl;
      if ((cur as any).points && (cur as any).points.length >= 1) {
        commit([...elsRef.current, cur]);
      }
      current.current = null;
    }
    drawing.current = false;
    panning.current = false;
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((z) =>
      Math.min(4, Math.max(0.3, Math.round((z + (e.deltaY < 0 ? 0.15 : -0.15)) * 100) / 100)),
    );
  }

  function commitText() {
    if (editingText && editingText.text.trim()) {
      commit([
        ...elsRef.current,
        { kind: 'text', x: editingText.x, y: editingText.y + 16, text: editingText.text, color, size: Math.max(14, size * 6) },
      ]);
    }
    setEditingText(null);
  }

  const tools: [Tool, string][] = [
    ['hand', '✋ Di chuyển (V)'],
    ['pen', '🖊 Bút (P)'],
    ['highlight', '🖍 Highlight (H)'],
    ['eraser', '🧽 Tẩy (E)'],
    ['arrow', '➡️ Mũi tên (A)'],
    ['text', '🔤 Chữ (T)'],
  ];

  return (
    <div
      style={
        inline
          ? { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 420, background: '#26292f', borderRadius: 10, overflow: 'hidden' }
          : { position: 'fixed', inset: 0, background: 'rgba(18,15,11,0.92)', zIndex: 95, display: 'flex', flexDirection: 'column' }
      }
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: inline ? '8px 10px' : '10px 14px', background: 'var(--lm-maroon)', color: '#fff' }}>
        <span style={{ fontWeight: 800, fontSize: 13, marginRight: 4 }}>
          {inline ? '✏️ Chấm trực tiếp' : '🎨 Chấm trực tiếp trên ảnh bài làm'}
        </span>
        {tools.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              background: tool === t ? 'var(--lm-amber)' : 'rgba(255,255,255,0.14)',
              color: '#fff',
            }}
          >
            {label}
          </button>
        ))}

        {tool === 'pen' && (
          <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.25)', padding: 3, borderRadius: 8 }}>
            {(Object.keys(PEN_LABEL) as PenType[]).map((pt) => (
              <button
                key={pt}
                onClick={() => setPenType(pt)}
                title={`${PEN_LABEL[pt]}${pt === 'pencil' || pt === 'pen' ? ' — nhận lực bút (nét thanh/đậm)' : ''}`}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: penType === pt ? 'var(--lm-amber)' : 'transparent',
                  color: '#fff',
                }}
              >
                {PEN_LABEL[pt]}
              </button>
            ))}
          </div>
        )}

        {(tool === 'pen' || tool === 'highlight' || tool === 'arrow') && (
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            Màu
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 30, height: 24, border: 'none', background: 'none' }} />
          </label>
        )}

        {(tool === 'pen' || tool === 'arrow') && (
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            Cỡ
            <input type="range" min={1} max={10} value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ width: 70 }} />
          </label>
        )}

        {tool === 'highlight' && (
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            Cỡ highlight
            <input type="range" min={2} max={60} value={highlightSize} onChange={(e) => setHighlightSize(Number(e.target.value))} style={{ width: 90 }} />
            <span className="mono" style={{ minWidth: 30 }}>{highlightSize}px</span>
          </label>
        )}

        {tool === 'eraser' && (
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            Cỡ tẩy
            <input type="range" min={6} max={200} value={eraserSize} onChange={(e) => setEraserSize(Number(e.target.value))} style={{ width: 90 }} />
            <span className="mono" style={{ minWidth: 34 }}>{eraserSize}px</span>
          </label>
        )}

        <span style={{ flex: 1 }} />
        <button
          onClick={undo}
          disabled={!past.current.length}
          style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: past.current.length ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)', color: past.current.length ? '#fff' : 'rgba(255,255,255,0.35)', cursor: past.current.length ? 'pointer' : 'default', fontSize: 14 }}
          title="Undo (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          onClick={redo}
          disabled={!future.current.length}
          style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: future.current.length ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)', color: future.current.length ? '#fff' : 'rgba(255,255,255,0.35)', cursor: future.current.length ? 'pointer' : 'default', fontSize: 14 }}
          title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
        >
          ↷
        </button>
        <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>➖</button>
        <span className="mono" style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(4, z + 0.2))} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.14)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>➕</button>
        <button
          onClick={() => { if (confirm('Xóa hết nét vẽ trên ảnh này?')) commit([]); }}
          style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#fecaca', color: '#7f1d1d', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}
        >
          🗑 Xóa nét
        </button>
        <button
          onClick={() => onSave(JSON.parse(JSON.stringify(elsRef.current)))}
          style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#fff', color: 'var(--lm-maroon)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
        >
          💾 Lưu nét vẽ
        </button>
        {!inline && (
          <button
            onClick={onClose}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            ✕
          </button>
        )}
      </div>

      <div
        style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: tool === 'hand' ? 'grab' : tool === 'text' ? 'text' : 'crosshair' }}
        onWheel={onWheel}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            position: 'relative',
            boxShadow: '0 10px 50px rgba(0,0,0,0.6)',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#22242a',
          }}
        >
          <img
            ref={imgRef}
            src={backgroundUrl}
            alt="Bài làm"
            style={{ display: 'block', maxWidth: 'min(1150px, 92vw)', maxHeight: '78vh', objectFit: 'contain' }}
            onLoad={redraw}
          />
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', top: 0, left: 0, touchAction: 'none' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
          />
          {editingText && (
            <textarea
              autoFocus
              rows={2}
              value={editingText.text}
              onChange={(e) => setEditingText({ ...editingText, text: e.target.value })}
              onBlur={commitText}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitText();
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="Gõ nhận xét…"
              style={{
                position: 'absolute',
                left: editingText.x,
                top: editingText.y,
                minWidth: 140,
                padding: 4,
                borderRadius: 6,
                border: `2px solid ${color}`,
                fontSize: Math.max(14, size * 6),
                color,
                background: 'rgba(255,255,255,0.92)',
                zIndex: 6,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
