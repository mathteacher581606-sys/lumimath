// Xuất đề thi ra file Word (.docx) — KHÔNG gọi AI, không tốn token
// Công thức LaTeX → OMML (phương trình Word chuẩn, MathType nhận diện + Toggle TeX được)
// Fallback: văn bản TeX \(...\) → PNG ảnh nếu cả hai đều lỗi
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const MATH_DIR = path.join(process.cwd(), 'storage', 'mathpng');
const mathCache = new Map<string, Buffer>();

function mathHash(tex: string): string {
  return crypto.createHash('md5').update(tex).digest('hex');
}

// PDF → PNG (pdfjs-dist + canvas)
async function pdfToPng(pdf: Buffer): Promise<Buffer> {
  const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const doc = await pdfjsLib
    .getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, isEvalSupported: false })
    .promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const png = canvas.toBuffer('image/png');
  try {
    await doc.destroy();
  } catch {
    /* bỏ qua */
  }
  return png;
}

// Render công thức LaTeX → PNG (cache 3 lớp: RAM → đĩa → biên dịch)
export async function renderMathPng(tex: string): Promise<Buffer | null> {
  const clean = (tex || '').trim();
  if (!clean) return null;
  const hash = mathHash(clean);
  if (mathCache.has(hash)) return mathCache.get(hash)!;

  const diskPath = path.join(MATH_DIR, `${hash}.png`);
  try {
    if (fs.existsSync(diskPath)) {
      const buf = fs.readFileSync(diskPath);
      mathCache.set(hash, buf);
      return buf;
    }
  } catch {
    /* đọc lỗi → render lại */
  }

  const source = [
    '\\documentclass[border=1pt]{standalone}',
    '\\usepackage{amsmath}',
    '\\usepackage{amssymb}',
    '\\usepackage{vntex}',
    '\\begin{document}',
    '$\\displaystyle ' + clean.replace(/\n/g, ' ') + '$',
    '\\end{document}',
  ].join('\n');

  try {
    const res = await fetch(`${process.env.LATEX_SERVICE_URL}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, images: [] }),
    });
    if (!res.ok) return null;
    const pdf = Buffer.from(await res.arrayBuffer());
    const png = await pdfToPng(pdf);
    mathCache.set(hash, png);
    if (mathCache.size >= 300) {
      const firstKey = mathCache.keys().next().value;
      if (firstKey) mathCache.delete(firstKey);
    }
    try {
      if (!fs.existsSync(MATH_DIR)) fs.mkdirSync(MATH_DIR, { recursive: true });
      fs.writeFileSync(diskPath, png);
    } catch {
      /* không ghi được cache đĩa → vẫn trả PNG */
    }
    return png;
  } catch {
    return null;
  }
}

// Đọc kích thước PNG từ header
export function pngSize(buf: Buffer): { w: number; h: number } {
  try {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  } catch {
    return { w: 200, h: 40 };
  }
}

type Segment = { type: 'text' | 'math' | 'tikz'; value: string; display?: boolean };

// Tách nội dung thành đoạn văn bản, công thức ($...$, $$...$$) và hình vẽ (tikz/tabular)
export function splitMixed(content: string): Segment[] {
  const segs: Segment[] = [];
  const re =
    /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\\begin\{(tikz[a-zA-Z]*|tabular)\}(\[[^\]]*\])?[\s\S]*?\\end\{(tikz[a-zA-Z]*|tabular)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content || ''))) {
    if (m.index > last) {
      segs.push({ type: 'text', value: content.slice(last, m.index) });
    }
    if (m[1] !== undefined) segs.push({ type: 'math', value: m[1], display: true });
    else if (m[2] !== undefined) segs.push({ type: 'math', value: m[2] });
    else segs.push({ type: 'tikz', value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < (content || '').length) {
    segs.push({ type: 'text', value: content.slice(last) });
  }
  if (!segs.length) segs.push({ type: 'text', value: content || '' });
  return segs;
}

const PART_NAMES: Record<string, string> = {
  MCQ: 'PHẦN I. CÂU HỎI TRẮC NGHIỆM',
  TRUE_FALSE: 'PHẦN II. CÂU HỎI ĐÚNG/SAI',
  SHORT_ANSWER: 'PHẦN III. CÂU HỎI TRẢ LỜI NGẮN',
  ESSAY: 'PHẦN IV. CÂU HỎI TỰ LUẬN',
};

const ommlCache = new Map<string, string | null>();

// LaTeX → OMML (phương trình Word / MathType). Trả null nếu không chuyển được
async function latexToOmml(tex: string): Promise<string | null> {
  const clean = (tex || '').trim();
  if (!clean) return null;
  if (ommlCache.has(clean)) return ommlCache.get(clean)!;
  let out: string | null = null;
  try {
    const temmlMod: any = await import('temml');
    const temml = temmlMod.default ?? temmlMod;
    const mml = temml.renderToString(clean, { wrap: 'mathml' });
    const m2oMod: any = await import('mathml2omml');
    const m2o = m2oMod.default ?? m2oMod;
    const omml = m2o.mml2omml(mml);
    if (omml && String(omml).includes('<m:oMath')) out = String(omml);
  } catch {
    out = null;
  }
  if (ommlCache.size >= 500) {
    const firstKey = ommlCache.keys().next().value;
    if (firstKey) ommlCache.delete(firstKey);
  }
  ommlCache.set(clean, out);
  return out;
}

export async function buildExamDocx(opts: {
  title: string;
  school?: string;
  duration?: number;
  grade?: number | null;
  teacherName?: string;
  mathMode?: 'omml' | 'tex';
  items: {
    order: number;
    part: number;
    score: number;
    type: string;
    content: string;
    options: { id: string; text: string }[] | null;
    answer: any;
    solution?: string | null;
  }[];
  withAnswers: boolean;
}): Promise<Buffer> {
  const docx: any = await import('docx');
  const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, PageBreak } = docx;

  const children: any[] = [];

  // Tiêu đề trường
  if (opts.school) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: opts.school, bold: true, size: 24 })],
      }),
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: opts.title,
          bold: true,
          size: 28,
        }),
      ],
      spacing: { after: 100 },
    }),
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Thời gian làm bài: ${opts.duration ?? 45} phút${
            opts.grade ? ` · Khối ${opts.grade}` : ''
          }${opts.teacherName ? ` · GV: ${opts.teacherName}` : ''}`,
          italics: true,
          size: 20,
        }),
      ],
      spacing: { after: 200 },
    }),
  );

  // Render công thức thành ảnh (tuần tự để không làm cạn RAM VPS)
  const mathImgCache = new Map<string, Buffer | null>();
  async function mathImage(tex: string): Promise<Buffer | null> {
    if (mathImgCache.has(tex)) return mathImgCache.get(tex)!;
    const buf = await renderMathPng(tex);
    mathImgCache.set(tex, buf);
    return buf;
  }

  // Công thức → OMML (phương trình Word chuẩn); thu gom để chèn sau khi đóng gói
  const ommlParts: string[] = [];
  const mathMode = opts.mathMode || 'omml';

  async function mixedRuns(content: string): Promise<any[]> {
    const runs: any[] = [];
    for (const seg of splitMixed(content)) {
      if (seg.type === 'text') {
        if (seg.value.trim()) runs.push(new TextRun({ text: seg.value, size: 22 }));
        continue;
      }
      if (seg.type === 'tikz') {
        // Hình vẽ tikz/tabular: lấy ảnh ĐÃ BIÊN DỊCH từ cache trên server chèn vào Word
        const hash = crypto
          .createHash('md5')
          .update((seg.value || '').trim())
          .digest('hex');
        const pngPath = path.join(process.cwd(), 'storage', 'tikz', hash + '.png');
        let png: Buffer | null = null;
        try {
          if (fs.existsSync(pngPath)) png = fs.readFileSync(pngPath);
        } catch {
          png = null;
        }
        if (png) {
          const { w, h } = pngSize(png);
          const scale = Math.min(1, 620 / w, 420 / h);
          runs.push(
            new ImageRun({
              type: 'png',
              data: png,
              transformation: {
                width: Math.max(60, Math.round(w * scale)),
                height: Math.max(30, Math.round(h * scale)),
              },
            }),
          );
        } else {
          // Chưa có ảnh cache → chèn mã nguồn để không mất nội dung
          runs.push(
            new TextRun({
              text: '\n' + seg.value + '\n',
              size: 18,
              font: 'Consolas',
            }),
          );
        }
        continue;
      }
      // Công thức toán
      if (mathMode === 'tex') {
        // Chế độ cú pháp TeX: chuẩn MathType Toggle TeX — công thức bọc trong ${...}$
        // (nếu nội dung gốc đã bọc {...} thì gỡ để không bị 2 lớp ngoặc)
        let inner = seg.value.replace(/\n/g, ' ').trim();
        if (inner.startsWith('{') && inner.endsWith('}')) {
          inner = inner.slice(1, -1);
        }
        runs.push(
          new TextRun({
            text: '${' + inner + '}$',
            size: 22,
            italics: true,
          }),
        );
        continue;
      }
      // Chế độ mặc định: phương trình OMML — Word hiển thị chuẩn
      let ommlTex = seg.value.replace(/\n/g, ' ').trim();
      if (ommlTex.startsWith('{') && ommlTex.endsWith('}')) {
        ommlTex = ommlTex.slice(1, -1);
      }
      const omml = await latexToOmml(ommlTex);
      if (omml) {
        const idx = ommlParts.length;
        ommlParts.push(omml);
        runs.push(new TextRun({ text: `%%OMATH${idx}%%`, size: 22 }));
        continue;
      }
      // Fallback 2: văn bản TeX bọc ${...}$ — MathType Convert Equations đọc được
      const png = await mathImage(seg.value);
      if (!png) {
        let inner = seg.value.replace(/\n/g, ' ').trim();
        if (inner.startsWith('{') && inner.endsWith('}')) {
          inner = inner.slice(1, -1);
        }
        runs.push(
          new TextRun({
            text: '${' + inner + '}$',
            size: 22,
            italics: true,
          }),
        );
        continue;
      }
      // Fallback 3: ảnh PNG
      const { w, h } = pngSize(png);
      const scale = Math.min(1, 640 / w, (seg.display ? 90 : 44) / h);
      runs.push(
        new ImageRun({
          type: 'png',
          data: png,
          transformation: {
            width: Math.max(12, Math.round(w * scale)),
            height: Math.max(8, Math.round(h * scale)),
          },
        }),
      );
    }
    if (!runs.length) runs.push(new TextRun({ text: ' ', size: 22 }));
    return runs;
  }

  // Gom theo phần
  const parts = new Map<number, typeof opts.items>();
  for (const it of opts.items) {
    if (!parts.has(it.part)) parts.set(it.part, []);
    parts.get(it.part)!.push(it);
  }
  let totalScore = 0;

  const orderedParts = [...parts.entries()].sort((a, b) => a[0] - b[0]);
  for (const [partNo, items] of orderedParts) {
    const first = items[0];
    const partScore = items.reduce((s, i) => s + i.score, 0);
    totalScore += partScore;
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [
          new TextRun({
            text: `${PART_NAMES[first.type] || `PHẦN ${partNo}`} (${partScore} điểm)`,
            bold: true,
            size: 24,
          }),
        ],
      }),
    );

    let idx = 0;
    for (const it of items) {
      idx++;
      const runs = await mixedRuns(it.content);
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [new TextRun({ text: `Câu ${idx} (${it.score} điểm). `, bold: true, size: 22 }), ...runs],
        }),
      );

      if (it.type === 'MCQ' && it.options?.length) {
        for (const opt of it.options) {
          children.push(
            new Paragraph({
              indent: { left: 480 },
              spacing: { after: 20 },
              children: [new TextRun({ text: `${opt.id}. `, bold: true, size: 22 }), ...(await mixedRuns(opt.text))],
            }),
          );
        }
      } else if (it.type === 'TRUE_FALSE' && it.options?.length) {
        for (const opt of it.options) {
          children.push(
            new Paragraph({
              indent: { left: 480 },
              spacing: { after: 20 },
              children: [new TextRun({ text: `${opt.id}. `, bold: true, size: 22 }), ...(await mixedRuns(opt.text)), new TextRun({ text: '   □ Đúng    □ Sai', size: 22 })],
            }),
          );
        }
      } else if (it.type === 'SHORT_ANSWER') {
        children.push(
          new Paragraph({
            indent: { left: 480 },
            spacing: { after: 40 },
            children: [new TextRun({ text: 'Trả lời: ……………………………………………………', size: 22 })],
          }),
        );
      } else if (it.type === 'ESSAY') {
        children.push(
          new Paragraph({
            indent: { left: 480 },
            spacing: { after: 160 },
            children: [new TextRun({ text: '…………………………………………………………………………………………………………………', size: 22 })],
          }),
        );
      }
    }
  }

  // Đáp án (chỉ GV)
  if (opts.withAnswers) {
    children.push(
      new Paragraph({
        spacing: { before: 300, after: 100 },
        children: [
          new TextRun({ text: 'ĐÁP ÁN — DÀNH CHO GIÁO VIÊN', bold: true, size: 26, color: 'C00000' }),
        ],
      }),
    );
    let idx = 0;
    for (const it of opts.items) {
      idx++;
      let ansText = '';
      if (it.type === 'MCQ') {
        const opt = it.options?.find((o) => o.id === it.answer);
        ansText = `${it.answer}${opt ? '. ' + opt.text : ''}`;
      } else if (it.type === 'TRUE_FALSE') {
        const ans = it.answer as any;
        const bits: string[] = [];
        for (const opt of it.options || []) {
          bits.push(`${opt.id}: ${ans?.[opt.id] === true ? 'Đúng' : 'Sai'}`);
        }
        ansText = bits.join(' · ');
      } else {
        ansText = typeof it.answer === 'string' ? it.answer : JSON.stringify(it.answer ?? '');
      }
      const ansRuns = await mixedRuns(ansText);
      children.push(
        new Paragraph({
          spacing: { after: 30 },
          children: [new TextRun({ text: `Câu ${idx}: `, bold: true, size: 22 }), ...ansRuns],
        }),
      );
      if (it.solution) {
        children.push(
          new Paragraph({
            indent: { left: 480 },
            spacing: { after: 60 },
            children: [new TextRun({ text: 'Lời giải: ', italics: true, size: 20 }), ...(await mixedRuns(it.solution))],
          }),
        );
      }
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  let buffer: Buffer = await Packer.toBuffer(doc);

  // Chèn các phương trình OMML vào vị trí placeholder (sau khi đóng gói zip)
  if (ommlParts.length) {
    const AdmZipMod: any = await import('adm-zip');
    const AdmZip = AdmZipMod.default ?? AdmZipMod;
    const zip = new AdmZip(buffer);
    let xml = zip.readAsText('word/document.xml');
    ommlParts.forEach((omml, i) => {
      xml = xml.split(`%%OMATH${i}%%`).join(omml);
    });
    zip.updateFile('word/document.xml', Buffer.from(xml, 'utf8'));
    buffer = zip.toBuffer();
  }
  return buffer;
}
