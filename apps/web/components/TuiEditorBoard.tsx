'use client';

import { useRef } from 'react';
import dynamic from 'next/dynamic';
import 'tui-image-editor/dist/tui-image-editor.css';

const ImageEditor = dynamic(() => import('@toast-ui/react-image-editor'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Đang tải trình soạn ảnh…</div>
  ),
});

const THEME = {
  'common.bisize.width': '0',
  'common.bisize.height': '0',
  'common.backgroundImage': 'none',
  'common.backgroundColor': '#f5efe2',
  'common.border': '1px solid #e5d5b8',
  'menu.backgroundColor': 'var(--lm-maroon)',
  'menu.normalIcon.color': '#fff',
  'menu.activeIcon.color': '#ffd27a',
  'menu.disabledIcon.color': '#a88',
  'menu.hoverIcon.color': '#ffd27a',
  'submenu.backgroundColor': '#fff8e7',
  'submenu.normalIcon.color': '#7b1113',
  'submenu.activeIcon.color': '#7b1113',
  'submenu.normalLabel.color': '#4a3a20',
  'submenu.activeLabel.color': '#7b1113',
  'loadButton.backgroundColor': '#e8a33d',
  'downloadButton.backgroundColor': '#e8a33d',
};

export default function TuiEditorBoard({
  imageUrl,
  onSave,
  onClose,
}: {
  imageUrl: string;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<any>(null);

  async function save() {
    const inst = ref.current?.getInstance?.();
    if (!inst) return;
    try {
      const r: any = inst.toDataURL();
      const dataUrl = typeof r === 'string' ? r : await r;
      onSave(dataUrl);
    } catch (e) {
      alert('Không lưu được ảnh: ' + (e as Error).message);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#1a1612', zIndex: 95, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'var(--lm-maroon)', color: '#fff' }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>
          🎨 Trình chấm ảnh — bút vẽ, chữ, hình, cắt, xoay, bộ lọc… (vẽ trực tiếp lên bài làm)
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={save}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#fff', color: 'var(--lm-maroon)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}
          >
            💾 Lưu vào bài
          </button>
          <button
            onClick={onClose}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            ✕ Đóng
          </button>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ImageEditor
          ref={ref}
          includeUI={{
            loadImage: { path: imageUrl, name: 'bailam' },
            theme: THEME,
            menu: ['draw', 'text', 'shape', 'crop', 'rotate', 'flip'],
            initMenu: 'draw',
            uiSize: { width: '100%', height: '100%' },
            menuBarPosition: 'bottom',
          }}
          cssMaxWidth={window ? window.innerWidth : 1200}
          cssMaxHeight={window ? window.innerHeight - 60 : 800}
          selectionStyle={{ cornerSize: 16, rotatingPointOffset: 60 }}
          usageStatistics={false}
        />
      </div>
    </div>
  );
}
