'use client';

// Xem bài đã chấm (chỉ đọc) — dùng cho học sinh sau khi giáo viên công bố điểm.
import { useEffect, useRef, useState } from 'react';
import { BoardEl, LW, drawEls } from '@/lib/board-render';
import { renderPdfPage, usePdfDoc } from '@/lib/pdf-doc';

function Overlay({ els, ar }: { els: BoardEl[]; ar: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = LW * 1.5;
    c.width = w;
    c.height = Math.round(w * ar);
    const ctx = c.getContext('2d')!;
    const k = w / LW;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawEls(ctx, els, 'all');
  }, [els, ar]);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}

const pageBox: React.CSSProperties = {
  position: 'relative',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-rule)',
  borderRadius: 8,
  overflow: 'hidden',
};

function MarkedImage({ url, els }: { url: string; els: BoardEl[] }) {
  const [ar, setAr] = useState(1.3);
  return (
    <div style={pageBox}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Bài làm đã chấm"
        style={{ display: 'block', width: '100%', height: 'auto' }}
        onLoad={(e) => {
          const im = e.currentTarget;
          if (im.naturalWidth) setAr(im.naturalHeight / im.naturalWidth);
        }}
      />
      <Overlay els={els} ar={ar} />
    </div>
  );
}

function MarkedPdfPage({ proxy, w, h, els }: { proxy: any; w: number; h: number; els: BoardEl[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const job = renderPdfPage(proxy, c, 1100);
    job.done.catch(() => {});
    return () => job.cancel();
  }, [proxy]);
  return (
    <div style={pageBox}>
      <canvas ref={ref} style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: `${w} / ${h}` }} />
      <Overlay els={els} ar={h / w} />
    </div>
  );
}

export default function MarkedView({
  imageUrls,
  pdfUrl,
  boardSnapshots,
  pdfBoard,
}: {
  imageUrls: string[];
  pdfUrl?: string | null;
  boardSnapshots?: Record<string, BoardEl[]> | null;
  pdfBoard?: Record<string, BoardEl[]> | null;
}) {
  const { doc, error, loading } = usePdfDoc(pdfUrl || null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {imageUrls.map((u) => (
        <MarkedImage key={u} url={u} els={(boardSnapshots && boardSnapshots[u]) || []} />
      ))}
      {pdfUrl && loading && <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Đang mở PDF…</div>}
      {pdfUrl && error && <div style={{ color: 'var(--color-danger)', fontSize: 13 }}>Không mở được PDF: {error}</div>}
      {doc &&
        doc.pages.map((p) => (
          <MarkedPdfPage key={p.pageNo} proxy={p.proxy} w={p.w} h={p.h} els={(pdfBoard && pdfBoard[String(p.pageNo)]) || []} />
        ))}
    </div>
  );
}
