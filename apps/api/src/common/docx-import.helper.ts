// Nhập đề từ file Word (.docx) → câu hỏi chuẩn — KHÔNG gọi AI, 0 token
// Quy tắc:
//  - MCQ: đáp án đúng gạch chân hoặc bôi đỏ (trên run chữ cái A./B./C./D.)
//  - Đúng/sai: mệnh đề ĐÚNG gạch chân/bôi đỏ (trên run a)/b)/c)/d))
//  - Trả lời ngắn: "Đáp án: X"
//  - Lời giải sau chữ "Lời giải" (cả 4 dạng)
// Phương trình OMML → LaTeX ($...$); phương trình MathType (OLE) → ảnh xem trước → PNG

import * as crypto from 'crypto';

export interface ParsedQuestion {
  type: 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'ESSAY';
  content: string;
  options: { id: string; text: string }[];
  answer: any;
  solution: string;
  difficulty: string | null;
}

export interface OleRef {
  token: string; // [[OLE_n]]
  target: string; // word/media/imageN.wmf (ảnh xem trước)
  binTarget?: string | null; // word/embeddings/oleObjectN.bin (dữ liệu MTEF)
}

interface RunSeg {
  text: string;
  underline: boolean;
  red: boolean;
}

interface Para {
  text: string;
  runs: RunSeg[];
}

function isRedColor(val: string | null): boolean {
  const v = (val || '').toLowerCase();
  return v === 'ff0000' || v === 'c00000' || v === 'red' || v === 'ff';
}

// OMML → LaTeX (bọc $...$)
let ommlToLatexFn: ((ommlXml: string) => string) | null = null;
function ommlToLatex(ommlXml: string): string {
  try {
    if (!ommlToLatexFn) {
      const { DOMParser } = require('@xmldom/xmldom');
      const o2mMod = require('omml2mathml');
      const o2m =
        typeof o2mMod === 'function' ? o2mMod : o2mMod.default || o2mMod.omml2mathml;
      const m2lMod = require('mathml2latex');
      const m2l = m2lMod.convert || m2lMod;
      const esc = (s: string) =>
        String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const ser = (node: any): string => {
        if (!node) return '';
        if (node.nodeType === 3) return esc(node.nodeValue || '');
        if (node.nodeType !== 1) return '';
        const attrs: string[] = [];
        if (node.attributes) {
          for (let i = 0; i < node.attributes.length; i++) {
            attrs.push(node.attributes[i].name + '="' + esc(node.attributes[i].value) + '"');
          }
        }
        let inner = '';
        const kids = node.childNodes || [];
        for (let i = 0; i < kids.length; i++) inner += ser(kids[i]);
        const name = String(node.tagName || node.nodeName || '').toLowerCase();
        if (!name || name.startsWith('#')) return inner;
        return '<' + name + (attrs.length ? ' ' + attrs.join(' ') : '') + '>' + inner + '</' + name + '>';
      };
      ommlToLatexFn = (omml: string) => {
        const doc = new DOMParser().parseFromString(omml, 'text/xml');
        const mathEl = o2m(doc.documentElement);
        const mml = ser(mathEl);
        return m2l(mml);
      };
    }
    const latex = ommlToLatexFn(ommlXml);
    return latex && latex.trim() ? '$' + latex.trim() + '$' : '';
  } catch {
    return '';
  }
}

function serializeNode(node: any): string {
  try {
    const { XMLSerializer } = require('@xmldom/xmldom');
    return new XMLSerializer().serializeToString(node);
  } catch {
    return '';
  }
}

// Đọc quan hệ rId → target từ word/_rels/document.xml.rels
function readRels(zip: any): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const relsXml = zip.readAsText('word/_rels/document.xml.rels');
    const { DOMParser } = require('@xmldom/xmldom');
    const relDoc = new DOMParser().parseFromString(relsXml, 'text/xml');
    const rels = relDoc.getElementsByTagName('Relationship');
    for (let i = 0; i < rels.length; i++) {
      const id = rels[i].getAttribute('Id');
      const target = rels[i].getAttribute('Target');
      if (id && target) map.set(id, target);
    }
  } catch {
    /* bỏ qua */
  }
  return map;
}

// Đọc paragraphs từ document.xml theo thứ tự THỊ GIÁC (bao gồm cả bên trong BẢNG)
function readParagraphs(
  doc: any,
  rels: Map<string, string>,
): { paras: Para[]; oleRefs: OleRef[]; imgRefs: OleRef[] } {
  const paras: Para[] = [];
  const oleRefs: OleRef[] = [];
  const imgRefs: OleRef[] = [];

  const resolveTargets = (node: any): { preview: string | null; bin: string | null } => {
    const imgs = node.getElementsByTagName('v:imagedata');
    let preview: string | null = null;
    for (let m = 0; m < imgs.length; m++) {
      const rid = imgs[m].getAttribute('r:id');
      const src = imgs[m].getAttribute('src');
      if (rid && rels.has(rid)) preview = rels.get(rid)!;
      else if (src) preview = src;
      if (preview) break;
    }
    const blips = node.getElementsByTagName('a:blip');
    for (let m = 0; m < blips.length; m++) {
      const rid = blips[m].getAttribute('r:embed');
      if (rid && rels.has(rid)) {
        preview = rels.get(rid)!;
        break;
      }
    }
    let bin: string | null = null;
    const oles = node.getElementsByTagName('o:OLEObject');
    for (let m = 0; m < oles.length; m++) {
      const rid = oles[m].getAttribute('r:id');
      if (rid && rels.has(rid)) {
        bin = rels.get(rid)!;
        break;
      }
    }
    return { preview, bin };
  };

  const parseParagraph = (p: any) => {
    const runs: RunSeg[] = [];
    let text = '';
    const walk = (node: any) => {
      const kids = node.childNodes || [];
      for (let j = 0; j < kids.length; j++) {
        const c = kids[j];
        const name = c.nodeName;
        if (name === 'w:r') {
          let rt = '';
          const children = c.childNodes || [];
          for (let k = 0; k < children.length; k++) {
            const cc = children[k];
            if (cc.nodeName === 'w:t') rt += cc.textContent || '';
            else if (cc.nodeName === 'w:tab') rt += '\t';
            else if (cc.nodeName === 'w:br' || cc.nodeName === 'w:cr') rt += '\n';
            else if (cc.nodeName === 'm:oMath') {
              rt += ommlToLatex(serializeNode(cc));
            } else if (cc.nodeName === 'w:object') {
              const t = resolveTargets(cc);
              const token = `[[OLE_${oleRefs.length}]]`;
              oleRefs.push({ token, target: t.preview || '', binTarget: t.bin });
              rt += token;
            } else if (cc.nodeName === 'w:drawing' || cc.nodeName === 'w:pict') {
              const t = resolveTargets(cc);
              const token = `[[IMG_${imgRefs.length}]]`;
              imgRefs.push({ token, target: t.preview || '' });
              rt += token;
            }
          }
          const underline = c.getElementsByTagName('w:u').length > 0;
          let red = false;
          const colors = c.getElementsByTagName('w:color');
          for (let k = 0; k < colors.length; k++) {
            if (isRedColor(colors[k].getAttribute('w:val'))) red = true;
          }
          runs.push({ text: rt, underline, red });
          text += rt;
        } else if (name === 'm:oMath') {
          const latex = ommlToLatex(serializeNode(c));
          runs.push({ text: latex || '', underline: false, red: false });
          text += latex || '';
        } else if (name === 'w:object') {
          const t = resolveTargets(c);
          const token = `[[OLE_${oleRefs.length}]]`;
          oleRefs.push({ token, target: t.preview || '', binTarget: t.bin });
          runs.push({ text: token, underline: false, red: false });
          text += token;
        } else if (name === 'w:drawing' || name === 'w:pict') {
          const t = resolveTargets(c);
          const token = `[[IMG_${imgRefs.length}]]`;
          imgRefs.push({ token, target: t.preview || '' });
          runs.push({ text: token, underline: false, red: false });
          text += token;
        } else {
          walk(c);
        }
      }
    };
    walk(p);
    paras.push({ text, runs });
  };

  // Duyệt body theo thứ tự: đoạn văn + BẢNG (vào từng ô đọc đoạn văn bên trong)
  const walkBody = (node: any) => {
    const kids = node.childNodes || [];
    for (let j = 0; j < kids.length; j++) {
      const c = kids[j];
      const name = c.nodeName;
      if (name === 'w:p') {
        parseParagraph(c);
      } else if (name === 'w:tbl') {
        // Vào từng ô trong bảng
        const cells = c.getElementsByTagName('w:tc');
        for (let k = 0; k < cells.length; k++) {
          const cellParas = cells[k].getElementsByTagName('w:p');
          for (let m = 0; m < cellParas.length; m++) parseParagraph(cellParas[m]);
        }
      } else {
        walkBody(c);
      }
    }
  };
  const bodies = doc.getElementsByTagName('w:body');
  for (let bi = 0; bi < bodies.length; bi++) walkBody(bodies[bi]);

  return { paras, oleRefs, imgRefs };
}

const RED_OR_UNDERLINE = (r: RunSeg) => r.underline || r.red;

export function parseDocx(buffer: Buffer): {
  questions: ParsedQuestion[];
  warnings: string[];
  oleRefs: OleRef[];
  imgRefs: OleRef[];
} {
  const warnings: string[] = [];
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(buffer);
  const xml = zip.readAsText('word/document.xml');
  const { DOMParser } = require('@xmldom/xmldom');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const rels = readRels(zip);
  const { paras, oleRefs, imgRefs } = readParagraphs(doc, rels);

  const questions: ParsedQuestion[] = [];
  let section: string | null = null;
  let cur: any = null;
  let pending: string[] = [];

  const flush = () => {
    if (!cur) return;
    let type = cur.type;
    // Đếm số LỰA CHỌN thật (mỗi dòng có thể chứa nhiều lựa chọn cách nhau bằng tab/space)
    const optCount = cur.optionLines.reduce(
      (s: number, l: any) =>
        s +
        String(l.text)
          .split(/\t+| {2,}/)
          .filter((x: string) => /^[A-Da-d]\./.test(x.trim())).length,
      0,
    );
    if (optCount >= 2) type = 'MCQ';
    else if (cur.tfLines.length >= 2) type = 'TRUE_FALSE';
    else if (cur.shortAnswer !== null) type = 'SHORT_ANSWER';

    if (type === 'MCQ') {
      const opts: { id: string; text: string }[] = [];
      let answer: string | null = null;
      for (const line of cur.optionLines) {
        // Mỗi dòng có thể chứa nhiều lựa chọn: cách nhau bằng tab HOẶC nhiều dấu cách
        const segs = line.text
          .split(/\t+| {2,}/)
          .map((s: string) => s.trim())
          .filter(Boolean);
        for (const seg of segs) {
          const m = /^([A-Da-d])\.\s*(.*)$/.exec(seg);
          if (!m) continue;
          const id = m[1].toUpperCase();
          const mark = line.runs.some(
            (r) => RED_OR_UNDERLINE(r) && r.text.trim() && seg.includes(r.text.trim()),
          );
          if (mark && !answer) answer = id;
          opts.push({ id, text: m[2] || '' });
        }
      }
      if (!answer && cur.answerLine) {
        const m = /^([A-Da-d])/.exec(cur.answerLine);
        if (m) answer = m[1].toUpperCase();
      }
      if (!answer) {
        warnings.push(
          `Câu (trắc nghiệm) không thấy đáp án gạch chân/bôi đỏ: "${cur.content.slice(0, 60)}"`,
        );
      }
      questions.push({
        type: 'MCQ',
        content: cur.content,
        options: opts,
        answer: answer || opts[0]?.id || '',
        solution: cur.solution,
        difficulty: cur.difficulty,
      });
    } else if (type === 'TRUE_FALSE') {
      const opts: { id: string; text: string }[] = [];
      const ans: any = {};
      for (const line of cur.tfLines) {
        const m = /^([a-d])\)\s*(\[[^\]\n]*\])?\s*(.*)$/i.exec(line.text.trim());
        if (!m) continue;
        const id = m[1].toLowerCase();
        const body = (m[3] || '').trim();
        const tag = m[2] || '';
        const dm = /,\s*(NB|TH|VD|VDC)/i.exec(tag);
        const diff = dm ? dm[1].toUpperCase() : null;
        // Mệnh đề đúng: run chữ cái "a)" được gạch chân/bôi đỏ
        const mark = line.runs.some(
          (r) =>
            RED_OR_UNDERLINE(r) &&
            /^[a-d]\)/i.test(r.text.trim()) &&
            r.text.trim().toLowerCase().startsWith(id + ')'),
        );
        if (diff && !cur.difficulty) cur.difficulty = diff;
        opts.push({ id, text: body });
        ans[id] = mark;
      }
      if (!Object.values(ans).some((v) => v)) {
        const dm = /^Đáp án\s*([a-d,\s]+)$/i.exec(cur.answerLine || '');
        if (dm) {
          for (const ch of dm[1].toLowerCase().split(',')) {
            const k = ch.trim();
            if (k) ans[k] = true;
          }
        }
      }
      questions.push({
        type: 'TRUE_FALSE',
        content: cur.content,
        options: opts,
        answer: ans,
        solution: cur.solution,
        difficulty: cur.difficulty,
      });
    } else if (type === 'SHORT_ANSWER') {
      questions.push({
        type: 'SHORT_ANSWER',
        content: cur.content,
        options: [],
        answer: cur.shortAnswer || '',
        solution: cur.solution,
        difficulty: cur.difficulty,
      });
    } else {
      questions.push({
        type: 'ESSAY',
        content: cur.content,
        options: [],
        answer: '',
        solution: cur.solution,
        difficulty: cur.difficulty,
      });
    }
    cur = null;
  };

  for (const p of paras) {
    const t = p.text.trim();
    if (!t) continue;

    const partM = /^(PHẦN|Phần)\s*[IVX0-9]+\s*[\.:]?\s*/i.exec(t);
    if (partM) {
      flush();
      const rest = t.slice(partM[0].length).toLowerCase();
      if (rest.includes('đúng sai') || rest.includes('đúng/sai')) section = 'TRUE_FALSE';
      else if (rest.includes('trả lời ngắn')) section = 'SHORT_ANSWER';
      else if (rest.includes('tự luận')) section = 'ESSAY';
      else if (rest.includes('trắc nghiệm')) section = 'MCQ';
      continue;
    }

    // Nhận diện câu hỏi mới: "Câu 1", "CÂU 1", "Câu 1:", "1.", "1)", "(1)"
    let qM = /^C(â|Â)U\s*\d+\s*[\.:\)]?\s*(.*)$/i.exec(t);
    if (!qM && section) {
      qM = /^\d+\s*[\.\)]\s*(.*)$/.exec(t);
    }
    if (qM) {
      flush();
      pending = [];
      cur = {
        type: section || 'ESSAY',
        content: qM[2].trim(),
        optionLines: [],
        tfLines: [],
        shortAnswer: null,
        answerLine: null,
        solution: '',
        difficulty: null,
        solutionMode: false,
      };
      continue;
    }

    const isOptionLine = /^([A-Da-d])\.\s/.test(t);
    const isTfLine = /^([a-d])\)\s/.test(t);

    // "Lời giải" → phần lời giải của câu đang mở
    if (/^Lời giải/i.test(t)) {
      if (cur) {
        cur.solutionMode = true;
      }
      continue;
    }

    if (!cur) {
      // Chưa có câu hỏi nào đang mở
      if (isOptionLine || isTfLine) {
        // Câu hỏi KHÔNG có số "Câu N.": nội dung tích lũy phía trên
        cur = {
          type: section || 'ESSAY',
          content: pending.join('\n').trim(),
          optionLines: [],
          tfLines: [],
          shortAnswer: null,
          answerLine: null,
          solution: '',
          difficulty: null,
          solutionMode: false,
        };
        pending = [];
        if (isOptionLine) cur.optionLines.push({ text: t, runs: p.runs });
        else cur.tfLines.push({ text: t, runs: p.runs });
        continue;
      }
      const saM0 = /^Đáp án\s*:\s*(.+)$/i.exec(t);
      const alM0 = /^Đáp án\s+([A-Da-d,\s]+)\.?$/i.exec(t);
      if (saM0 || alM0) {
        continue; // dòng đáp án rơi ngoài câu → bỏ qua
      }
      if (/^[-–—]*\s*HẾT\s*[-–—]*$/i.test(t)) {
        flush();
        continue;
      }
      if (t.startsWith('(') || /^Giải thích|^Khi đảo|^Số thứ tự/i.test(t)) {
        continue;
      }
      pending.push(t);
      continue;
    }

    // Có câu hỏi đang mở
    if (cur.solutionMode) {
      // Ranh giới: dòng thuộc lời giải hay mở đầu câu hỏi MỚI (file không đánh số câu)?
      const contSolution =
        t.length <= 3 ||
        /^[.,;:)]/.test(t) ||
        /^[a-d]\)\s*(Đúng|Sai)/i.test(t) ||
        /^(Ta có|Vì |Do đó|Do |Suy ra|Vậy|Mà|Nên|Theo|Áp dụng|Xét|Gọi|Đặt|Mặt khác|Vì vậy|Khi đó|Từ đó|Bởi|Không mất|Tập xác định|Đạo hàm|Bảng biến thiên)/i.test(t);
      const looksQuestion =
        /nào sau đây|đúng hay sai|hỏi|khẳng định nào|mệnh đề nào|bằng bao nhiêu|tính |tìm |là mệnh đề|\?$|trong các|sau đây là|phát biểu nào/i.test(t);
      if (looksQuestion && !contSolution) {
        // Câu hỏi mới (không có số "Câu N.")
        flush();
        pending = [t];
        continue;
      }
      cur.solution = (cur.solution ? cur.solution + '\n' : '') + t;
      continue;
    }

    // Đáp án: "Đáp án: A" (1 chữ cái = MCQ), "Đáp án: a,b,c" (đúng/sai), "Đáp án: 1,2" (trả lời ngắn)
    const saM = /^Đáp án\s*:\s*(.+)$/i.exec(t);
    if (saM) {
      const val = saM[1].trim();
      if (/^[A-Da-d]$/.test(val)) cur.answerLine = val.toUpperCase();
      else if (/^[a-d](,[a-d])*$/i.test(val)) cur.answerLine = val.toLowerCase();
      else cur.shortAnswer = val;
      continue;
    }
    const alM = /^Đáp án\s+([A-Da-d,\s]+)\.?$/i.exec(t);
    if (alM) {
      cur.answerLine = alM[1].trim();
      continue;
    }
    if (/^[-–—]*\s*HẾT\s*[-–—]*$/i.test(t)) {
      flush();
      continue;
    }

    if (isOptionLine) {
      cur.optionLines.push({ text: t, runs: p.runs });
      continue;
    }
    if (isTfLine) {
      cur.tfLines.push({ text: t, runs: p.runs });
      continue;
    }

    // Câu đã có lựa chọn/đáp án và gặp dòng nội dung mới → đây là câu hỏi TIẾP THEO (không đánh số)
    const hasStructure =
      cur.optionLines.length > 0 ||
      cur.tfLines.length > 0 ||
      cur.shortAnswer !== null ||
      cur.answerLine !== null;
    if (hasStructure) {
      flush();
      pending = [t];
      continue;
    }

    if (t.startsWith('(') || /^Giải thích|^Khi đảo|^Số thứ tự/i.test(t)) {
      continue;
    }
    cur.content = (cur.content ? cur.content + '\n' : '') + t;
  }
  flush();

  if (!questions.length) {
    warnings.push(
      'Không nhận dạng được câu hỏi nào. File cần có "PHẦN I...", "Câu 1." (hoặc đánh số "1.") để hệ thống tách câu. Nếu file khác định dạng, hãy gửi mẫu cho quản trị viên.',
    );
  }

  return { questions, warnings, oleRefs, imgRefs };
}

// Chuyển ảnh WMF (preview MathType) → PNG bằng ImageMagick
export function wmfToPng(wmfBuffer: Buffer): Buffer | null {
  try {
    const { execFileSync } = require('child_process');
    const os = require('os');
    const fs = require('fs');
    const path = require('path');
    const tmpIn = path.join(os.tmpdir(), 'wmf_' + crypto.randomBytes(6).toString('hex') + '.wmf');
    const tmpOut = tmpIn.replace('.wmf', '.png');
    fs.writeFileSync(tmpIn, wmfBuffer);
    try {
      // WMF là vector → phóng to 400% để ảnh rõ nét, chuyển 8-bit
      execFileSync('convert', [tmpIn, '-resize', '400%', '-depth', '8', tmpOut], {
        timeout: 15000,
        stdio: 'ignore',
      });
      if (fs.existsSync(tmpOut)) return fs.readFileSync(tmpOut);
    } finally {
      try { fs.unlinkSync(tmpIn); } catch { /* bỏ qua */ }
      try { fs.unlinkSync(tmpOut); } catch { /* bỏ qua */ }
    }
  } catch {
    /* bỏ qua */
  }
  return null;
}

// ============ GIẢI MÃ MTEF (MathType) → LaTeX ============
// MTEF v5 (MathType 7) được giải mã theo cấu trúc nhị phân thực tế
// (đối chiếu 13 phương trình mẫu: chữ, dấu, \vec{}, \overrightarrow{})

// Bóc stream "Equation Native" từ file OLE2 (oleObjectN.bin)
export function mtefFromOle(oleBuffer: Buffer): Buffer | null {
  try {
    const CFB = require('cfb');
    const cfb = CFB.read(oleBuffer, { type: 'buffer' });
    const nat = CFB.find(cfb, 'Equation Native');
    if (!nat || !nat.content) return null;
    return Buffer.from(nat.content);
  } catch {
    return null;
  }
}

// MathType (bản mới) NHÚNG SẴN mã LaTeX trong stream dưới encoding "TeX Input Language"
// → bóc trực tiếp, chính xác 100%
export function mtefEmbeddedLatex(mtef: Buffer): string | null {
  try {
    const marker = Buffer.from('TeX Input Language', 'utf8');
    let idx = mtef.indexOf(marker);
    if (idx === -1) return null;
    idx += marker.length;
    while (idx < mtef.length && mtef[idx] === 0) idx++;
    let end = idx;
    while (end < mtef.length && mtef[end] !== 0) end++;
    const latex = mtef.slice(idx, end).toString('utf8').trim();
    if (!latex) return null;
    // Kiểm tra hợp lệ: không chứa ký tự điều khiển lạ
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(latex)) return null;
    return latex;
  } catch {
    return null;
  }
}

// Giải mã MTEF → LaTeX tuyến tính. Trả null nếu không chắc chắn đọc đúng
// Bảng chuyển ký hiệu Unicode → lệnh LaTeX (cho biên dịch PDF chuẩn)
const UNICODE_TO_LATEX: Record<string, string> = {
  '−': '-',
  '×': '\\times ',
  '⋅': '\\cdot ',
  '÷': '\\div ',
  '±': '\\pm ',
  '∓': '\\mp ',
  '≠': '\\neq ',
  '≤': '\\leq ',
  '≥': '\\geq ',
  '≡': '\\equiv ',
  '≈': '\\approx ',
  '∝': '\\propto ',
  '≅': '\\cong ',
  '⇒': '\\Rightarrow ',
  '⇔': '\\Leftrightarrow ',
  '→': '\\to ',
  '←': '\\leftarrow ',
  '↔': '\\leftrightarrow ',
  '↦': '\\mapsto ',
  '↑': '\\uparrow ',
  '↓': '\\downarrow ',
  '∀': '\\forall ',
  '∃': '\\exists ',
  '∈': '\\in ',
  '∉': '\\notin ',
  '⊂': '\\subset ',
  '⊃': '\\supset ',
  '⊆': '\\subseteq ',
  '⊇': '\\supseteq ',
  '∩': '\\cap ',
  '∪': '\\cup ',
  '∅': '\\emptyset ',
  '∖': '\\setminus ',
  '⊥': '\\perp ',
  '∥': '\\parallel ',
  '△': '\\triangle ',
  '□': '\\square ',
  '∼': '\\sim ',
  '∠': '\\angle ',
  '∇': '\\nabla ',
  '∂': '\\partial ',
  '∞': '\\infty ',
  '°': '^\\circ ',
  '∗': '\\ast ',
  '⊕': '\\oplus ',
  '⊗': '\\otimes ',
  '∧': '\\wedge ',
  '∨': '\\vee ',
  '¬': '\\neg ',
  'ℕ': '\\mathbb{N} ',
  'ℤ': '\\mathbb{Z} ',
  'ℝ': '\\mathbb{R} ',
  'ℚ': '\\mathbb{Q} ',
  'ℂ': '\\mathbb{C} ',
  'α': '\\alpha ',
  'β': '\\beta ',
  'γ': '\\gamma ',
  'δ': '\\delta ',
  'ε': '\\epsilon ',
  'ζ': '\\zeta ',
  'η': '\\eta ',
  'θ': '\\theta ',
  'λ': '\\lambda ',
  'μ': '\\mu ',
  'π': '\\pi ',
  'ρ': '\\rho ',
  'σ': '\\sigma ',
  'φ': '\\varphi ',
  'ω': '\\omega ',
  'Γ': '\\Gamma ',
  'Δ': '\\Delta ',
  'Θ': '\\Theta ',
  'Λ': '\\Lambda ',
  'Π': '\\Pi ',
  'Σ': '\\Sigma ',
  'Φ': '\\Phi ',
  'Ψ': '\\Psi ',
  'Ω': '\\Omega ',
};

function unicodeToLatex(s: string): string {
  let out = '';
  for (const ch of s) {
    out += UNICODE_TO_LATEX[ch] ?? ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Giải mã MTEF → LaTeX (bộ giải mã v2: chỉ số, lũy thừa, phân số, căn, ký hiệu Unicode)
export function mtefToLatex(mtef: Buffer): string | null {
  try {
    const b = mtef;
    let i = b.indexOf(Buffer.from('4d54204578747261', 'hex')); // "MT Extra"
    if (i !== -1) i += 9;
    else i = 0;
    // Điểm kết thúc khối prefs (0a 01 00) — file không có prelude thì char bắt đầu ngay sau đó
    const prefsEnd = b.lastIndexOf(Buffer.from('0a0100', 'hex'));
    const scanFrom = Math.max(i, prefsEnd >= 0 ? prefsEnd + 3 : i);
    i = scanFrom;
    let found = false;
    while (i < b.length - 3) {
      if (b[i] === 0x0f && b[i + 1] === 0x01 && b[i + 2] === 0x02) {
        found = true;
        break;
      }
      // Định dạng không có prelude: char record 02 00 <tf> bắt đầu trực tiếp
      if (b[i] === 0x02 && b[i + 1] === 0x00) {
        found = true;
        break;
      }
      i++;
    }
    if (!found) return null;
    // Định dạng "không prelude" (MathType cũ): 00 00 là DẤU PHÂN CÁCH, không phải kết thúc nhóm
    const flat = !(b[i] === 0x0f && b[i + 1] === 0x01 && b[i + 2] === 0x02);

    const matchAt = (hex: string): boolean => {
      const bytes = Buffer.from(hex, 'hex');
      if (i + bytes.length > b.length) return false;
      return b.slice(i, i + bytes.length).equals(bytes);
    };

    type Role =
      | 'top'
      | 'sub'
      | 'sup'
      | 'subsup-sub'
      | 'subsup-sup'
      | 'rad-index';

    const parseGroup = (role: Role): string | null => {
      let s = '';
      let wrapStart = 0; // vị trí bắt đầu "cụm" hiện tại (để bọc ngoặc đúng chỗ)
      const vecLast = () => {
        const m = /^(.*)(.)$/.exec(s);
        if (m) s = m[1] + '\\vec{' + m[2] + '}';
      };
      const checkVec = () => {
        if (matchAt('000f0006000b00')) {
          vecLast();
          i += 7;
        }
      };
      while (i < b.length) {
        if (matchAt('0f0102')) {
          i += 3;
          continue;
        }
        // Định dạng cũ: template ngoặc {02 00 96 <mở>} [00 02 00] {96 <đóng>}
        // → bọc cụm ký tự hiện tại (từ wrapStart). Phải kiểm tra TRƯỚC nhánh 02-skip
        if (
          flat &&
          b[i] === 0x02 &&
          b[i + 1] === 0x00 &&
          b[i + 2] === 0x96 &&
          b[i + 4] === 0x00 &&
          b[i + 5] === 0x02 &&
          b[i + 6] === 0x00 &&
          b[i + 7] === 0x96
        ) {
          const openCh = String.fromCharCode(b[i + 3]);
          const closeCh = String.fromCharCode(b[i + 8]);
          const inner = s.slice(wrapStart);
          if (openCh === '(' && closeCh === ')') {
            s = s.slice(0, wrapStart) + '(' + inner + ')';
          } else {
            s =
              s.slice(0, wrapStart) +
              '\\left' + openCh + inner + '\\right' + closeCh;
          }
          i += 9;
          continue;
        }
        if (b[i] === 0x02) {
          i += 1;
          continue;
        }
        // LINE record (định dạng cũ): 03 00 01 → bỏ qua, bắt đầu cụm mới
        if (b[i] === 0x03 && b[i + 1] === 0x00 && b[i + 2] === 0x01) {
          i += 3;
          wrapStart = s.length;
          continue;
        }
        if (b[i] === 0x0f) {
          if (matchAt('0f0003001b00000b0100')) {
            i += 10;
            const sub = parseGroup('sub');
            if (sub === null) return null;
            s += '_{' + sub + '}';
            continue;
          }
          if (matchAt('0f0003001c00000b01010100')) {
            i += 12;
            const sup = parseGroup('sup');
            if (sup === null) return null;
            s += '^{' + sup + '}';
            continue;
          }
          if (matchAt('0f0003001d00000b0100')) {
            i += 10;
            const sub = parseGroup('subsup-sub');
            if (sub === null) return null;
            const sup = parseGroup('subsup-sup');
            if (sup === null) return null;
            s += '_{' + sub + '}^{' + sup + '}';
            continue;
          }
          if (matchAt('0f0003001f02000100')) {
            i += 8;
            continue;
          }
          if (matchAt('0f000200')) {
            i += 4;
            const c1 = b[i + 1];
            i += 2;
            if (b[i] === 0x00 && b[i + 1] === 0x02) {
              i += 3;
              const c2 = b[i + 1];
              i += 2;
              if (b[i] === 0x00) i += 1;
              const ch1 = String.fromCharCode(c1);
              const ch2 = String.fromCharCode(c2);
              if (ch1 === '(' && ch2 === ')' && /^\\frac\{/.test(s)) {
                const m = /^\\frac\{(.+)\}\{(.+)\}$/.exec(s);
                if (m) s = '\\binom{' + m[1] + '}{' + m[2] + '}';
                else s = '\\left(' + s + '\\right)';
              } else if (ch1 === '(' && ch2 === ')') s = '\\left(' + s + '\\right)';
              else if (ch1 === '[' && ch2 === ']') s = '\\left[' + s + '\\right]';
              else if (ch1 === '{' && ch2 === '}') s = '\\left\\{' + s + '\\right\\}';
              else if (ch1 === '|' && ch2 === '|') s = '\\left|' + s + '\\right|';
              else s = '\\left' + ch1 + s + '\\right' + ch2;
              continue;
            }
            i += 2;
            s = '\\overrightarrow{' + s + '}';
            continue;
          }
          break;
        }
        if (b[i] === 0x00) {
          if (b[i + 1] === 0x00) {
            i += 2;
            // Định dạng không prelude: 00 00 chỉ là dấu phân cách → tiếp tục đọc
            if (flat) continue;
            if (role === 'sub' || role === 'sup') {
              if (matchAt('0f00010100')) i += 5;
              return s;
            }
            if (role === 'subsup-sub') {
              if (matchAt('0f000100')) i += 4;
              return s;
            }
            if (role === 'subsup-sup') {
              if (matchAt('0f00010100')) i += 5;
              return s;
            }
            if (role === 'rad-index') {
              if (matchAt('0a')) i += 1;
              return s;
            }
            if (matchAt('0f000100')) {
              i += 4;
              const den = parseGroup('top');
              if (den === null) return null;
              return '\\frac{' + s + '}{' + den + '}';
            }
            if (matchAt('0b')) {
              i += 1;
              if (matchAt('0f000100')) {
                i += 4;
                const idx = parseGroup('rad-index');
                if (idx === null) return null;
                return '\\sqrt[' + idx + ']{' + s + '}';
              }
              if (matchAt('010100000000')) i += 6;
              else if (matchAt('0101000000')) i += 5;
              return '\\sqrt{' + s + '}';
            }
            return s;
          }
          if (b[i + 1] === 0x02 || b[i + 1] === 0x0f) {
            i += 1;
            continue;
          }
          if (b[i + 1] === 0x03) {
            i += 1; // dấu phân cách trước LINE record
            continue;
          }
          if (b[i + 1] >= 0x80 && i + 2 < b.length) {
            const code = b[i + 2];
            i += 3;
            s += String.fromCharCode(code);
            checkVec();
            continue;
          }
          break;
        }
        if (b[i] === 0x01 && b[i + 1] >= 0x80 && i + 2 < b.length) {
          const code = b[i + 2];
          i += 3;
          s += String.fromCharCode(code);
          checkVec();
          continue;
        }
        if (b[i] === 0x04 && b[i + 1] >= 0x80 && i + 2 < b.length) {
          const X = b[i + 2];
          i += 3;
          if (i < b.length && b[i] === X) {
            s += String.fromCharCode(X);
            i += 1;
          } else if (i + 1 < b.length && b[i] === 0x00 && b[i + 1] === X) {
            // Toán tử lặp sau 1 byte 00 (định dạng cũ): {04, tf, X, 00, X}
            s += String.fromCharCode(X);
            i += 2;
          } else if (i + 1 < b.length) {
            const Y = b[i];
            i += 2;
            s += String.fromCharCode(X | (Y << 8));
            // Ký hiệu Symbol-font kèm 1 byte mã font (>= 0x80) → bỏ qua
            if (i < b.length && b[i] >= 0x80) i += 1;
          } else {
            return null;
          }
          checkVec();
          continue;
        }
        if (b[i] === 0x13) {
          i += 1;
          while (i < b.length && b[i] !== 0x00) i++;
          i += 1;
          while (i < b.length && b[i] === 0x11) {
            i += 3;
            while (i < b.length && b[i] !== 0x00) i++;
            i += 1;
          }
          if (matchAt('080500')) i += 3;
          continue;
        }
        break;
      }
      return s;
    };

    const result = parseGroup('top');
    if (result === null) return null;

    for (let k = i; k < b.length; k++) {
      if (b[k] !== 0x00) return null;
    }

    const latex = unicodeToLatex(result);
    if (!latex) return null;
    if (!/^[\x20-\x7e\u00A0-\uFFFF\\{}^_]+$/.test(latex)) return null;
    return latex;
  } catch {
    return null;
  }
}
// Giải mã toàn bộ phương trình MathType (OLE) → Map token → LaTeX
export function extractMtefLatex(
  buffer: Buffer,
  oleRefs: OleRef[],
): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(buffer);
    for (const ref of oleRefs) {
      if (!ref.binTarget) continue;
      const entryName = ref.binTarget.startsWith('word/')
        ? ref.binTarget
        : 'word/' + ref.binTarget.replace(/^\//, '');
      const entry = zip.getEntry(entryName);
      if (!entry) continue;
      const mtef = mtefFromOle(entry.getData() as Buffer);
      if (!mtef) continue;
      // Ưu tiên 1: MathType nhúng sẵn LaTeX → chính xác tuyệt đối
      const embedded = mtefEmbeddedLatex(mtef);
      if (embedded) {
        map.set(ref.token, '$' + embedded + '$');
        continue;
      }
      // Ưu tiên 2: giải mã nhị phân MTEF theo cấu trúc
      const latex = mtefToLatex(mtef);
      if (latex) map.set(ref.token, '$' + latex + '$');
    }
  } catch {
    /* bỏ qua */
  }
  return map;
}

// Đọc ảnh xem trước của phương trình MathType (OLE) + ảnh thường từ zip → Buffer
export function extractDocxImages(
  buffer: Buffer,
  refs: OleRef[],
  convertWmf: boolean,
): Map<string, { buffer: Buffer; ext: string }> {
  const map = new Map<string, { buffer: Buffer; ext: string }>();
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(buffer);
    for (const ref of refs) {
      if (!ref.target) continue;
      const entryName = ref.target.startsWith('word/')
        ? ref.target
        : 'word/' + ref.target.replace(/^\//, '');
      const entry = zip.getEntry(entryName);
      if (!entry) continue;
      let buf: Buffer | null = entry.getData() as Buffer;
      if (!buf || !buf.length) continue;
      const ext = (ref.target.toLowerCase().split('.').pop() || '').trim();
      if (ext === 'wmf') {
        if (!convertWmf) continue;
        const png = wmfToPng(buf);
        if (!png) continue;
        map.set(ref.token, { buffer: png, ext: 'png' });
      } else if (ext === 'jpeg' || ext === 'jpg' || ext === 'png' || ext === 'gif') {
        map.set(ref.token, { buffer: buf, ext });
      }
    }
  } catch {
    /* bỏ qua */
  }
  return map;
}
