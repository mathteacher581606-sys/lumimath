'use client';

import { useEffect, useRef, useState } from 'react';
import { isImageFile } from '@/lib/image-upload';

// file: ảnh chọn trên máy (chưa có nếu khôi phục từ bài làm dở); url: đã tải lên máy chủ
export type UpImage = {
  id: string;
  file?: File;
  preview: string;
  url?: string;
  status?: 'uploading' | 'done' | 'error';
  error?: string;
};

// Tải nhiều ảnh: chụp ảnh / chọn ảnh / kéo thả, sắp xếp thứ tự, xoay 90°, xoá.
// Có `upload` → ảnh được tải lên NGAY khi chọn (không đợi bấm nộp): điện thoại mở camera
// xong có thể tải lại trang, ảnh đã lên máy chủ thì không mất.
export default function ImageUploader({
  images,
  onChange,
  disabled,
  upload,
  onPickStart,
  onPickEnd,
}: {
  images: UpImage[];
  onChange: (next: UpImage[]) => void;
  disabled?: boolean;
  upload?: (img: UpImage) => Promise<string>;
  // Báo cho trang làm bài: đang mở camera / thư viện ảnh (không tính là rời trang)
  onPickStart?: () => void;
  onPickEnd?: () => void;
}) {
  const pickRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState('');

  // Bản mới nhất của danh sách: các lượt tải xong cùng lúc không ghi đè lẫn nhau
  const latest = useRef(images);
  latest.current = images;
  function commit(next: UpImage[]) {
    latest.current = next;
    onChange(next);
  }
  function patch(id: string, p: Partial<UpImage>) {
    commit(latest.current.map((x) => (x.id === id ? { ...x, ...p } : x)));
  }

  // Tải lần lượt từng ảnh (giữ đúng thứ tự, không dồn mạng)
  const queue = useRef<Promise<void>>(Promise.resolve());
  function startUpload(img: UpImage) {
    if (!upload || !img.file) return;
    queue.current = queue.current.then(async () => {
      if (!latest.current.some((x) => x.id === img.id)) return; // đã bị xoá
      try {
        const url = await upload(img);
        patch(img.id, { url, status: 'done', error: undefined });
      } catch (e: any) {
        patch(img.id, { status: 'error', error: e?.message || 'Không tải được ảnh' });
      }
    });
  }

  // Huỷ chọn ảnh (Chrome 113+, Safari 16.4+) cũng là "đã quay lại trang"
  useEffect(() => {
    const els = [pickRef.current, camRef.current].filter(Boolean) as HTMLInputElement[];
    const end = () => onPickEnd?.();
    els.forEach((el) => el.addEventListener('cancel', end));
    return () => els.forEach((el) => el.removeEventListener('cancel', end));
  }, [onPickEnd]);

  function openPicker(which: 'pick' | 'cam') {
    if (disabled) return;
    onPickStart?.();
    (which === 'cam' ? camRef : pickRef).current?.click();
  }

  function addFiles(files: FileList | File[]) {
    const all = Array.from(files);
    const imgs = all.filter(isImageFile);
    setNotice(
      imgs.length < all.length
        ? `Bỏ qua ${all.length - imgs.length} tệp không phải ảnh.`
        : '',
    );
    const added: UpImage[] = imgs.map((f) => ({
      id: Math.random().toString(36).slice(2),
      file: f,
      preview: URL.createObjectURL(f),
      status: upload ? 'uploading' : undefined,
    }));
    commit([...latest.current, ...added]);
    added.forEach(startUpload);
  }

  // Xoay 90° một ảnh ngay trên máy (ảnh đã tải → tải lại bản đã xoay)
  function rotate(idx: number) {
    const img = latest.current[idx];
    if (!img) return;
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = el.naturalHeight;
      canvas.height = el.naturalWidth;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.translate(canvas.width, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(el, 0, 0);
      canvas.toBlob(
        (blob) => {
          canvas.width = 0;
          canvas.height = 0;
          if (!blob) {
            setNotice('Ảnh quá lớn để xoay trên máy này.');
            return;
          }
          const newFile = new File([blob], (img.file?.name || 'anh').replace(/\.[^.]+$/, '') + '.jpg', {
            type: 'image/jpeg',
          });
          const next: UpImage = {
            ...img,
            file: newFile,
            preview: URL.createObjectURL(newFile),
            url: undefined,
            status: upload ? 'uploading' : undefined,
            error: undefined,
          };
          commit(latest.current.map((x) => (x.id === img.id ? next : x)));
          startUpload(next);
        },
        'image/jpeg',
        0.9,
      );
    };
    el.onerror = () => setNotice('Không xoay được ảnh này.');
    el.src = img.preview;
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    const cur = latest.current;
    if (j < 0 || j >= cur.length) return;
    const next = [...cur];
    [next[idx], next[j]] = [next[j], next[idx]];
    commit(next);
  }

  function remove(idx: number) {
    const img = latest.current[idx];
    if (img?.file && img.preview.startsWith('blob:')) URL.revokeObjectURL(img.preview);
    commit(latest.current.filter((_, i) => i !== idx));
  }

  function retry(idx: number) {
    const img = latest.current[idx];
    if (!img) return;
    patch(img.id, { status: 'uploading', error: undefined });
    startUpload(img);
  }

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    onPickEnd?.();
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <div className="iu">
      <div
        className={`iu-drop${dragOver ? ' is-over' : ''}${disabled ? ' is-disabled' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled && e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
      >
        <div className="iu-actions">
          <button type="button" className="iu-btn is-primary" disabled={disabled} onClick={() => openPicker('cam')}>
            Chụp ảnh
          </button>
          <button type="button" className="iu-btn" disabled={disabled} onClick={() => openPicker('pick')}>
            Chọn ảnh có sẵn
          </button>
        </div>
        <div className="iu-hint">
          {disabled ? 'Đang xử lý…' : 'Hoặc kéo thả ảnh vào đây · chọn nhiều ảnh được, sắp xếp và xoay sau'}
        </div>
        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          disabled={disabled}
          onChange={onFiles}
        />
        <input ref={pickRef} type="file" accept="image/*" multiple hidden disabled={disabled} onChange={onFiles} />
      </div>
      {notice && (
        <p className="iu-notice" role="status">
          {notice}
        </p>
      )}

      {images.length > 0 && (
        <ol className="iu-list" aria-label="Ảnh bài làm">
          {images.map((img, i) => (
            <li key={img.id} className={`iu-item${img.status === 'error' ? ' is-error' : ''}`}>
              <img src={img.preview} alt={`Ảnh ${i + 1}`} />
              <span className="iu-num">{i + 1}</span>
              {img.status === 'uploading' && <span className="iu-state">Đang tải…</span>}
              {img.status === 'done' && <span className="iu-state is-done">Đã lưu</span>}
              {img.status === 'error' && (
                <button type="button" className="iu-state is-error" onClick={() => retry(i)} title={img.error}>
                  Lỗi · thử lại
                </button>
              )}
              <div className="iu-tools">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Đưa lên trước">
                  ‹
                </button>
                <button type="button" onClick={() => rotate(i)} aria-label="Xoay 90 độ">
                  ↻
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} aria-label="Đưa ra sau">
                  ›
                </button>
                <button type="button" className="is-danger" onClick={() => remove(i)} aria-label="Xoá ảnh">
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {images.some((x) => x.status === 'error') && (
        <p className="iu-notice is-error" role="alert">
          {images.find((x) => x.status === 'error')?.error} — bấm “Lỗi · thử lại” trên ảnh.
        </p>
      )}
    </div>
  );
}
