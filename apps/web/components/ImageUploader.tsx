'use client';

import { useRef, useState } from 'react';

export type UpImage = { id: string; file: File; preview: string };

// Tải nhiều ảnh: kéo thả, sắp xếp thứ tự, xoay 90°, xóa
export default function ImageUploader({
  images,
  onChange,
  disabled,
}: {
  images: UpImage[];
  onChange: (next: UpImage[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function addFiles(files: FileList | File[]) {
    const imgs = Array.from(files).filter((f) => f.type.startsWith('image/'));
    const added: UpImage[] = imgs.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      preview: URL.createObjectURL(f),
    }));
    onChange([...images, ...added]);
  }

  // Xoay 90° một ảnh (xử lý ngay trên máy, không cần server)
  function rotate(idx: number) {
    const img = images[idx];
    if (!img) return;
    const el = new Image();
    el.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = el.height;
      canvas.height = el.width;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(el, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const newFile = new File([blob], img.file.name || 'anh.jpg', {
          type: 'image/jpeg',
        });
        const next = [...images];
        next[idx] = { ...img, file: newFile, preview: URL.createObjectURL(newFile) };
        onChange(next);
      }, 'image/jpeg', 0.9);
    };
    el.src = img.preview;
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }

  function remove(idx: number) {
    const next = images.filter((_, i) => i !== idx);
    URL.revokeObjectURL(images[idx].preview);
    onChange(next);
  }

  return (
    <div>
      {/* Vùng kéo thả + nút chọn */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--color-accent)' : 'var(--color-rule)'}`,
          borderRadius: 10,
          padding: '14px',
          textAlign: 'center',
          cursor: disabled ? 'default' : 'pointer',
          background: dragOver
            ? 'color-mix(in oklch, var(--color-accent) 8%, var(--color-paper))'
            : 'var(--color-paper-2)',
          transition: 'all .15s',
        }}
      >
        <div style={{ fontSize: 22 }}>{dragOver ? '📥' : '📷'}</div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {disabled ? 'Đang tải ảnh…' : 'Kéo thả ảnh vào đây hoặc bấm để chọn'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
          Nhiều ảnh được · có thể sắp xếp thứ tự và xoay ảnh
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Danh sách ảnh với điều khiển */}
      {images.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {images.map((img, i) => (
            <div
              key={img.id}
              style={{
                position: 'relative',
                border: '1px solid var(--color-rule)',
                borderRadius: 8,
                overflow: 'hidden',
                width: 104,
                background: 'var(--color-paper)',
              }}
            >
              <img
                src={img.preview}
                alt={`Ảnh ${i + 1}`}
                style={{ width: 104, height: 104, objectFit: 'cover', display: 'block' }}
              />
              <span
                className="mono"
                style={{
                  position: 'absolute',
                  top: 3,
                  left: 3,
                  background: 'rgba(15,23,42,0.75)',
                  color: '#fff',
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 4,
                }}
              >
                {i + 1}
              </span>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: 2,
                  background: 'var(--color-paper-2)',
                }}
              >
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  title="Lùi lại"
                  style={{ ...miniBtn, opacity: i === 0 ? 0.35 : 1 }}
                >
                  ◀
                </button>
                <button type="button" onClick={() => rotate(i)} title="Xoay 90°" style={miniBtn}>
                  ↻
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === images.length - 1}
                  title="Tiến lên"
                  style={{ ...miniBtn, opacity: i === images.length - 1 ? 0.35 : 1 }}
                >
                  ▶
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  title="Xóa ảnh"
                  style={{ ...miniBtn, color: 'var(--color-danger)' }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 12,
  padding: '2px 5px',
  color: 'var(--color-ink)',
};
