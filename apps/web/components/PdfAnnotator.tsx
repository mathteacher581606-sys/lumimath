'use client';

import { useEffect, useState } from 'react';
import AnnotateBoard, { type BoardEl } from './AnnotateBoard';

// Polyfill Promise.withResolvers (pdfjs-dist v4+ yêu cầu — trình duyệt cũ không có)
if (typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function () {
    let resolve: any;
    let reject: any;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

export default function PdfAnnotator({
  pdfUrl,
  snapshot,
  onSave,
  onClose,
}: {
  pdfUrl: string;
  snapshot?: Record<number, BoardEl[]>;
  onSave: (map: Record<number, BoardEl[]>) => void;
  onClose: () => void;
}) {
  const [pages, setPages] = useState<{ n: number; dataUrl: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Record<number, BoardEl[]>>(snapshot || {});
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Nạp pdfjs lười (tránh crash toàn app nếu trình duyệt cũ)
        const pdfjsLib: any = await import('pdfjs-dist');
        const worker: any = await import('pdfjs-dist/build/pdf.worker.min.mjs');
        try {
          pdfjsLib.GlobalWorkerOptions.workerPort = new worker.WorkerMessageHandler();
        } catch {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs';
        }
        const pdf = await pdfjsLib.getDocument({ url: pdfUrl }).promise;
        const list: { n: number; dataUrl: string }[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvas, viewport }).promise;
          list.push({ n: i, dataUrl: canvas.toDataURL('image/png') });
        }
        if (!cancelled) setPages(list);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Lỗi mở PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(18,15,11,0.94)', zIndex: 94, display: 'flex', flexDirection: 'column' }}>
      {/* Thanh tiêu đề */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--lm-maroon)', color: '#fff' }}>
        <span style={{ fontWeight: 800, fontSize: 14 }}>📄 Chấm trực tiếp trên PDF bài làm</span>
        <span style={{ fontSize: 12, opacity: 0.85 }}>Bấm vào trang bất kỳ để vẽ (bút, highlight, tẩy, chữ, mũi tên)</span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => onSave(JSON.parse(JSON.stringify(strokes)))}
          style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#fff', color: 'var(--lm-maroon)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
        >
          💾 Lưu nét vẽ
        </button>
        <button
          onClick={onClose}
          style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Dải thumbnail các trang */}
        <div style={{ width: 150, overflowY: 'auto', padding: 10, background: '#26292f', flexShrink: 0 }}>
          {loading ? (
            <p style={{ color: '#aaa', fontSize: 12.5, textAlign: 'center', marginTop: 20 }}>Đang tải PDF…</p>
          ) : (
            pages.map((p) => (
              <div key={p.n} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#bbb', marginBottom: 3, fontWeight: 700 }}>
                  Trang {p.n}{' '}
                  {(strokes[p.n] || []).length > 0 && (
                    <span style={{ color: '#ff8f8f' }}>✏️ {(strokes[p.n] || []).length} nét</span>
                  )}
                </div>
                <div
                  onClick={() => setActive(p.n)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 6,
                    overflow: 'hidden',
                    border: active === p.n ? '2px solid var(--lm-amber)' : '1px solid #444',
                    opacity: 0.92,
                  }}
                >
                  <img src={p.dataUrl} alt={`Trang ${p.n}`} style={{ width: '100%', display: 'block' }} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Vùng trang hiện tại */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16, textAlign: 'center', background: '#1a1c20' }}>
          {error ? (
            <div style={{ color: '#ffb4b4', marginTop: 60, fontSize: 14 }}>
              ❌ Không mở được PDF: {error}
            </div>
          ) : loading ? (
            <p style={{ color: '#888', marginTop: 60 }}>⏳ Đang tải các trang PDF…</p>
          ) : pages.length === 0 ? (
            <p style={{ color: '#888', marginTop: 60 }}>Không có trang nào.</p>
          ) : (
            (active ? pages.filter((p) => p.n === active) : pages.slice(0, 1)).map((p) => (
              <div
                key={p.n}
                onClick={() => setActive(p.n)}
                title="Bấm để vẽ lên trang này"
                style={{
                  display: 'inline-block',
                  position: 'relative',
                  cursor: 'pointer',
                  borderRadius: 8,
                  overflow: 'hidden',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.55)',
                  marginBottom: 16,
                }}
              >
                <img src={p.dataUrl} alt={`Trang ${p.n}`} style={{ display: 'block', maxWidth: 'min(900px, 82vw)' }} />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.35)',
                    opacity: 0,
                    transition: 'opacity 0.15s',
                    fontSize: 16,
                    fontWeight: 800,
                    color: '#fff',
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0')}
                >
                  ✏️ Bấm để vẽ
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Bảng vẽ trên trang đang chọn */}
      {active !== null && pages.find((p) => p.n === active) && (
        <AnnotateBoard
          backgroundUrl={pages.find((p) => p.n === active)!.dataUrl}
          snapshot={strokes[active]}
          onSave={(els) => {
            setStrokes((prev) => ({ ...prev, [active]: els }));
          }}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
