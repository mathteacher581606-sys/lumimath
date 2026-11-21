// Xuất "bài đã chấm" ra PDF ngay trên trình duyệt: vẽ nét chấm lên từng trang rồi ghép thành PDF.
// Không cần thư viện thêm và không tốn tài nguyên máy chủ (VPS chỉ 2GB).
import { BoardEl, LW, drawEls } from '@/lib/board-render';
import { loadPdfDoc, renderPdfPage } from '@/lib/pdf-doc';

const MAX_W = 1600; // bề rộng tối đa mỗi trang xuất ra (giữ file nhẹ)

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Không tải được ảnh bài làm'));
    im.src = url;
  });
}

function stamp(canvas: HTMLCanvasElement, els: BoardEl[]) {
  if (!els || !els.length) return;
  const ctx = canvas.getContext('2d')!;
  const k = canvas.width / LW;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  drawEls(ctx, els, 'all');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) return reject(new Error('Không tạo được ảnh trang'));
        b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)), reject);
      },
      'image/jpeg',
      0.86,
    );
  });
}

type Page = { data: Uint8Array; w: number; h: number };

export function buildPdf(pages: Page[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (u: Uint8Array) => {
    parts.push(u);
    len += u.length;
  };
  const str = (s: string) => push(enc.encode(s));
  const obj = (id: number, body: () => void) => {
    offsets[id] = len;
    str(`${id} 0 obj\n`);
    body();
    str('endobj\n');
  };
  str('%PDF-1.4\n');
  obj(1, () => str('<< /Type /Catalog /Pages 2 0 R >>\n'));
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(2, () => str(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\n`));
  pages.forEach((p, i) => {
    const pw = 595.28;
    const ph = Math.round(((pw * p.h) / p.w) * 100) / 100;
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(3 + i * 3, () =>
      str(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${5 + i * 3} 0 R >> >> /Contents ${4 + i * 3} 0 R >>\n`),
    );
    obj(4 + i * 3, () => str(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\n`));
    obj(5 + i * 3, () => {
      str(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.data.length} >>\nstream\n`);
      push(p.data);
      str('\nendstream\n');
    });
  });
  const total = 2 + pages.length * 3;
  const xref = len;
  str(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= total; id++) str(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  str(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

export async function exportMarkedPdf(opts: {
  imageUrls: string[];
  pdfUrl?: string | null;
  boardSnapshots?: Record<string, BoardEl[]> | null;
  pdfBoard?: Record<string, BoardEl[]> | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<Blob> {
  const pages: Page[] = [];
  const imgs = opts.imageUrls || [];
  let pdf: Awaited<ReturnType<typeof loadPdfDoc>> | null = null;
  if (opts.pdfUrl) pdf = await loadPdfDoc(opts.pdfUrl);
  const total = imgs.length + (pdf ? pdf.pages.length : 0);
  let done = 0;

  for (const u of imgs) {
    const im = await loadImage(u);
    const w = Math.min(MAX_W, im.naturalWidth);
    const h = Math.round((w * im.naturalHeight) / im.naturalWidth);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(im, 0, 0, w, h);
    stamp(c, (opts.boardSnapshots && opts.boardSnapshots[u]) || []);
    pages.push({ data: await toJpeg(c), w, h });
    opts.onProgress?.(++done, total);
  }
  if (pdf) {
    for (const p of pdf.pages) {
      const c = document.createElement('canvas');
      await renderPdfPage(p.proxy, c, MAX_W).done;
      const ctx = c.getContext('2d')!;
      // PDF có thể có nền trong suốt → tô trắng phía sau
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'source-over';
      stamp(c, (opts.pdfBoard && opts.pdfBoard[String(p.pageNo)]) || []);
      pages.push({ data: await toJpeg(c), w: c.width, h: c.height });
      opts.onProgress?.(++done, total);
    }
  }
  if (!pages.length) throw new Error('Bài nộp không có ảnh hoặc PDF để xuất');
  return buildPdf(pages);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Có nét chấm nào để hiển thị/xuất không */
export function hasMarks(
  marks: { boardSnapshots?: Record<string, BoardEl[]>; pdfBoard?: Record<string, BoardEl[]> } | null | undefined,
): boolean {
  if (!marks) return false;
  for (const m of [marks.boardSnapshots, marks.pdfBoard]) {
    if (!m) continue;
    for (const k of Object.keys(m)) if (Array.isArray(m[k]) && m[k].length) return true;
  }
  return false;
}
