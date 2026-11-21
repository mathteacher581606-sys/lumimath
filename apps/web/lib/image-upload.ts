// Tải ảnh bài làm lên máy chủ — dùng chung cho bài thi và bài tập.
//
// Vì sao cần: ảnh chụp từ điện thoại thường 4–12 MB, 12+ megapixel. Gửi nguyên ảnh qua 4G
// rất chậm, dễ đứt giữa chừng, và có máy (Android) trả file không có "type" → trước đây bị
// bỏ qua âm thầm. Ở đây: thu nhỏ + nén JPEG ngay trên máy (thường còn 300–800 KB),
// nhận cả file thiếu type, thử lại 1 lần khi mạng chập chờn.

const IMG_EXT = /\.(jpe?g|png|webp|gif|heic|heif|bmp|avif|jfif)$/i;

export function isImageFile(f: File): boolean {
  return (f.type || '').startsWith('image/') || (!f.type && IMG_EXT.test(f.name || ''));
}

function guessType(f: File): string {
  if (f.type) return f.type;
  const ext = ((f.name || '').split('.').pop() || '').toLowerCase();
  if (ext === 'heic' || ext === 'heif') return 'image/heic';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

type Decoded = { src: CanvasImageSource; w: number; h: number; close: () => void };

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      // from-image: xoay theo EXIF của điện thoại (ảnh chụp dọc không bị nằm ngang)
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as any);
      return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch (e) {
      /* trình duyệt cũ / tuỳ chọn không hỗ trợ → dùng thẻ <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

// Thu nhỏ cạnh dài về tối đa maxDim px và nén JPEG. Không giải mã được (VD: HEIC trên
// Chrome Android) → trả file gốc, máy chủ sẽ thử tiếp.
export async function prepareImage(file: File, maxDim = 2000, quality = 0.85): Promise<File> {
  const type = guessType(file);
  if (type === 'image/gif' || type === 'image/svg+xml') return file;
  let d: Decoded | null = null;
  try {
    d = await decode(file);
    const scale = Math.min(1, maxDim / Math.max(d.w, d.h));
    // Ảnh đã nhỏ và đúng định dạng phổ biến → giữ nguyên
    if (scale === 1 && file.size <= 900 * 1024 && /^image\/(jpeg|png|webp)$/.test(type)) return file;
    const cw = Math.max(1, Math.round(d.w * scale));
    const ch = Math.max(1, Math.round(d.h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // Nền trắng: ảnh PNG trong suốt khi sang JPEG không bị đen
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(d.src, 0, 0, cw, ch);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    // Giải phóng bộ nhớ canvas ngay (Safari iOS giới hạn tổng bộ nhớ canvas)
    canvas.width = 0;
    canvas.height = 0;
    if (!blob || blob.size < 4096) return file;
    const base = (file.name || 'anh').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch (e) {
    return file;
  } finally {
    d?.close();
  }
}

// Nén (nếu được) rồi tải lên; trả URL ảnh. Lỗi mạng/máy chủ tạm thời → thử lại 1 lần.
export async function uploadImage(file: File): Promise<string> {
  const ready = await prepareImage(file);
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  let lastErr: Error = new Error('Không tải được ảnh');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('/api/uploads/image', {
        method: 'POST',
        headers: {
          'Content-Type': guessType(ready),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: ready,
      });
      if (res.ok) {
        const data = await res.json();
        return data.url as string;
      }
      const err = await res.json().catch(() => ({}));
      lastErr = new Error(err.message || `Không tải được ảnh (mã ${res.status})`);
      // Lỗi do chính ảnh (quá lớn, định dạng) → thử lại cũng vô ích
      if (res.status < 500 && res.status !== 408 && res.status !== 429) break;
    } catch (e) {
      lastErr = new Error('Mạng yếu, chưa tải được ảnh — thử lại nhé');
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw lastErr;
}
