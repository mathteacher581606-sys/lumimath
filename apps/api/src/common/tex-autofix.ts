/**
 * Tự động sửa lỗi LaTeX trước khi biên dịch PDF.
 *
 * Chiến lược nhiều lớp (mỗi lớp đều ghi lại "đã sửa gì"):
 *   Lớp 1 — chuẩn hoá các lệnh phổ biến hay gặp trong đề soạn tay / ex_test
 *   Lớp 2 — sửa theo thông báo lỗi thật của TeX (macro lạ, môi trường lạ, & , ngoặc)
 *   Lớp 3 — nếu vẫn lỗi: chuyển sang văn bản thuần (escape ký tự) để PDF luôn xuất được
 */

export interface AutoFixResult {
  tex: string;
  fixes: string[];
}

/** Lệnh lõi — không bao giờ xoá dù log báo "Undefined control sequence" */
const CORE_MACROS = new Set([
  // cấu trúc
  'documentclass', 'usepackage', 'begin', 'end', 'item', 'par', 'noindent', 'centering',
  'section', 'subsection', 'subsubsection', 'paragraph', 'newpage', 'clearpage', 'hline',
  'cline', 'vspace', 'hspace', 'newline', 'linebreak', 'pagebreak', 'quad', 'qquad',
  'setlength', 'renewcommand', 'newcommand', 'providecommand', 'def', 'let', 'makeatletter',
  'makeatother', 'ensuremath', 'textwidth', 'linewidth', 'columnwidth', 'arraystretch',
  'tabcolsep', 'pagestyle', 'thispagestyle', 'pagenumbering', 'tableofcontents',
  'maketitle', 'protect', 'relax', 'gdef', 'xdef', 'edef', 'global', 'long', 'outer',
  'expandafter', 'csname', 'endcsname', 'geometry', 'includegraphics', 'caption', 'label',
  'ref', 'cite', 'thanks', 'and', 'itemsep', 'leftmargin', 'labelsep', 'topsep',
  // chữ
  'textbf', 'textit', 'underline', 'emph', 'texttt', 'text', 'textrm', 'textsf',
  'textsc', 'textsuperscript', 'textsubscript', 'mbox', 'hbox', 'vbox', 'fbox',
  'large', 'Large', 'LARGE', 'huge', 'Huge', 'small', 'footnotesize', 'scriptsize',
  'tiny', 'normalsize', 'bfseries', 'itshape', 'rmfamily', 'sffamily', 'mdseries',
  // toán
  'frac', 'dfrac', 'tfrac', 'sqrt', 'left', 'right', 'cdot', 'times', 'div', 'pm', 'mp',
  'le', 'leq', 'ge', 'geq', 'ne', 'neq', 'approx', 'equiv', 'sim', 'infty', 'sum', 'prod',
  'int', 'iint', 'oint', 'lim', 'log', 'ln', 'lg', 'exp', 'sin', 'cos', 'tan', 'cot',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'pi', 'alpha', 'beta', 'gamma', 'delta',
  'Delta', 'theta', 'lambda', 'mu', 'nu', 'rho', 'sigma', 'Sigma', 'tau', 'varphi', 'phi',
  'Phi', 'omega', 'Omega', 'varepsilon', 'epsilon', 'forall', 'exists', 'in', 'ni',
  'notin', 'subset', 'supset', 'subseteq', 'supseteq', 'cup', 'cap', 'setminus',
  'emptyset', 'mathbb', 'mathbbm', 'mathcal', 'mathrm', 'mathbf', 'mathit', 'mathsf',
  'operatorname', 'overrightarrow', 'overleftarrow', 'overline', 'underline', 'vec',
  'hat', 'widehat', 'bar', 'tilde', 'dot', 'ddot', 'textstyle', 'displaystyle',
  'scriptstyle', 'limits', 'nolimits', 'substack', 'stackrel', 'underset', 'overset',
  'binom', 'choose', 'ldots', 'cdots', 'vdots', 'ddots', 'dots', 'to', 'rightarrow',
  'leftarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'longrightarrow',
  'circ', 'bullet', 'angle', 'triangle', 'perp', 'parallel', 'cong', 'subsetneq',
  'not', 'neg', 'land', 'lor', 'prime', 'partial', 'nabla', 'ell', 'hbar', 'Re', 'Im',
  'boxed', 'tag', 'nonumber', 'notag', 'intertext', 'shortintertext',
  // tikz (giữ để hình vẽ còn dùng được)
  'draw', 'node', 'coordinate', 'fill', 'filldraw', 'path', 'scope', 'foreach', 'pic',
  'clip', 'shade', 'shadedraw', 'pattern', 'matrix', 'chain', 'graph', 'addplot',
  'tikzset', 'usetikzlibrary', 'pgfmathsetmacro', 'pgfmathparse', 'pgfmathresult',
  'fillbetween', 'tkzDrawPoints', 'tkzLabelPoints', 'tkzDrawSegments',
  // ex_test / macro toán Việt Nam — được định nghĩa sẵn trong preamble
  'heva', 'hoac', 'itemEX', 'itemch', 'itemchoice', 'True', 'False', 'dapso',
  'immini', 'choice', 'loigiai', 'hoac', 'vecto', 'vec',
]);

/** Đọc một đối số {...} có cân bằng ngoặc, bắt đầu tìm từ vị trí `start` */
function readArg(tex: string, start: number): { arg: string; end: number } | null {
  let i = start;
  while (i < tex.length && /\s/.test(tex[i])) i++;
  if (tex[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < tex.length; j++) {
    const ch = tex[j];
    if (ch === '\\') {
      j++; // bỏ qua ký tự bị escape
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { arg: tex.slice(i + 1, j), end: j + 1 };
    }
  }
  return null;
}

/** Bỏ một macro dạng \name{arg1}{arg2}..., giữ lại danh sách đối số muốn giữ */
function rewriteMacro(
  tex: string,
  name: string,
  keepArgs: number[],
): { tex: string; changed: boolean } {
  const token = '\\' + name;
  let out = '';
  let i = 0;
  let changed = false;
  while (true) {
    const idx = tex.indexOf(token, i);
    if (idx === -1) {
      out += tex.slice(i);
      break;
    }
    const after = tex[idx + token.length] || '';
    if (/[a-zA-Z@]/.test(after)) {
      out += tex.slice(i, idx + token.length);
      i = idx + token.length;
      continue;
    }
    out += tex.slice(i, idx);
    let p = idx + token.length;
    const kept: string[] = [];
    let consumed = 0;
    // bỏ qua đối số tuỳ chọn [...]
    while (p < tex.length && /\s/.test(tex[p])) p++;
    if (tex[p] === '[') {
      let j = p + 1;
      while (j < tex.length && tex[j] !== ']') j++;
      p = j + 1;
    }
    for (let k = 0; k < 8; k++) {
      const arg = readArg(tex, p);
      if (!arg) break;
      if (keepArgs.includes(k)) kept.push(arg.arg);
      p = arg.end;
      consumed++;
    }
    if (!consumed) {
      out += token;
      i = idx + token.length;
      continue;
    }
    out += kept.join(' ');
    i = p;
    changed = true;
  }
  return { tex: out, changed };
}

/** Cân bằng ngoặc nhọn: thêm } còn thiếu hoặc bỏ } thừa */
function balanceBraces(tex: string): { tex: string; changed: boolean } {
  let depth = 0;
  let extraAt = -1;
  for (let i = 0; i < tex.length; i++) {
    const ch = tex[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth < 0) {
        extraAt = i;
        break;
      }
    }
  }
  if (depth > 0) return { tex: tex + '}'.repeat(depth), changed: true };
  if (extraAt >= 0) {
    return { tex: tex.slice(0, extraAt) + tex.slice(extraAt + 1), changed: true };
  }
  return { tex, changed: false };
}

/** Lớp 1 — chuẩn hoá các lệnh phổ biến (chạy trước mọi lần biên dịch) */
export function normalizeTex(input: string): AutoFixResult {
  let tex = String(input ?? '');
  const fixes: string[] = [];

  // Ký tự hỏng: surrogate lẻ (emoji bị cắt) và ký tự điều khiển → LaTeX báo
  // "Invalid UTF-8 byte" nếu còn. Bỏ trước mọi bước khác.
  if (/[\uD800-\uDFFF]|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(tex)) {
    tex = tex
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
      .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '');
    fixes.push('bỏ ký tự hỏng (surrogate lẻ / ký tự điều khiển)');
  }

  // Dấu trích dẫn kiểu LaTeX cũ → ngoặc kép thật
  if (/\\lq|\\rq/.test(tex)) {
    tex = tex
      .replace(/\\lq\\lq/g, '\u201C')
      .replace(/\\rq\\rq/g, '\u201D')
      .replace(/\\lq/g, '\u2018')
      .replace(/\\rq/g, '\u2019');
    fixes.push('thay \\lq/\\rq bằng ngoặc kép');
  }

  // Lệnh khoảng cách / xuống dòng thừa
  if (/\\break(?![a-zA-Z])|\\qquad(?![a-zA-Z])|\\quad(?![a-zA-Z])/.test(tex)) {
    tex = tex
      .replace(/\\break(?![a-zA-Z])/g, ' ')
      .replace(/\\qquad(?![a-zA-Z])/g, '\\quad ')
      .replace(/\\quad(?![a-zA-Z])/g, ' ');
    fixes.push('bỏ \\break/\\qquad/\\quad thừa');
  }

  // \True / \False (ex_test) → chữ hiển thị được
  if (/\\True(?![a-zA-Z])|\\False(?![a-zA-Z])/.test(tex)) {
    tex = tex
      .replace(/\\True(?![a-zA-Z])/g, 'Đúng')
      .replace(/\\False(?![a-zA-Z])/g, 'Sai');
    fixes.push('đổi \\True/\\False thành Đúng/Sai');
  }

  // ex_test: bỏ lớp bọc \begin{ex}...\end{ex}, \loigiai{...}
  if (/\\begin\{ex\}|\\loigiai\b|\\end\{ex\}/.test(tex)) {
    tex = tex
      .replace(/\\begin\{ex\}(\[[^\]]*\])?/g, '')
      .replace(/\\end\{ex\}/g, '');
    const loigiai = rewriteMacro(tex, 'loigiai', []);
    if (loigiai.changed) tex = loigiai.tex;
    fixes.push('bỏ lớp bọc ex_test (\\begin{ex}, \\loigiai)');
  }

  // \immini{text}{hình} → chỉ giữ phần text (hình có thể là tikz lồng nhiều ngoặc)
  if (/\\immini(?![a-zA-Z])/.test(tex)) {
    const r = rewriteMacro(tex, 'immini', [0]);
    if (r.changed) {
      tex = r.tex;
      fixes.push('bỏ \\immini, giữ phần nội dung');
    }
  }

  // \choice{a}{b}{c}{d} → danh sách A. B. C. D. trên từng dòng
  if (/\\choice(?![a-zA-Z])/.test(tex)) {
    let out = '';
    let rest = tex;
    let changed = false;
    while (true) {
      const idx = rest.indexOf('\\choice');
      if (idx === -1) {
        out += rest;
        break;
      }
      const after = rest[idx + 7] || '';
      if (/[a-zA-Z@]/.test(after)) {
        out += rest.slice(0, idx + 7);
        rest = rest.slice(idx + 7);
        continue;
      }
      out += rest.slice(0, idx);
      let p = idx + 7;
      const opts: string[] = [];
      for (let k = 0; k < 8; k++) {
        const arg = readArg(rest, p);
        if (!arg) break;
        opts.push(arg.arg.trim());
        p = arg.end;
      }
      if (!opts.length) {
        out += '\\choice';
        rest = rest.slice(idx + 7);
        continue;
      }
      out +=
        '\n' +
        opts
          .map((o, k) => `\\textbf{${'ABCDEFGH'[k] || k + 1}.} ${o}`)
          .join('\\\\\n') +
        '\n';
      rest = rest.slice(p);
      changed = true;
    }
    if (changed) {
      tex = out;
      fixes.push('chuyển \\choice thành danh sách lựa chọn');
    }
  }

  // \dapso{x} → Đáp số
  if (/\\dapso(?![a-zA-Z])/.test(tex)) {
    let out = '';
    let rest = tex;
    let changed = false;
    while (true) {
      const idx = rest.indexOf('\\dapso');
      if (idx === -1) {
        out += rest;
        break;
      }
      out += rest.slice(0, idx);
      const arg = readArg(rest, idx + 6);
      if (arg) {
        out += `\\textbf{Đáp số:} ${arg.arg}`;
        rest = rest.slice(arg.end);
        changed = true;
      } else {
        out += '\\dapso';
        rest = rest.slice(idx + 6);
      }
    }
    if (changed) {
      tex = out;
      fixes.push('đổi \\dapso thành "Đáp số"');
    }
  }

  return { tex, fixes };
}

/** Tên macro chưa định nghĩa theo log TeX: lệnh CUỐI của dòng ngữ cảnh ngay sau "! Undefined…" */
export function undefinedMacrosFromLog(log: string): string[] {
  const names = new Set<string>();
  const lines = String(log || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/Undefined control sequence/i.test(lines[i])) continue;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const ln = lines[j];
      if (!ln.trim()) continue;
      const all = ln.match(/\\[a-zA-Z@]+/g);
      if (all && all.length) {
        names.add(all[all.length - 1].slice(1));
        break;
      }
      if (/^\s*l\.\d+/.test(ln)) break;
    }
  }
  return Array.from(names);
}

const TABLEISH =
  'tabular|tabularx|longtable|array|align\\*?|aligned|alignat\\*?|alignedat|cases|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|split|gathered|eqnarray\\*?|tikzpicture|tkzTab';

/** Escape & lạc ở dòng TeX báo lỗi (l.<số>), chỉ khi dòng đó không ở trong môi trường căn cột */
export function escapeAmpAtErrorLine(
  tex: string,
  log: string,
): { tex: string; changed: boolean; line?: number } {
  const m = /(?:^|\n)\s*l\.(\d+)/.exec(String(log || ''));
  if (!m) return { tex, changed: false };
  const lines = tex.split('\n');
  const n = Number(m[1]);
  const beginRe = new RegExp('\\\\begin\\{(?:' + TABLEISH + ')\\}', 'g');
  const endRe = new RegExp('\\\\end\\{(?:' + TABLEISH + ')\\}', 'g');
  const depthBefore = (idx: number) => {
    let d = 0;
    for (let k = 0; k < idx; k++) {
      d += (lines[k].match(beginRe) || []).length - (lines[k].match(endRe) || []).length;
    }
    return d;
  };
  // Dòng báo lỗi (cho phép lệch ±2 dòng nếu server chèn/bớt dòng mở đầu)
  for (const cand of [n, n - 1, n + 1, n - 2, n + 2]) {
    const idx = cand - 1;
    if (idx < 0 || idx >= lines.length) continue;
    const line = lines[idx];
    if (!/(?<!\\)&/.test(line)) continue;
    if (depthBefore(idx) > 0) continue;
    if (beginRe.test(line)) {
      beginRe.lastIndex = 0;
      continue;
    }
    beginRe.lastIndex = 0;
    lines[idx] = line.replace(/(?<!\\)&/g, '\\&');
    return { tex: lines.join('\n'), changed: true, line: cand };
  }
  return { tex, changed: false };
}

/** Lớp 2 — sửa theo log lỗi thật của TeX */
export function fixFromLog(tex: string, log: string): AutoFixResult {
  let out = tex;
  const fixes: string[] = [];
  const src = String(log || '');

  // 1) Environment ... undefined → bỏ môi trường đó, giữ nội dung
  const envRe = /Environment\s+([a-zA-Z*]+)\s+undefined/gi;
  let em: RegExpExecArray | null;
  while ((em = envRe.exec(src))) {
    const env = em[1];
    const before = out;
    out = out
      .replace(new RegExp(`\\\\begin\\{${env}\\}(\\[[^\\]]*\\])?`, 'g'), '')
      .replace(new RegExp(`\\\\end\\{${env}\\}`, 'g'), '');
    if (out !== before) fixes.push(`bỏ môi trường lạ \\begin{${env}}`);
  }

  // 2) Undefined control sequence → CHỈ xoá macro được TeX nêu tên trong log
  //    (trước đây quét cả tài liệu → xoá nhầm \choiceTF, \shortans, \tkzTabInit… làm nát đề)
  if (/Undefined control sequence/i.test(src)) {
    for (const name of undefinedMacrosFromLog(src)) {
      if (CORE_MACROS.has(name)) continue;
      const before = out;
      // \ten{đối số} → giữ đối số đầu (không mất chữ); \ten trơn → bỏ (không cắt nhầm \tenDai)
      const r = rewriteMacro(out, name, [0]);
      out = r.changed
        ? r.tex
        : out.replace(new RegExp('\\\\' + name + '(?![a-zA-Z@])', 'g'), ' ');
      if (out !== before) fixes.push(`xoá macro lạ \\${name}`);
    }
  }

  // 3) Misplaced alignment tab character & → escape & ở ĐÚNG DÒNG báo lỗi
  //    (dòng đó không nằm trong bảng/hệ/ma trận). Không còn đòi cả tài liệu không có bảng.
  if (/Misplaced alignment tab character/i.test(src)) {
    const r = escapeAmpAtErrorLine(out, src);
    if (r.changed) {
      out = r.tex;
      fixes.push('escape ký tự & lạc ở dòng ' + r.line);
    }
  }

  // 4) Ngoặc nhọn lệch
  if (/Missing [{}] inserted|Extra \}|Missing \\}/i.test(src)) {
    const b = balanceBraces(out);
    if (b.changed) {
      out = b.tex;
      fixes.push('cân bằng lại ngoặc nhọn');
    }
  }

  // 5) Môi trường tikz lỗi → bỏ cả khối tikz (giữ PDF chạy được)
  if (/tikz|pgf/i.test(src) && /\\begin\{tikzpicture\}/.test(out)) {
    const before = out;
    out = out.replace(
      /\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g,
      '\n\\textit{[hình vẽ]}\n',
    );
    if (out !== before) fixes.push('bỏ khối tikz lỗi, thay bằng ghi chú');
  }

  return { tex: out, fixes };
}

/** Chuyển LaTeX sang văn bản thuần (fallback cuối, PDF luôn ra được) */
export function texToPlainText(input: string): string {
  let s = String(input ?? '');
  s = s.replace(/\\begin\{[^}]*\}(\[[^\]]*\])?/g, '\n');
  s = s.replace(/\\end\{[^}]*\}/g, '\n');
  // nhiều lượt để bóc các lớp macro lồng nhau
  for (let i = 0; i < 5; i++) {
    s = s.replace(/\\[a-zA-Z@]+\s*(\[[^\]]*\])?\s*\{([^{}]*)\}/g, '$2');
  }
  s = s.replace(/\\[a-zA-Z@]+\s*/g, ' ');
  s = s.replace(/\\\\/g, '\n');
  s = s.replace(/&/g, ' | ');
  s = s.replace(/[{}$]/g, '');
  s = s.replace(/[ \t]+/g, ' ');
  // Bỏ ký tự LaTeX không dựng được: emoji, ký hiệu trang trí, ký tự thay thế
  s = s.replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{FFFD}]/gu,
    '',
  );
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}
