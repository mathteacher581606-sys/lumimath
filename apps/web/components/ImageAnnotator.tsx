'use client';

import { useEffect, useRef, useState } from 'react';

type Tool = 'pen' | 'highlighter' | 'eraser' | 'text';

const COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#111827'];

const PEN_SIZES = [
  { label: 'Mảnh', w: 2.5, sw: 14 },
  { label: 'Vừa', w: 4.5, sw: 26 },
  { label: 'Đậm', w: 8, sw: 40 },
];

// Sửa bài trên ảnh: bút mực, bút nhũ, tẩy, khung chèn văn bản, xoay/lật, Undo/Redo
export default function ImageAnnotator({
  src,
  onCancel,
  onSave,
}: {
  src: string;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const boxStart = useRef<{ x: number; y: number } | null>(null);

  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [sizeIdx, setSizeIdx] = useState(1);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [previewBox, setPreviewBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [textEditor, setTextEditor] = useState<{ x: number; y: number; w: number; h: number; text: string } | null>(null);

  const undoStack = useRef<ImageData[]>([]);
  const redoStack = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      const canvas = canvasRef.current;
      const base = baseRef.current;
      if (!canvas || !base) return;
      const maxW = Math.min(900, window.innerWidth - 60);
      const maxH = window.innerHeight - 240;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1.5);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      for (const c of [base, canvas]) {
        c.width = w;
        c.height = h;
        c.style.width = w + 'px';
        c.style.height = h + 'px';
      }
      base.getContext('2d')!.drawImage(img, 0, 0, w, h);
      setDims({ w, h });
    };
    img.onerror = () => onCancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function getCtx(): CanvasRenderingContext2D | null {
    return canvasRef.current?.getContext('2d') || null;
  }

  function pushSnapshot() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    undoStack.current.push(
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    );
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }

  function undo() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx || !undoStack.current.length) return;
    redoStack.current.push(
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    );
    const prev = undoStack.current.pop()!;
    ctx.putImageData(prev, 0, 0);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
  }

  function redo() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx || !redoStack.current.length) return;
    undoStack.current.push(
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    );
    const next = redoStack.current.pop()!;
    ctx.putImageData(next, 0, 0);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
  }

  function clearAll() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    pushSnapshot();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Xoay 90° theo chiều kim đồng hồ (ảnh gốc + nét vẽ cùng xoay)
  function rotate90() {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const nw = canvas.height;
    const nh = canvas.width;

    for (const srcC of [canvas, base]) {
      const off = document.createElement('canvas');
      off.width = nw;
      off.height = nh;
      const octx = off.getContext('2d')!;
      octx.translate(nw, 0);
      octx.rotate(Math.PI / 2);
      octx.drawImage(srcC, 0, 0);
      srcC.width = nw;
      srcC.height = nh;
      srcC.style.width = nw + 'px';
      srcC.style.height = nh + 'px';
      srcC.getContext('2d')!.drawImage(off, 0, 0);
    }
    setDims({ w: nw, h: nh });
    pushSnapshot();
  }

  // Lật ngang (gương): ảnh gốc + nét vẽ cùng lật
  function flipH() {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;

    for (const srcC of [canvas, base]) {
      const off = document.createElement('canvas');
      off.width = srcC.width;
      off.height = srcC.height;
      const octx = off.getContext('2d')!;
      octx.translate(srcC.width, 0);
      octx.scale(-1, 1);
      octx.drawImage(srcC, 0, 0);
      const ctx = srcC.getContext('2d')!;
      ctx.clearRect(0, 0, srcC.width, srcC.height);
      ctx.drawImage(off, 0, 0);
    }
    pushSnapshot();
  }

  function pos(e: React.PointerEvent | React.MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDraw(e: React.PointerEvent) {
    if (tool === 'text') {
      boxStart.current = pos(e);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    drawing.current = true;
    lastPos.current = pos(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveDraw(e: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (tool === 'text' && boxStart.current) {
      const p = pos(e);
      const s = boxStart.current;
      setPreviewBox({
        x: Math.min(s.x, p.x),
        y: Math.min(s.y, p.y),
        w: Math.abs(p.x - s.x),
        h: Math.abs(p.y - s.y),
      });
      return;
    }

    if (!drawing.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPos.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = PEN_SIZES[sizeIdx].sw;
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = color;
      ctx.lineWidth = PEN_SIZES[sizeIdx].sw;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = PEN_SIZES[sizeIdx].w;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    lastPos.current = p;
  }

  function endDraw() {
    if (tool === 'text' && boxStart.current) {
      const s = boxStart.current;
      const pv = previewBox;
      boxStart.current = null;
      setPreviewBox(null);
      if (pv && pv.w > 40 && pv.h > 24) {
        setTextEditor({ ...pv, text: '' });
        return;
      }
      if (pv) {
        setTextEditor({ x: s.x, y: s.y, w: 220, h: 60, text: '' });
      }
      return;
    }
    if (drawing.current) {
      drawing.current = false;
      lastPos.current = null;
      pushSnapshot();
    }
  }

  function commitTextBox() {
    if (!textEditor) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    pushSnapshot();

    const pad = 8;
    const { x, y, w, h } = textEditor;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '600 16px Arial, sans-serif';
    const words = textEditor.text.split('\n');
    let lineY = y + pad + 15;
    for (const line of words) {
      let cur = '';
      for (const word of line.split(' ')) {
        const test = cur ? cur + ' ' + word : word;
        if (ctx.measureText(test).width > w - pad * 2 && cur) {
          ctx.fillText(cur, x + pad, lineY);
          lineY += 20;
          cur = word;
        } else {
          cur = test;
        }
      }
      if (cur) {
        ctx.fillText(cur, x + pad, lineY);
        lineY += 20;
      }
    }
    setTextEditor(null);
  }

  function save() {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(canvas, 0, 0);
    out.toBlob((blob) => {
      if (blob) onSave(blob);
      else alert('Không xuất được ảnh');
    }, 'image/png');
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 13px',
    borderRadius: 8,
    border: active ? '2px solid #60a5fa' : '1px solid #4b5563',
    background: active ? '#1d4ed8' : '#374151',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 13,
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10,10,10,0.85)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 12,
      }}
    >
      {/* Thanh công cụ */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          background: '#1e1e1e',
          padding: '8px 12px',
          borderRadius: 12,
          maxWidth: 960,
          width: '100%',
        }}
      >
        <button onClick={() => setTool('pen')} style={btnStyle(tool === 'pen')}>🖊️ Bút mực</button>
        <button onClick={() => setTool('highlighter')} style={btnStyle(tool === 'highlighter')}>🖍️ Bút nhũ</button>
        <button onClick={() => setTool('eraser')} style={btnStyle(tool === 'eraser')}>🧽 Tẩy</button>
        <button onClick={() => setTool('text')} style={btnStyle(tool === 'text')}>📦 Khung chữ</button>

        <span style={{ color: '#9ca3af', fontSize: 11 }}>Cỡ nét:</span>
        {PEN_SIZES.map((s, i) => (
          <button
            key={i}
            onClick={() => setSizeIdx(i)}
            style={{
              padding: '5px 10px',
              borderRadius: 8,
              border: sizeIdx === i ? '2px solid #60a5fa' : '1px solid #4b5563',
              background: sizeIdx === i ? '#1d4ed8' : '#374151',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{ display: 'inline-block', width: s.w + 4, height: s.w + 4, background: '#fff', borderRadius: '50%' }} />
            {s.label}
          </button>
        ))}

        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: c,
              border: color === c ? '3px solid #fff' : '1px solid #6b7280',
              cursor: 'pointer',
            }}
            title="Màu mực"
          />
        ))}

        <span style={{ flex: 1 }} />

        <button onClick={rotate90} style={btnStyle(false)} title="Xoay 90°">↻ Xoay</button>
        <button onClick={flipH} style={btnStyle(false)} title="Lật ngang (gương)">↔ Lật</button>
        <button onClick={undo} disabled={!canUndo} style={{ ...btnStyle(false), opacity: canUndo ? 1 : 0.4 }}>↩️ Undo</button>
        <button onClick={redo} disabled={!canRedo} style={{ ...btnStyle(false), opacity: canRedo ? 1 : 0.4 }}>↪️ Redo</button>
        <button onClick={clearAll} style={btnStyle(false)}>🗑️ Xóa hết</button>
        <button
          onClick={save}
          style={{
            padding: '7px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#059669',
            color: '#fff',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          💾 Lưu ảnh đã sửa
        </button>
        <button onClick={onCancel} style={btnStyle(false)}>Hủy</button>
      </div>

      {/* Vùng vẽ: ảnh gốc ở dưới + canvas nét vẽ phủ lên */}
      <div
        ref={wrapRef}
        style={{
          position: 'relative',
          background: '#1f1f1f',
          borderRadius: 10,
          overflow: 'auto',
          maxWidth: '96vw',
          maxHeight: '74vh',
          border: '1px solid #4b5563',
        }}
      >
        {dims ? null : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              background: '#1f1f1f',
            }}
          >
            Đang tải ảnh…
          </div>
        )}
        <div
          style={{
            position: 'relative',
            width: dims ? dims.w : 300,
            height: dims ? dims.h : 300,
          }}
        >
          <canvas
            ref={baseRef}
            style={{ position: 'absolute', left: 0, top: 0, display: 'block' }}
          />
          <canvas
            ref={canvasRef}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              display: 'block',
              touchAction: 'none',
              cursor: tool === 'text' ? 'crosshair' : 'crosshair',
            }}
          />
            {/* Preview khung chữ khi kéo */}
            {previewBox && (
              <div
                style={{
                  position: 'absolute',
                  left: previewBox.x,
                  top: previewBox.y,
                  width: previewBox.w,
                  height: previewBox.h,
                  border: '2px dashed #60a5fa',
                  pointerEvents: 'none',
                }}
              />
            )}
            {/* Editor khung chữ */}
            {textEditor && (
              <div
                style={{
                  position: 'absolute',
                  left: textEditor.x,
                  top: textEditor.y,
                  width: textEditor.w,
                  minHeight: textEditor.h,
                  background: '#fff',
                  border: `2.5px solid ${color}`,
                  borderRadius: 8,
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  zIndex: 5,
                }}
              >
                <textarea
                  autoFocus
                  value={textEditor.text}
                  onChange={(e) => setTextEditor({ ...textEditor, text: e.target.value })}
                  placeholder="Nhập nhận xét/ghi chú..."
                  rows={2}
                  style={{
                    width: '100%',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    fontSize: 15,
                    fontFamily: 'Arial, sans-serif',
                    color,
                    background: 'transparent',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setTextEditor(null)}
                    style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#f3f4f6', cursor: 'pointer', fontSize: 12 }}
                  >
                    Hủy
                  </button>
                  <button
                    onClick={commitTextBox}
                    style={{ padding: '3px 12px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    ✓ Chèn
                  </button>
                </div>
              </div>
            )}
        </div>
      </div>

      <p style={{ color: '#9ca3af', fontSize: 12 }}>
        🖊️ Bút mực · 🖍️ Bút nhũ · 🧽 Tẩy · 📦 kéo khung chèn nhận xét · ↻ xoay ảnh · ↔ lật ảnh · ↩️↪️ Undo/Redo · 💾 lưu gửi học sinh
      </p>
    </div>
  );
}
