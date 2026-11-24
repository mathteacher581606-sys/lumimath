/**
 * Đề thi → Word (.docx) theo mẫu đề 2025, công thức là phương trình Word (sửa được).
 * Dùng cho: đề thi, đáp án, câu hỏi ngân hàng, phiếu học tập, xuất từ ma trận, trộn đề.
 */
import { partInstruction, ROMAN, viScore } from '../exam-format';
import { Block, BlockCtx, contentToBlocks, DocStats, ImgData, Inline, newStats, visualLength } from './blocks';
import { DocxWriter } from './docx';

export type DocxItem = {
  order: number;
  part: number;
  score: number;
  type: string;
  content: string;
  options: { id: string; text: string }[] | null;
  answer: any;
  solution?: string | null;
};

export type ExamDocxOptions = {
  title: string;
  school?: string;
  duration?: number | null;
  grade?: number | null;
  teacherName?: string;
  code?: string; // mã đề
  mathMode?: 'omml' | 'tex';
  numbering?: 'part' | 'continuous';
  header?: boolean; // khung đầu đề (mặc định có)
  partHeadings?: boolean; // tiêu đề PHẦN (mặc định có)
  items: DocxItem[];
  withAnswers: boolean;
  renderTikz?: (snippet: string) => Promise<Buffer | null>;
  loadImage?: (url: string) => Promise<ImgData | null>;
};

const RED = 'C00000';

function t(text: string, extra: Partial<Extract<Inline, { k: 'text' }>> = {}): Inline {
  return { k: 'text', text, ...extra };
}

function p(runs: Inline[], extra: Partial<Extract<Block, { k: 'p' }>> = {}): Block {
  return { k: 'p', runs, ...extra };
}

/** Gắn nhãn (Câu 1., A., a)…) vào đầu khối nội dung đầu tiên */
function withLabel(label: Inline[], blocks: Block[]): Block[] {
  const out = [...blocks];
  const first = out[0];
  if (first && first.k === 'p') out[0] = { ...first, runs: [...label, ...first.runs] };
  else if (first && first.k === 'table' && !first.borders && first.rows[0]?.[0]) {
    // \immini (bảng 2 cột chữ | hình): nhãn đặt vào đầu ô chữ bên trái
    const c0 = first.rows[0][0];
    out[0] = {
      ...first,
      rows: [[{ ...c0, blocks: withLabel(label, c0.blocks) }, ...first.rows[0].slice(1)], ...first.rows.slice(1)],
    };
  } else out.unshift(p(label));
  return out;
}

export async function buildExamDocxV2(o: ExamDocxOptions): Promise<{ buffer: Buffer; stats: DocStats }> {
  const writer = new DocxWriter({ top: 850, bottom: 850, left: 1020, right: 850, fontSize: 12 });
  const W = writer.contentWidth;
  const stats = newStats();
  const ctx = (width = W): BlockCtx => ({
    mathMode: o.mathMode || 'omml',
    renderTikz: o.renderTikz,
    loadImage: o.loadImage,
    width,
    stats,
  });
  const numbering = o.numbering || 'part';
  const blocks: Block[] = [];

  // ===== Khung đầu đề =====
  if (o.header !== false) {
    const wl = Math.round(W * 0.4);
    const left: Block[] = [
      p([t((o.school || '………………………………').toUpperCase(), { b: true })], { align: 'center', after: 0 }),
      p([t('──────────')], { align: 'center', after: 0 }),
    ];
    if (o.code) {
      left.push(p([t('Mã đề: ', { b: true }), t(o.code, { b: true })], { align: 'center', before: 60, after: 0 }));
    }
    const right: Block[] = [
      p([t(o.title.toUpperCase(), { b: true })], { align: 'center', after: 0 }),
      p([t('Môn: TOÁN' + (o.grade ? ` – Lớp ${o.grade}` : ''), { b: true })], { align: 'center', after: 0 }),
    ];
    if (o.duration) {
      right.push(p([t(`Thời gian làm bài: ${o.duration} phút, không kể thời gian phát đề`, { i: true })], { align: 'center', after: 0 }));
    }
    blocks.push({ k: 'table', borders: false, widths: [wl, W - wl], rows: [[{ blocks: left }, { blocks: right }]] });
    blocks.push(
      p([t('Họ và tên thí sinh: ……………………………………………… Số báo danh: ………………………')], { before: 160, after: 120 }),
    );
  } else {
    blocks.push(p([t(o.title.toUpperCase(), { b: true })], { align: 'center', after: 120 }));
  }

  // ===== Gom các câu liên tiếp cùng phần =====
  const groups: { part: number; items: DocxItem[] }[] = [];
  for (const it of o.items) {
    const g = groups[groups.length - 1];
    if (g && g.part === it.part) g.items.push(it);
    else groups.push({ part: it.part, items: [it] });
  }

  const keyRows: { group: number; label: string; type: string; key: string }[] = [];
  let run = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const type = g.items[0]?.type;
    const from = numbering === 'part' ? 1 : run + 1;
    const to = from + g.items.length - 1;
    if (o.partHeadings !== false) {
      const score = g.items.reduce((s, it) => s + (Number(it.score) || 0), 0);
      blocks.push(
        p(
          [
            t(`PHẦN ${ROMAN[gi] || gi + 1}.${score > 0 ? ` (${viScore(score)} điểm)` : ''} `, { b: true }),
            t(partInstruction(type, from, to)),
          ],
          { before: 160, after: 80, align: 'both', keepNext: true },
        ),
      );
    }

    for (let k = 0; k < g.items.length; k++) {
      const it = g.items[k];
      run++;
      const num = numbering === 'part' ? k + 1 : run;
      const label = `Câu ${num}.`;
      const content = await contentToBlocks(it.content, ctx());
      const qBlocks = withLabel([t(label + ' ', { b: true })], content);
      qBlocks.forEach((b, i) => {
        if (b.k === 'p') {
          b.align = b.align || 'both';
          if (i === 0) b.before = 100;
        }
      });
      blocks.push(...qBlocks);

      // ----- phương án -----
      if (it.type === 'MCQ' && Array.isArray(it.options) && it.options.length) {
        const opts = it.options;
        const maxLen = Math.max(...opts.map((x) => visualLength(x.text)));
        const perRow = maxLen <= 16 ? Math.min(4, opts.length) : maxLen <= 38 ? 2 : 1;
        const cw = Math.floor((W - 280) / perRow);
        const rows: { blocks: Block[] }[][] = [];
        for (let i = 0; i < opts.length; i += perRow) {
          const row: { blocks: Block[] }[] = [];
          for (let j = i; j < Math.min(opts.length, i + perRow); j++) {
            const op = opts[j];
            const correct = o.withAnswers && op.id === it.answer;
            const lab = t(`${op.id}. `, { b: true, ...(correct ? { color: RED, u: true } : {}) });
            const ob = await contentToBlocks(op.text, ctx(cw - 120));
            row.push({ blocks: withLabel([lab], ob) });
          }
          rows.push(row);
        }
        // bảng không viền thụt vào 1 chút để thẳng hàng dưới nội dung câu
        blocks.push({ k: 'table', borders: false, widths: [280, ...Array(perRow).fill(cw)], rows: rows.map((r) => [{ blocks: [] }, ...r]) });
        if (o.withAnswers) keyRows.push({ group: gi, label: String(num), type: it.type, key: String(it.answer ?? '') });
      } else if (it.type === 'TRUE_FALSE' && Array.isArray(it.options)) {
        let key = '';
        for (const op of it.options) {
          const isTrue = it.answer && typeof it.answer === 'object' && it.answer[op.id] === true;
          key += isTrue ? 'Đ' : 'S';
          const ob = await contentToBlocks(op.text, ctx(W - 700));
          const tail: Inline[] = o.withAnswers ? [t(isTrue ? '  (Đúng)' : '  (Sai)', { b: true, color: RED })] : [];
          const lb = withLabel([t(`${op.id}) `, { b: true })], ob);
          const lastP = [...lb].reverse().find((b) => b.k === 'p') as Extract<Block, { k: 'p' }> | undefined;
          if (lastP) lastP.runs.push(...tail);
          lb.forEach((b) => {
            if (b.k === 'p') {
              b.indent = 425;
              b.align = b.align || 'both';
            }
          });
          blocks.push(...lb);
        }
        if (o.withAnswers) keyRows.push({ group: gi, label: String(num), type: it.type, key });
      } else if (it.type === 'SHORT_ANSWER') {
        const ans = typeof it.answer === 'string' ? it.answer : JSON.stringify(it.answer ?? '');
        if (o.withAnswers) {
          const ab = await contentToBlocks(ans, ctx());
          blocks.push(...withLabel([t('Đáp số: ', { b: true, color: RED })], ab).map((b) => (b.k === 'p' ? { ...b, indent: 425 } : b)));
          keyRows.push({ group: gi, label: String(num), type: it.type, key: ans });
        }
      }

      // ----- lời giải (bản có đáp án) -----
      if (o.withAnswers && it.solution && String(it.solution).trim()) {
        const sb = await contentToBlocks(String(it.solution), ctx(W - 425));
        blocks.push(p([t('Lời giải.', { b: true, i: true })], { indent: 425, before: 40, after: 0, keepNext: true }));
        blocks.push(...sb.map((b) => (b.k === 'p' ? { ...b, indent: (b.indent || 0) + 425, align: b.align || 'both' } : b)));
      }
    }
  }

  // ===== Bảng đáp án / HẾT =====
  if (o.withAnswers && keyRows.length) {
    blocks.push(p([t('BẢNG ĐÁP ÁN', { b: true, color: RED })], { align: 'center', before: 300, after: 120, keepNext: true }));
    for (let gi = 0; gi < groups.length; gi++) {
      const rows = keyRows.filter((r) => r.group === gi);
      if (!rows.length) continue;
      blocks.push(p([t(`PHẦN ${ROMAN[gi] || gi + 1}`, { b: true })], { before: 80, after: 40, keepNext: true }));
      const per = rows[0].type === 'MCQ' ? 10 : 6;
      const tableRows: { blocks: Block[] }[][] = [];
      for (let i = 0; i < rows.length; i += per) {
        const chunk = rows.slice(i, i + per);
        const pad = per - chunk.length;
        tableRows.push([
          { blocks: [p([t('Câu', { b: true })])] },
          ...chunk.map((r) => ({ blocks: [p([t(r.label, { b: true })])] })),
          ...Array(pad).fill({ blocks: [] }),
        ]);
        tableRows.push([
          { blocks: [p([t('Đáp án', { b: true })])] },
          ...chunk.map((r) => ({ blocks: [p([t(r.key, { color: RED, b: true })])] })),
          ...Array(pad).fill({ blocks: [] }),
        ]);
      }
      const first = 1200;
      const cw = Math.floor((W - first) / per);
      blocks.push({
        k: 'table',
        borders: true,
        widths: [first, ...Array(per).fill(cw)],
        rows: tableRows.map((r) => r.map((c) => ({ ...c, align: 'center' as const }))),
      });
    }
  } else if (!o.withAnswers && o.header !== false) {
    blocks.push(p([t('------------------- HẾT -------------------', { b: true })], { align: 'center', before: 240 }));
  }

  const buffer = writer.build(blocks, { title: o.title + (o.code ? ` – Mã đề ${o.code}` : '') });
  return { buffer, stats };
}
