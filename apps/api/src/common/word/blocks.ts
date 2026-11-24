/**
 * Nội dung câu hỏi (LaTeX + chút markdown) → các khối Word: đoạn văn, công thức, bảng, ảnh.
 * Không còn mã LaTeX thô lọt vào Word: \immini → bảng 2 cột (chữ | hình), tabular → bảng
 * thật, enumerate/itemize → danh sách, TikZ → ảnh (tự biên dịch nếu chưa có), \textbf → đậm…
 */
import { latexToOmml, latexToOmmlPara } from './omml';

export type ImgData = { data: Buffer; type: 'png' | 'jpeg'; w: number; h: number }; // w,h: px @96dpi

export type Inline =
  | { k: 'text'; text: string; b?: boolean; i?: boolean; u?: boolean; color?: string }
  | { k: 'math'; xml: string }
  | { k: 'img'; img: ImgData }
  | { k: 'br' };

export type Block =
  | {
      k: 'p';
      runs: Inline[];
      align?: 'left' | 'center' | 'right' | 'both';
      indent?: number; // twips
      hanging?: number;
      before?: number;
      after?: number;
      keepNext?: boolean;
    }
  | { k: 'math'; xml: string }
  | { k: 'table'; rows: Cell[][]; borders: boolean; widths: number[] };

export type Cell = { blocks: Block[]; span?: number; align?: 'left' | 'center' | 'right' };

export type BlockCtx = {
  mathMode: 'omml' | 'tex';
  renderTikz?: (snippet: string) => Promise<Buffer | null>;
  loadImage?: (url: string) => Promise<ImgData | null>;
  width: number; // bề rộng vùng chứa (twips) — để co ảnh/bảng
  stats: DocStats;
};

export type DocStats = { formulas: number; unknown: Set<string>; tikzFailed: number; imagesMissing: number };

export function newStats(): DocStats {
  return { formulas: 0, unknown: new Set(), tikzFailed: 0, imagesMissing: 0 };
}

const TWIP_PER_PX = 15; // 96 dpi

type Style = { b?: boolean; i?: boolean; u?: boolean; color?: string };

// ===================== tiện ích đọc chuỗi =====================

function readGroup(s: string, i: number): { body: string; end: number } | null {
  let p = i;
  while (p < s.length && (s[p] === ' ' || s[p] === '\t')) p++;
  if (s[p] !== '{') return null;
  let depth = 0;
  for (let j = p; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') {
      j++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return { body: s.slice(p + 1, j), end: j + 1 };
    }
  }
  return { body: s.slice(p + 1), end: s.length }; // ngoặc thiếu → lấy tới hết
}

function readOpt(s: string, i: number): { body: string; end: number } | null {
  let p = i;
  while (p < s.length && s[p] === ' ') p++;
  if (s[p] !== '[') return null;
  let depth = 0;
  for (let j = p + 1; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') depth--;
    else if (s[j] === ']' && depth <= 0) return { body: s.slice(p + 1, j), end: j + 1 };
  }
  return null;
}

/** Tìm \end{env} khớp (có lồng nhau) bắt đầu từ i (ngay sau \begin{env}…) */
function findEnd(s: string, i: number, env: string): { body: string; end: number } {
  const esc = env.replace(/[*]/g, '\\*');
  const re = new RegExp(`\\\\(begin|end)\\{${esc}\\}`, 'g');
  re.lastIndex = i;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    depth += m[1] === 'begin' ? 1 : -1;
    if (depth === 0) return { body: s.slice(i, m.index), end: m.index + m[0].length };
  }
  return { body: s.slice(i), end: s.length };
}

/** Tìm dấu đóng toán ($, $$, \), \]) không bị escape */
function findMathClose(s: string, i: number, close: string): number {
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') {
      if (s.startsWith(close, j) && close.startsWith('\\')) return j;
      j++;
      continue;
    }
    if (s.startsWith(close, j)) return j;
  }
  return -1;
}

/** Tách theo \item / \itemch ở cấp ngoài cùng */
function splitItems(body: string): { label?: string; text: string }[] {
  const out: { label?: string; text: string }[] = [];
  let depth = 0;
  let envDepth = 0;
  let start = -1;
  let label: string | undefined;
  const re = /\\(begin|end)\{[^}]*\}|\\item(?:ch)?(?![a-zA-Z])|[{}]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (body[m.index - 1] === '\\') continue;
    const t = m[0];
    if (t === '{') depth++;
    else if (t === '}') depth--;
    else if (m[1] === 'begin') envDepth++;
    else if (m[1] === 'end') envDepth--;
    else if (depth === 0 && envDepth === 0) {
      if (start >= 0) out.push({ label, text: body.slice(start, m.index) });
      let p = m.index + t.length;
      const opt = readOpt(body, p);
      label = undefined;
      if (opt) {
        label = opt.body;
        p = opt.end;
      }
      start = p;
      re.lastIndex = p;
    }
  }
  if (start >= 0) out.push({ label, text: body.slice(start) });
  return out;
}

function enumLabel(fmt: string, n: number): string {
  const alpha = 'abcdefghijklmnopqrstuvwxyz';
  const roman = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
  const f = (fmt || '').replace(/^label\s*=\s*/, '').replace(/[{}]/g, '');
  // enumitem: \alph*) \arabic*. \roman*) ; gói enumerate: a) 1. i) A.
  const map = (tpl: string): string =>
    tpl
      .replace(/\\alph\*/g, alpha[n - 1] || String(n))
      .replace(/\\Alph\*/g, (alpha[n - 1] || String(n)).toUpperCase())
      .replace(/\\arabic\*/g, String(n))
      .replace(/\\roman\*/g, roman[n - 1] || String(n))
      .replace(/\\Roman\*/g, (roman[n - 1] || String(n)).toUpperCase())
      .replace(/\\bf|\\textbf|\\it/g, '');
  if (/\\(alph|Alph|arabic|roman|Roman)\*/.test(f)) return map(f);
  const m = /^(.*?)([aA1iI])(.*)$/.exec(f);
  if (m && f.length <= 6) {
    const kind = m[2];
    const v =
      kind === 'a' ? alpha[n - 1] : kind === 'A' ? alpha[n - 1].toUpperCase() : kind === 'i' ? roman[n - 1] : kind === 'I' ? roman[n - 1].toUpperCase() : String(n);
    return m[1] + v + m[3];
  }
  return `${n}.`;
}

// Lệnh "kiểu toán" viết ngoài $…$ (giáo viên hay gõ \heva{…} trơn) → coi như công thức
const MATHY = new Set([
  'heva', 'hoac', 'frac', 'dfrac', 'tfrac', 'sqrt', 'vec', 'vv', 'overrightarrow', 'widehat',
  'overline', 'overparen', 'wideparen', 'int', 'sum', 'lim', 'infty', 'alpha', 'beta',
  'gamma', 'Delta', 'delta', 'pi', 'leq', 'geq', 'le', 'ge', 'ne', 'neq', 'in', 'notin',
  'subset', 'cup', 'cap', 'Rightarrow', 'Leftrightarrow', 'perp', 'parallel', 'times', 'cdot',
  'pm', 'mathbb', 'varnothing', 'emptyset', 'circ', 'angle', 'triangle', 'log', 'ln', 'sin',
  'cos', 'tan', 'cot', 'binom', 'mathrm',
]);

// Ký hiệu chữ thường gặp ngoài toán
const TEXT_SYM: Record<string, string> = {
  ldots: '…', dots: '…', textbackslash: '\\', S: '§', copyright: '©', textdegree: '°',
  LaTeX: 'LaTeX', TeX: 'TeX', textendash: '–', textemdash: '—', quad: ' ', qquad: '  ',
  dotfill: '……………', hfill: ' ', enspace: ' ', textasciitilde: '~', textasciicircum: '^',
  checkmark: '✓', textbullet: '•', lq: '‘', rq: '’', textquoteleft: '‘', textquoteright: '’',
};

// Lệnh bỏ hẳn (kèm đối số nếu có)
const DROP_ARG = new Set(['vspace', 'hspace', 'label', 'ref', 'setlength', 'addtolength', 'phantom', 'hphantom', 'vphantom', 'pagestyle', 'thispagestyle', 'setcounter', 'addtocounter', 'color']);
const DROP = new Set([
  'noindent', 'indent', 'medskip', 'smallskip', 'bigskip', 'par', 'newpage', 'clearpage', 'pagebreak',
  'centering', 'raggedright', 'raggedleft', 'normalsize', 'small', 'footnotesize', 'large', 'Large',
  'LARGE', 'huge', 'Huge', 'scriptsize', 'tiny', 'relax', 'protect', 'leavevmode', 'nopagebreak',
  'allowbreak', 'hline', 'linebreak', 'displaystyle', 'selectfont', 'normalfont', 'rmfamily', 'sffamily',
]);

// ===================== bộ tách chính =====================

class Builder {
  blocks: Block[] = [];
  runs: Inline[] = [];
  align: 'left' | 'center' | 'right' | 'both' | undefined = undefined;
  constructor(private ctx: BlockCtx) {}

  pushText(text: string, st: Style) {
    if (!text) return;
    const last = this.runs[this.runs.length - 1];
    if (last && last.k === 'text' && last.b === st.b && last.i === st.i && last.u === st.u && last.color === st.color) {
      last.text += text;
    } else this.runs.push({ k: 'text', text, ...st });
  }

  flush() {
    // bỏ khoảng trắng thừa đầu/cuối đoạn
    while (this.runs.length && this.runs[0].k === 'br') this.runs.shift();
    while (this.runs.length && this.runs[this.runs.length - 1].k === 'br') this.runs.pop();
    const first = this.runs[0];
    if (first && first.k === 'text') first.text = first.text.replace(/^\s+/, '');
    const last = this.runs[this.runs.length - 1];
    if (last && last.k === 'text') last.text = last.text.replace(/\s+$/, '');
    const has = this.runs.some((r) => r.k !== 'text' || r.text.trim());
    if (has) this.blocks.push({ k: 'p', runs: this.runs, align: this.align });
    this.runs = [];
  }

  inlineMath(src: string, st: Style) {
    const tex = src.trim();
    if (!tex) return;
    this.ctx.stats.formulas++;
    if (this.ctx.mathMode === 'tex') {
      let inner = tex.replace(/\n/g, ' ');
      if (inner.startsWith('{') && inner.endsWith('}')) inner = inner.slice(1, -1);
      this.pushText('${' + inner + '}$', { ...st, i: true });
      return;
    }
    try {
      const r = latexToOmml(tex);
      r.unknown.forEach((u) => this.ctx.stats.unknown.add(u));
      this.runs.push({ k: 'math', xml: r.xml });
    } catch {
      this.pushText('$' + tex + '$', { ...st, i: true });
    }
  }

  displayMath(src: string) {
    const tex = src.trim();
    if (!tex) return;
    this.flush();
    this.ctx.stats.formulas++;
    if (this.ctx.mathMode === 'tex') {
      this.blocks.push({ k: 'p', runs: [{ k: 'text', text: '$$' + tex.replace(/\n/g, ' ') + '$$', i: true }], align: 'center' });
      return;
    }
    try {
      const r = latexToOmmlPara(tex);
      r.unknown.forEach((u) => this.ctx.stats.unknown.add(u));
      this.blocks.push({ k: 'math', xml: r.xml });
    } catch {
      this.blocks.push({ k: 'p', runs: [{ k: 'text', text: '$$' + tex + '$$', i: true }], align: 'center' });
    }
  }

  async image(img: ImgData | null, opts: string, fallback: string, st: Style) {
    if (!img) {
      this.pushText(fallback, { ...st, i: true });
      return;
    }
    const maxW = Math.max(60, Math.floor(this.ctx.width / TWIP_PER_PX));
    let w = img.w;
    let h = img.h;
    const wm = /width\s*=\s*([\d.]+)\s*(\\(?:line|text|column)width|cm|mm|in|pt)?/.exec(opts || '');
    const sm = /scale\s*=\s*([\d.]+)/.exec(opts || '');
    if (wm) {
      const v = parseFloat(wm[1]);
      const unit = wm[2] || '';
      const px = /width/.test(unit) ? v * maxW : unit === 'cm' ? (v / 2.54) * 96 : unit === 'mm' ? (v / 25.4) * 96 : unit === 'in' ? v * 96 : unit === 'pt' ? (v / 72) * 96 : w;
      h = (h * px) / w;
      w = px;
    } else if (sm) {
      w *= parseFloat(sm[1]);
      h *= parseFloat(sm[1]);
    }
    const k = Math.min(1, maxW / w, 520 / h);
    this.runs.push({ k: 'img', img: { ...img, w: Math.max(8, Math.round(w * k)), h: Math.max(8, Math.round(h * k)) } });
  }

  async tikz(snippet: string, st: Style) {
    const png = this.ctx.renderTikz ? await this.ctx.renderTikz(snippet).catch(() => null) : null;
    if (!png) {
      this.ctx.stats.tikzFailed++;
      this.pushText('[Hình vẽ — xem bản PDF]', { ...st, i: true });
      return;
    }
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    // Ảnh TikZ dựng ở 144 dpi (gấp đôi) → kích thước thật = 2/3 số điểm ảnh ở 96 dpi
    await this.image({ data: png, type: 'png', w: (w * 2) / 3, h: (h * 2) / 3 }, '', '', st);
  }

  /** Duyệt nội dung, đẩy chữ/công thức/khối vào builder */
  async walk(src: string, st: Style = {}): Promise<void> {
    const s = src;
    let i = 0;
    let text = '';
    const emit = () => {
      if (text) this.pushText(text, st);
      text = '';
    };
    while (i < s.length) {
      const c = s[i];
      // ----- toán -----
      if (c === '$') {
        emit();
        if (s[i + 1] === '$') {
          const j = findMathClose(s, i + 2, '$$');
          if (j < 0) {
            text += '$$';
            i += 2;
            continue;
          }
          this.displayMath(s.slice(i + 2, j));
          i = j + 2;
          continue;
        }
        const j = findMathClose(s, i + 1, '$');
        if (j < 0) {
          text += '$';
          i++;
          continue;
        }
        this.inlineMath(s.slice(i + 1, j), st);
        i = j + 1;
        continue;
      }
      if (c === '\\' && (s[i + 1] === '(' || s[i + 1] === '[')) {
        emit();
        const close = s[i + 1] === '(' ? '\\)' : '\\]';
        const j = s.indexOf(close, i + 2);
        if (j < 0) {
          i += 2;
          continue;
        }
        if (s[i + 1] === '(') this.inlineMath(s.slice(i + 2, j), st);
        else this.displayMath(s.slice(i + 2, j));
        i = j + 2;
        continue;
      }
      // ----- chú thích % (trừ "10%" do giáo viên quên \) -----
      if (c === '%') {
        if (/\d\s?$/.test(text) || /\d/.test(s[i - 1] || '')) {
          text += '%';
          i++;
          continue;
        }
        while (i < s.length && s[i] !== '\n') i++;
        continue;
      }
      // ----- markdown: ảnh + đậm -----
      if (c === '!' && s[i + 1] === '[') {
        const m = /^!\[[^\]]*\]\(\s*([^)\s]+)\s*\)/.exec(s.slice(i));
        if (m) {
          emit();
          const img = this.ctx.loadImage ? await this.ctx.loadImage(m[1]).catch(() => null) : null;
          if (!img) this.ctx.stats.imagesMissing++;
          await this.image(img, '', '[Ảnh]', st);
          i += m[0].length;
          continue;
        }
      }
      if (c === '*' && s[i + 1] === '*') {
        const j = s.indexOf('**', i + 2);
        if (j > i + 2 && !s.slice(i + 2, j).includes('\n\n')) {
          emit();
          await this.walk(s.slice(i + 2, j), { ...st, b: true });
          i = j + 2;
          continue;
        }
      }
      // ----- xuống đoạn -----
      if (c === '\n') {
        // dòng trống → đoạn mới; xuống dòng đơn → khoảng trắng
        let j = i;
        let nl = 0;
        while (j < s.length && /\s/.test(s[j])) {
          if (s[j] === '\n') nl++;
          j++;
        }
        if (nl >= 2) {
          emit();
          this.flush();
        } else text += ' ';
        i = j;
        continue;
      }
      if (c === '~') {
        text += ' ';
        i++;
        continue;
      }
      if (c === '{') {
        // nhóm {\bf …} / {\it …} / {…}
        const g = readGroup(s, i)!;
        emit();
        const m = /^\s*\\(bf|bfseries|it|itshape|em|sl|underline)(?![a-zA-Z])/.exec(g.body);
        if (m) {
          const st2 = { ...st, ...(m[1].startsWith('b') ? { b: true } : m[1] === 'underline' ? { u: true } : { i: true }) };
          await this.walk(g.body.slice(m[0].length), st2);
        } else await this.walk(g.body, st);
        i = g.end;
        continue;
      }
      if (c === '}') {
        i++;
        continue;
      }
      if (c === '-' && s[i + 1] === '-') {
        if (s[i + 2] === '-') {
          text += '—';
          i += 3;
        } else {
          text += '–';
          i += 2;
        }
        continue;
      }
      if (c === '`' && s[i + 1] === '`') {
        text += '“';
        i += 2;
        continue;
      }
      if (c === "'" && s[i + 1] === "'") {
        text += '”';
        i += 2;
        continue;
      }
      if (c !== '\\') {
        text += c;
        i++;
        continue;
      }

      // ----- lệnh \… -----
      const n = s[i + 1];
      if (n === undefined) break;
      if (n === '\\') {
        emit();
        this.runs.push({ k: 'br' });
        i += 2;
        const o = readOpt(s, i);
        if (o) i = o.end;
        continue;
      }
      if (!/[a-zA-Z@]/.test(n)) {
        const lit: Record<string, string> = { '%': '%', '&': '&', $: '$', '#': '#', _: '_', '{': '{', '}': '}', ',': ' ', ' ': ' ', ';': ' ', ':': ' ', '!': '', '-': '' };
        text += lit[n] ?? n;
        i += 2;
        continue;
      }
      let j = i + 1;
      while (j < s.length && /[a-zA-Z@]/.test(s[j])) j++;
      const name = s.slice(i + 1, j);
      let p = j;
      if (s[p] === '*') p++;

      if (name === 'begin') {
        const g = readGroup(s, p);
        if (!g) {
          i = p;
          continue;
        }
        emit();
        const env = g.body.trim();
        const f = findEnd(s, g.end, env);
        await this.env(env, f.body, st);
        i = f.end;
        continue;
      }
      if (name === 'end') {
        const g = readGroup(s, p);
        i = g ? g.end : p;
        continue;
      }
      if (name === 'newline' || name === 'linebreak') {
        emit();
        this.runs.push({ k: 'br' });
        i = p;
        continue;
      }
      if (name === 'par') {
        emit();
        this.flush();
        i = p;
        continue;
      }
      if (name === 'centering') {
        this.align = 'center';
        i = p;
        continue;
      }
      if (/^(textbf|textit|emph|underline|uline|textsl|textup|textrm|textsf|texttt|textnormal|mbox|text|hbox)$/.test(name)) {
        const g = readGroup(s, p);
        if (g) {
          emit();
          const st2 =
            name === 'textbf' ? { ...st, b: true } : name === 'textit' || name === 'emph' || name === 'textsl' ? { ...st, i: true } : name === 'underline' || name === 'uline' ? { ...st, u: true } : st;
          await this.walk(g.body, st2);
          i = g.end;
          continue;
        }
      }
      if (name === 'textcolor') {
        const c1 = readGroup(s, p);
        const c2 = c1 && readGroup(s, c1.end);
        if (c1 && c2) {
          emit();
          await this.walk(c2.body, st);
          i = c2.end;
          continue;
        }
      }
      if (name === 'immini' || name === 'imminil' || name === 'immini@') {
        const o = readOpt(s, p);
        const a = readGroup(s, o ? o.end : p);
        const b = a && readGroup(s, a.end);
        if (a && b) {
          emit();
          this.flush();
          await this.twoCol(a.body, b.body, st);
          i = b.end;
          continue;
        }
      }
      if (name === 'includegraphics') {
        const o = readOpt(s, p);
        const g = readGroup(s, o ? o.end : p);
        if (g) {
          emit();
          const img = this.ctx.loadImage ? await this.ctx.loadImage(g.body.trim()).catch(() => null) : null;
          if (!img) this.ctx.stats.imagesMissing++;
          await this.image(img, o?.body || '', '[Ảnh]', st);
          i = g.end;
          continue;
        }
      }
      if (MATHY.has(name)) {
        // \heva{…} viết ngoài $ → công thức (lấy lệnh + mọi đối số liền sau)
        let q = p;
        for (;;) {
          const o = readOpt(s, q);
          if (o) q = o.end;
          const g = readGroup(s, q);
          if (!g) break;
          q = g.end;
        }
        emit();
        this.inlineMath(s.slice(i, q), st);
        i = q;
        continue;
      }
      if (TEXT_SYM[name] !== undefined) {
        text += TEXT_SYM[name];
        i = p;
        if (s[i] === ' ' && /^[a-zA-Z]+$/.test(name) && !['quad', 'qquad', 'hfill', 'dotfill'].includes(name)) i++;
        continue;
      }
      if (DROP_ARG.has(name)) {
        let q = p;
        const o = readOpt(s, q);
        if (o) q = o.end;
        const g = readGroup(s, q);
        if (g) q = g.end;
        if (name === 'setlength' || name === 'addtolength' || name === 'setcounter' || name === 'addtocounter') {
          const g2 = readGroup(s, q);
          if (g2) q = g2.end;
        }
        if (name === 'hspace') text += ' ';
        i = q;
        continue;
      }
      if (DROP.has(name)) {
        i = p;
        while (s[i] === ' ') i++;
        continue;
      }
      // lệnh lạ: giữ nội dung đối số cuối (thường là chữ), bỏ tên lệnh
      {
        let q = p;
        let last: string | null = null;
        const o = readOpt(s, q);
        if (o) q = o.end;
        for (let k = 0; k < 3; k++) {
          const g = readGroup(s, q);
          if (!g) break;
          last = g.body;
          q = g.end;
        }
        emit();
        if (last !== null) await this.walk(last, st);
        this.ctx.stats.unknown.add(name);
        i = q;
        while (last === null && s[i] === ' ') i++;
      }
    }
    emit();
  }

  async env(env: string, body: string, st: Style) {
    const name = env.replace(/\*$/, '');
    // Toán hiển thị
    if (/^(equation|align|gather|multline|eqnarray|displaymath|flalign|alignat)$/.test(name)) {
      const inner =
        name === 'align' || name === 'eqnarray' || name === 'flalign' || name === 'alignat'
          ? `\\begin{aligned}${body.replace(/&&/g, '&')}\\end{aligned}`
          : name === 'gather'
            ? `\\begin{gathered}${body}\\end{gathered}`
            : body;
      this.displayMath(inner);
      return;
    }
    // Môi trường toán viết trần (cases/aligned/matrix… ngoài $)
    if (/^(cases|aligned|array|matrix|pmatrix|bmatrix|vmatrix|gathered|split)$/.test(name)) {
      this.inlineMath(`\\begin{${env}}${body}\\end{${env}}`, st);
      return;
    }
    if (name === 'center' || name === 'flushright' || name === 'flushleft') {
      this.flush();
      const saved = this.align;
      this.align = name === 'center' ? 'center' : name === 'flushright' ? 'right' : 'left';
      await this.walk(body, st);
      this.flush();
      this.align = saved;
      return;
    }
    if (name === 'tikzpicture' || name === 'circuitikz' || name === 'tikzcd') {
      const centered = this.align === 'center';
      if (!centered) this.flush();
      await this.tikz(`\\begin{${env}}${body}\\end{${env}}`, st);
      if (!centered) {
        const saved = this.align;
        this.align = 'center';
        this.flush();
        this.align = saved;
      }
      return;
    }
    if (name === 'tabular' || name === 'tabularx' || name === 'longtable' || name === 'tabu') {
      this.flush();
      await this.table(name, body, st);
      return;
    }
    if (/^(enumerate|itemize|itemchoice|itemch|enumEX|enumerateEX|description|choice)$/.test(name)) {
      this.flush();
      await this.list(name, body, st);
      return;
    }
    // minipage, multicols, các môi trường khác → giữ nội dung
    let b = body;
    if (name === 'minipage' || name === 'multicols' || name === 'tabular*' || name === 'adjustbox') {
      const o = readOpt(b, 0);
      if (o) b = b.slice(o.end);
      const g = readGroup(b, 0);
      if (g) b = b.slice(g.end);
    }
    await this.walk(b, st);
  }

  async list(name: string, body: string, st: Style) {
    let b = body;
    let fmt = '';
    const o = readOpt(b, 0);
    if (o) {
      fmt = o.body;
      b = b.slice(o.end);
    }
    const items = splitItems(b);
    const numbered = name !== 'itemize';
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      const label = it.label !== undefined ? it.label : numbered ? enumLabel(fmt, k + 1) : '•';
      const sub = new Builder(this.ctx);
      await sub.walk(it.text, st);
      sub.flush();
      const blocks = sub.blocks;
      const firstP = blocks.find((x) => x.k === 'p') as Extract<Block, { k: 'p' }> | undefined;
      const lab: Inline = { k: 'text', text: label + ' ', b: numbered };
      if (firstP && blocks[0] === firstP) firstP.runs.unshift(lab);
      else blocks.unshift({ k: 'p', runs: [lab] });
      for (const bl of blocks) if (bl.k === 'p') {
        bl.indent = (bl.indent || 0) + 425;
        if (bl === blocks[0]) bl.hanging = 300;
      }
      this.blocks.push(...blocks);
    }
  }

  async twoCol(left: string, right: string, st: Style) {
    const W = this.ctx.width;
    const wl = Math.round(W * 0.64);
    const wr = W - wl;
    const a = new Builder({ ...this.ctx, width: wl - 200 });
    await a.walk(left, st);
    a.flush();
    const b = new Builder({ ...this.ctx, width: wr - 200 });
    b.align = 'center';
    await b.walk(right, st);
    b.flush();
    this.blocks.push({
      k: 'table',
      borders: false,
      widths: [wl, wr],
      rows: [[{ blocks: a.blocks }, { blocks: b.blocks, align: 'center' }]],
    });
  }

  async table(name: string, body: string, st: Style) {
    let b = body;
    if (name === 'tabularx' || name === 'tabu') {
      const w = readGroup(b, 0);
      if (w) b = b.slice(w.end);
    }
    const o = readOpt(b, 0);
    if (o) b = b.slice(o.end);
    const spec = readGroup(b, 0);
    let colSpec = '';
    if (spec) {
      colSpec = spec.body;
      b = b.slice(spec.end);
    }
    const borders = /\|/.test(colSpec) || /\\hline/.test(b);
    // tách dòng (\\) và ô (&) ở cấp ngoài cùng
    const rowsRaw: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let depth = 0;
    let envDepth = 0;
    for (let i = 0; i < b.length; i++) {
      const c = b[i];
      if (c === '\\' && b[i + 1] === '\\' && depth === 0 && envDepth === 0) {
        row.push(cell);
        rowsRaw.push(row);
        row = [];
        cell = '';
        i++;
        continue;
      }
      if (c === '\\') {
        const m = /^\\(begin|end)\{/.exec(b.slice(i, i + 8));
        if (m) envDepth += m[1] === 'begin' ? 1 : -1;
        cell += c + (b[i + 1] || '');
        i++;
        continue;
      }
      if (c === '{') depth++;
      if (c === '}') depth--;
      if (c === '$') {
        // giữ nguyên đoạn toán (có thể chứa &)
        const j = findMathClose(b, i + 1, '$');
        if (j > i) {
          cell += b.slice(i, j + 1);
          i = j;
          continue;
        }
      }
      if (c === '&' && depth === 0 && envDepth === 0) {
        row.push(cell);
        cell = '';
        continue;
      }
      cell += c;
    }
    row.push(cell);
    if (row.some((x) => x.replace(/\\(hline|cline\{[^}]*\})/g, '').trim())) rowsRaw.push(row);
    const rows: Cell[][] = [];
    const spanOf = (x: string) => {
      const m = /\\multicolumn\{(\d+)\}/.exec(x);
      return m ? Number(m[1]) : 1;
    };
    const ncol = Math.max(1, ...rowsRaw.map((r) => r.reduce((t, x) => t + spanOf(x), 0)));
    const W = Math.min(this.ctx.width, ncol * 2200);
    const cw = Math.floor(W / ncol);
    for (const r of rowsRaw) {
      const cells: Cell[] = [];
      for (let x of r) {
        x = x.replace(/\\hline|\\cline\{[^}]*\}|\\toprule|\\midrule|\\bottomrule/g, '');
        let span = 1;
        const mc = /^\s*\\multicolumn\{(\d+)\}\{[^}]*\}/.exec(x);
        if (mc) {
          span = Number(mc[1]);
          const g = readGroup(x, mc.index + mc[0].length);
          x = g ? g.body : '';
        }
        const mr = /^\s*\\multirow\{[^}]*\}\{[^}]*\}/.exec(x);
        if (mr) {
          const g = readGroup(x, mr.index + mr[0].length);
          x = g ? g.body : '';
        }
        const sb = new Builder({ ...this.ctx, width: cw * span - 200 });
        sb.align = 'center';
        await sb.walk(x.trim(), st);
        sb.flush();
        cells.push({ blocks: sb.blocks, span: span > 1 ? span : undefined, align: 'center' });
      }
      rows.push(cells);
    }
    if (!rows.length) return;
    this.blocks.push({ k: 'table', rows, borders, widths: Array(ncol).fill(cw) });
  }
}

/** Nội dung → khối Word */
export async function contentToBlocks(src: string, ctx: BlockCtx): Promise<Block[]> {
  const b = new Builder(ctx);
  await b.walk(String(src || '').replace(/\r\n?/g, '\n'));
  b.flush();
  return b.blocks;
}

/** Nội dung ngắn (1 đoạn: phương án, đáp số) → các run (bảng/khối được nối bằng xuống dòng) */
export async function contentToRuns(src: string, ctx: BlockCtx): Promise<{ runs: Inline[]; blocks: Block[] }> {
  const blocks = await contentToBlocks(src, ctx);
  if (blocks.length === 1 && blocks[0].k === 'p') return { runs: blocks[0].runs, blocks: [] };
  if (!blocks.length) return { runs: [], blocks: [] };
  return { runs: [], blocks };
}

/** Ước lượng độ dài hiển thị (để xếp phương án 4/2/1 cột) */
export function visualLength(src: string): number {
  let s = String(src || '');
  if (/\\begin\{(tikzpicture|tabular|enumerate|itemize|center)\}|\\includegraphics|!\[|\$\$|\\\[/.test(s)) return 999;
  s = s
    .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a, b) => (a.length > b.length ? a : b))
    .replace(/\\(left|right|displaystyle|limits|mathrm|text|mathbb)/g, '')
    .replace(/\\[a-zA-Z]+/g, 'x')
    .replace(/[{}$^_\\]/g, '');
  return s.trim().length;
}
