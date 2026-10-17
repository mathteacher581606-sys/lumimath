'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import 'tldraw/tldraw.css';

const Tldraw = dynamic(() => import('tldraw').then((m) => m.Tldraw), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Đang tải bảng vẽ…</div>
  ),
});

const LICENSE_KEY =
  'tldraw-2026-10-30/WyJSTE16R2NyMCIsWyIqIl0sMTYsIjIwMjYtMTAtMzAiXQ.rW1J8MJEyBomfIfWO+sjwB841fT4iBWURB47Fw01yA7yoKWEj9cxUwHMaa6HazdTEbrY6K7sS/5bmDD534Axqw';

export default function TldrawBoard({
  backgroundUrl,
  snapshot,
  onSave,
  onClose,
}: {
  backgroundUrl: string;
  snapshot?: any;
  onSave: (snapshot: any) => void;
  onClose: () => void;
}) {
  const editorRef = useRef<any>(null);

  function mount(editor: any) {
    editorRef.current = editor;
    try {
      editor.updateInstanceState({ isGridMode: false });
    } catch {
      /* ignore */
    }
    if (snapshot) {
      try {
        editor.loadSnapshot(snapshot);
      } catch (e) {
        console.warn('Không nạp được nét vẽ cũ:', e);
      }
    }
    // Đưa ảnh bài làm vào làm nền (khóa lại để thầy vẽ lên trên)
    (async () => {
      try {
        if (backgroundUrl.startsWith('data:')) {
          const res = await fetch(backgroundUrl);
          const blob = await res.blob();
          const file = new File([blob], 'bailam.png', { type: 'image/png' });
          await editor.putExternalContent({ type: 'file', file, point: [0, 0] });
        } else {
          await editor.putExternalContent({ type: 'url', url: backgroundUrl, point: [0, 0] });
        }
        const imgs = editor.getCurrentPageShapes().filter((s: any) => s.type === 'image');
        editor.updateShapes(imgs.map((s: any) => ({ id: s.id, type: 'image', isLocked: true })));
        editor.zoomToContent();
      } catch (e) {
        console.warn('Không thêm được ảnh nền:', e);
      }
    })();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(18,15,11,0.92)', zIndex: 95, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--lm-maroon)', color: '#fff' }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>
          🎨 Bảng vẽ tldraw — bút, highlight, tẩy, chữ, mũi tên… (thử nghiệm 14 ngày)
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onSave(editorRef.current ? editorRef.current.getSnapshot() : null)}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#fff', color: 'var(--lm-maroon)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
          >
            💾 Lưu nét vẽ
          </button>
          <button
            onClick={onClose}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            ✕ Đóng
          </button>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <Tldraw licenseKey={LICENSE_KEY} onMount={mount} initialState="select" />
      </div>
    </div>
  );
}
