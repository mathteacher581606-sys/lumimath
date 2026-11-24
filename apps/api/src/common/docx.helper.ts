// Xuất đề thi ra Word (.docx) — KHÔNG gọi AI, KHÔNG dùng thư viện ngoài, KHÔNG gọi API ngoài.
// Công thức LaTeX → phương trình Word gốc (OMML): bấm vào sửa được; MathType: Convert Equations.
// Bộ chuyển + bố cục nằm trong ./word/ (omml.ts, blocks.ts, docx.ts, exam-docx.ts).
import * as fs from 'fs';
import * as path from 'path';
import type { ImgData } from './word/blocks';
import { buildExamDocxV2, DocxItem, ExamDocxOptions } from './word/exam-docx';

export type { DocxItem, ExamDocxOptions };

const UPLOAD_DIR = path.join(process.cwd(), 'storage', 'uploads');

function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  return null;
}

function jpegSize(buf: Buffer): { w: number; h: number } | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15 (trừ DHT/JPG/DAC) chứa kích thước
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/**
 * Đọc ảnh đã tải lên (/api/uploads/x.png | /uploads/x | tên file) → dữ liệu chèn vào Word.
 * PNG/JPEG dùng thẳng; webp/gif/bmp đổi sang PNG bằng @napi-rs/canvas (đã có sẵn trong API).
 * Kích thước trả về theo 96 dpi, giới hạn 1600px để file Word không quá nặng.
 */
export async function loadUploadImage(url: string): Promise<ImgData | null> {
  const m = /(?:^|\/)(?:api\/)?uploads\/([A-Za-z0-9._-]+)\s*$/.exec(String(url || '').trim()) ||
    /^([A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif|bmp))$/i.exec(String(url || '').trim());
  if (!m) return null;
  const file = path.join(UPLOAD_DIR, m[1]);
  if (!file.startsWith(UPLOAD_DIR) || !fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  const ps = pngSize(buf);
  if (ps) return { data: buf, type: 'png', w: ps.w, h: ps.h };
  const js = jpegSize(buf);
  if (js) return { data: buf, type: 'jpeg', w: js.w, h: js.h };
  try {
    const { loadImage, createCanvas } = await import('@napi-rs/canvas');
    const img = await loadImage(buf);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toBuffer('image/png'), type: 'png', w: c.width, h: c.height };
  } catch {
    return null;
  }
}

/** Đề → .docx (giữ tên hàm cũ cho các nơi đang gọi) */
export async function buildExamDocx(opts: ExamDocxOptions): Promise<Buffer> {
  const { buffer } = await buildExamDocxV2({ loadImage: loadUploadImage, ...opts });
  return buffer;
}
