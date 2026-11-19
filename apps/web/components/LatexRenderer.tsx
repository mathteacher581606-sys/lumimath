'use client';

import { memo, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// ============ Dự phòng: công thức KaTeX không hiểu → biên dịch bằng TeX Live (server) ============
const mathImageCache = new Map<string, string>();

function MathImage({ latex }: { latex: string }) {
  const [url, setUrl] = useState<string | null>(
    () => mathImageCache.get(latex) || null,
  );
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (url || err) return;
    let cancelled = false;
    (async () => {
      try {
        const token =
          typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const res = await fetch('/api/exams/compile-math', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ latex }),
        });
        if (!res.ok) throw new Error('compile failed');
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        mathImageCache.set(latex, objUrl);
        if (!cancelled) setUrl(objUrl);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [latex, url, err]);

  if (url) {
    return (
      <img
        src={url}
        alt="công thức"
        style={{ maxWidth: '100%', verticalAlign: 'middle', display: 'inline-block' }}
      />
    );
  }
  if (err) {
    return (
      <code style={{ fontSize: '0.9em', color: 'var(--color-muted)' }}>
        {latex}
      </code>
    );
  }
  return <span style={{ opacity: 0.55 }}>⏳</span>;
}

// Kiểm tra KaTeX có hiểu công thức không.
// QUAN TRỌNG: phải kiểm tra ĐÚNG chế độ sẽ hiển thị — rehype-katex render $$...$$ ở
// display mode, còn $...$ ở inline. Các môi trường như align*/align/gather chỉ hợp lệ
// ở display mode, nên nếu luôn thử displayMode:false sẽ "tưởng" là lỗi và bỏ sang ảnh.
function katexOk(latex: string, displayMode = false): boolean {
  try {
    katex.renderToString(latex, { throwOnError: true, displayMode });
    return true;
  } catch {
    return false;
  }
}

// ============ Dự phòng: ĐOẠN LaTeX (enumerate/center/itemize/itemchoice...) → TeX Live → ảnh ============
const latexImageCache = new Map<string, string>();

function LatexBlock({ latex }: { latex: string }) {
  const [url, setUrl] = useState<string | null>(
    () => latexImageCache.get(latex) || null,
  );
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (url || err) return;
    let cancelled = false;
    (async () => {
      try {
        const token =
          typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const res = await fetch('/api/exams/compile-latex', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ latex }),
        });
        if (!res.ok) throw new Error('compile failed');
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        latexImageCache.set(latex, objUrl);
        if (!cancelled) setUrl(objUrl);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [latex, url, err]);

  if (url) {
    return <img src={url} alt="LaTeX" style={{ maxWidth: '100%', display: 'block', margin: '8px 0' }} />;
  }
  if (err) {
    return (
      <code style={{ fontSize: '0.85em', color: 'var(--color-muted)', whiteSpace: 'pre-wrap' }}>
        {latex}
      </code>
    );
  }
  return <span style={{ opacity: 0.55 }}>⏳ Đang biên dịch…</span>;
}

// Các môi trường LaTeX dạng VĂN BẢN → giao cho TeX Live (KaTeX không hiểu)
const TEXT_ENVS =
  'center|enumerate|itemize|itemch|itemchoice|enumEX|listEX|description|flushleft|flushright|quote|quotation|verbatim|tabular|tabbing|minipage|figure|table|multicols';

// ============ Macro text: \textbf \textit \underline (ngoài math) → markdown ============
function applyTextMacros(text: string): string {
  const parts: string[] = [];
  let t = text
    .replace(/\\textbf\{([\s\S]*?)\}/g, (m: string, p1: string) => {
      const i = parts.length;
      parts.push('**' + p1.trim() + '**');
      return `\u0000B${i}\u0000`;
    })
    .replace(/\\textit\{([\s\S]*?)\}/g, (m: string, p1: string) => {
      const i = parts.length;
      parts.push('*' + p1.trim() + '*');
      return `\u0000B${i}\u0000`;
    })
    .replace(/\\underline\{([\s\S]*?)\}/g, (m: string, p1: string) => {
      const i = parts.length;
      parts.push('<u>' + p1.trim() + '</u>');
      return `\u0000B${i}\u0000`;
    });
  t = t.replace(/\u0000B(\d+)\u0000/g, (m: string, i: string) => parts[Number(i)] ?? m);
  // Xuống dòng khi hiển thị đáp án/lời giải:
  // \\ + xuống dòng → 1 lần hard break (tránh lặp đôi)
  t = t.replace(/\\\\[\s]*\n/g, '  \n');
  // bỏ dấu \ đơn ở cuối dòng (LaTeX xuống dòng kiểu cũ)
  t = t.replace(/\\(?=\n)/g, '');
  // \\ còn lại → hard break
  t = t.replace(/\\\\/g, '  \n');
  // Xuống dòng đơn trong văn bản → hard break
  t = t.replace(/([^\n])\n(?!\n)/g, '$1  \n');
  return t;
}

// ============ Macro trong math: KaTeX không có \textbf/\textit → chuyển sang lệnh chuẩn ============
// Quét thủ công bằng indexOf + matchBrace (xử lý được cả LỒNG NHAU)
function replaceMacroBlocks(
  input: string,
  macro: string,
  wrap: (inner: string) => string,
): string {
  let out = '';
  let i = 0;
  const open = '\\' + macro + '{';
  while (true) {
    const idx = input.indexOf(open, i);
    if (idx === -1) {
      out += input.slice(i);
      break;
    }
    const end = matchBrace(input, idx + open.length - 1);
    const innerRaw = input.slice(idx + open.length, end);
    const inner = replaceMacroBlocks(innerRaw, macro, wrap); // đệ quy cho lồng nhau
    out += input.slice(i, idx) + wrap(inner);
    i = end + 1;
  }
  return out;
}

function applyMathMacros(math: string): string {
  let m = math
    // Xuống dòng trong math (cases/matrix/align) → dấu \\ ngăn dòng
    .replace(/\\\\?\s*[\r\n]+/g, ' \\\\ ')
    .replace(/[\r\n]+/g, ' \\\\ ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\\textbf\{/g, '\\mathbf{')
    .replace(/\\textit\{/g, '\\mathit{')
    .replace(/\\textsf\{/g, '\\mathsf{')
    .replace(/\\texttt\{/g, '\\mathtt{');

  // \heva{...} (hệ phương trình VN) → \begin{cases}...\end{cases}
  m = replaceMacroBlocks(
    m,
    'heva',
    (inner) => `\\begin{cases}${inner}\\end{cases}`,
  );

  // \hoac{...} ("hoặc" VN) → \left[\begin{aligned}...\end{aligned}\right.
  m = replaceMacroBlocks(
    m,
    'hoac',
    (inner) => `\\left[\\begin{aligned}${inner}\\end{aligned}\\right.`,
  );

  // \wideparen{...} (cung tròn rộng — KaTeX không có) → \overgroup{...}
  m = replaceMacroBlocks(m, 'wideparen', (inner) => `\\overgroup{${inner}}`);

  return m;
}

// Tiền xử lý: chuyển các cú pháp LaTeX phổ biến sang markdown + math
// Chịu được công thức $...$ xuống dòng, $$...$$, \[...\], \(...\)
function preprocessMath(content: string): string {
  let c = content || '';

  // BỎ THỤT ĐẦU DÒNG (tab/khoảng trắng) — nếu không markdown hiểu nhầm
  // thành CODE BLOCK → công thức không render + tràn dòng
  c = c.replace(/^[ \t]+/gm, '');

  // Bỏ lệnh trang trí LaTeX hay lộ ra thành chữ (không có tác dụng khi hiển thị web)
  c = c.replace(/\\allowdisplaybreaks(\[\d+\])?/g, '');

  // 1. Bảo vệ toàn bộ khối math bằng token → xử lý macro riêng bên trong
  const mathTokens: string[] = [];
  c = c.replace(/\$\$([\s\S]*?)\$\$/g, (m: string, p1: string) => {
    const i = mathTokens.length;
    mathTokens.push('$$' + applyMathMacros(p1) + '$$');
    return `\u0000M${i}\u0000`;
  });
  c = c.replace(/\\\[([\s\S]*?)\\\]/g, (m: string, p1: string) => {
    const i = mathTokens.length;
    mathTokens.push('$$' + applyMathMacros(p1) + '$$');
    return `\u0000M${i}\u0000`;
  });
  c = c.replace(/\\\(([\s\S]*?)\\\)/g, (m: string, p1: string) => {
    const i = mathTokens.length;
    mathTokens.push('$' + applyMathMacros(p1) + '$');
    return `\u0000M${i}\u0000`;
  });
  c = c.replace(/\$([^$]+)\$/g, (m: string, p1: string) => {
    const i = mathTokens.length;
    mathTokens.push('$' + applyMathMacros(p1) + '$');
    return `\u0000M${i}\u0000`;
  });

  // 2. Khối \begin{cases}/matrix/align... TRẦN (không nằm trong $) → bọc $$...$$
  //    và chuẩn hóa ngắt dòng thành \\ — đưa vào token math để các bước sau không đụng vào
  const fixRows = (inner: string): string =>
    inner
      .replace(/\\\\?\s*[\r\n]+/g, ' \\\\ ')
      .replace(/[\r\n]+/g, ' \\\\ ')
      .trim()
      .replace(/^\s*\\\\\s*/, '')
      .replace(/\\\\\s*$/, '')
      .trim();

  c = c.replace(
    /\\begin\{(cases|aligned|alignedat|array|matrix|pmatrix|bmatrix|vmatrix)\}([\s\S]*?)\\end\{\1\}/g,
    (m: string, env: string, inner: string) => {
      const fixed = applyMathMacros(fixRows(inner));
      const i = mathTokens.length;
      mathTokens.push(`$$\n\\begin{${env}}${fixed}\\end{${env}}\n$$`);
      return `\u0000M${i}\u0000`;
    },
  );

  // 2a. align*/eqnarray* TRẦN → bọc $$...$$ (eqnarray → aligned, KaTeX không có eqnarray)
  c = c.replace(
    /\\begin\{(align\*?|aligned|eqnarray\*?)\}([\s\S]*?)\\end\{\1\}/g,
    (m: string, env: string, inner: string) => {
      const e = env.startsWith('eqnarray') ? 'aligned' : env;
      const fixed = applyMathMacros(fixRows(inner));
      const i = mathTokens.length;
      mathTokens.push(`$$\n\\begin{${e}}${fixed}\\end{${e}}\n$$`);
      return `\u0000M${i}\u0000`;
    },
  );

  // 2b. \heva{...} (hệ phương trình — macro VN) → cases (quét thủ công vì ngoặc lồng nhau)
  {
    let out = '';
    let last = 0;
    const hevaRe = /\\heva\{/g;
    let hm: RegExpExecArray | null;
    while ((hm = hevaRe.exec(c)) !== null) {
      const end = matchBrace(c, hm.index + hm[0].length - 1);
      const inner = c.slice(hm.index + hm[0].length, end);
      const fixed = fixRows(inner);
      const i = mathTokens.length;
      mathTokens.push(`$$\n\\begin{cases}${fixed}\\end{cases}\n$$`);
      out += c.slice(last, hm.index) + `\u0000M${i}\u0000`;
      last = end + 1;
    }
    out += c.slice(last);
    c = out;
  }

  // 3. Lệnh text ngoài math → markdown đậm/nghiêng/gạch chân + xuống dòng
  c = applyTextMacros(c);

  // 4. Tách 2 khối math INLINE liền kề (token nối nhau) → chèn khoảng trắng
  //    để remark-math không hiểu nhầm $$ là mở display math (không render được)
  c = c.replace(/\u0000M(\d+)\u0000\u0000M(\d+)\u0000/g, (m: string, a: string, b: string) => {
    const ta = mathTokens[Number(a)] ?? '';
    const tb = mathTokens[Number(b)] ?? '';
    const inlineA = ta.startsWith('$') && !ta.startsWith('$$');
    const inlineB = tb.startsWith('$') && !tb.startsWith('$$');
    if (inlineA && inlineB) return `\u0000M${a}\u0000 \u0000M${b}\u0000`;
    return m;
  });

  // 5. Khôi phục các khối math
  c = c.replace(/\u0000M(\d+)\u0000/g, (m: string, i: string) => mathTokens[Number(i)] ?? m);

  // 6. Môi trường danh sách / căn giữa → HTML gốc (công thức bên trong vẫn do KaTeX vẽ)
  //    → chữ thật, chọn được, đúng font, không cần gọi TeX Live
  c = c.replace(
    /\\begin\{itemch(?:oice)?\}([\s\S]*?)\\end\{itemch(?:oice)?\}/g,
    (_m: string, inner: string) => `\n\n\\begin{itemize}${inner}\\end{itemize}\n\n`,
  );
  c = c.replace(/\\itemch(?![a-zA-Z])/g, '\\item');
  c = c.replace(
    /\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g,
    (_m: string, inner: string) => {
      const items = inner
        .split(/\\item(?![a-zA-Z])/)
        .slice(1)
        .map((s) => s.trim())
        .filter(Boolean);
      return items.length ? `\n\n${items.map((t) => `- ${t}`).join('\n')}\n\n` : '\n\n';
    },
  );
  c = c.replace(
    /\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g,
    (_m: string, inner: string) => {
      const items = inner
        .split(/\\item(?![a-zA-Z])/)
        .slice(1)
        .map((s) => s.trim())
        .filter(Boolean);
      return items.length
        ? `\n\n${items.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n`
        : '\n\n';
    },
  );
  c = c.replace(
    /\\begin\{center\}([\s\S]*?)\\end\{center\}/g,
    (_m: string, inner: string) => `\n\n${inner.trim()}\n\n`,
  );

  return c;
}

type Part =
  | { type: 'md'; text: string }
  | { type: 'tikz'; snippet: string; preamble: string; centered: boolean }
  | { type: 'latex'; snippet: string; centered: boolean }
  | { type: 'immini'; text: string; figure: string; preamble: string; centered: boolean };

// Xóa comment LaTeX: mọi thứ sau dấu % (không có \ trước) tới hết dòng
function stripLatexComments(content: string): string {
  return (content || '').replace(/(^|[^\\])%.*$/gm, '$1');
}

// Tìm vị trí đóng ngoặc nhọn cân bằng (bắt đầu từ vị trí '{')
function matchBrace(c: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < c.length; i++) {
    if (c[i] === '\\') {
      i++;
      continue;
    }
    if (c[i] === '{') depth++;
    else if (c[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return c.length - 1;
}

// Tìm các khối \begin{tikzpicture}...\end{tikzpicture} CÂN BẰNG (chịu được tikzpicture LỒNG NHAU,
// ví dụ \def\pica{\begin{tikzpicture}...\end{tikzpicture}} nằm trong 1 tikzpicture ngoài)
function findBalancedTikz(text: string): { snippet: string; start: number; end: number }[] {
  const out: { snippet: string; start: number; end: number }[] = [];
  const t = text || '';
  const BEGIN = '\\begin{tikzpicture}';
  const END = '\\end{tikzpicture}';
  let idx = 0;
  while ((idx = t.indexOf(BEGIN, idx)) !== -1) {
    let depth = 1;
    let pos = idx + BEGIN.length;
    let ok = false;
    while (depth > 0) {
      const nb = t.indexOf(BEGIN, pos);
      const ne = t.indexOf(END, pos);
      if (ne === -1) break;
      if (nb !== -1 && nb < ne) {
        depth++;
        pos = nb + BEGIN.length;
      } else {
        depth--;
        pos = ne + END.length;
      }
    }
    ok = depth === 0;
    if (ok) {
      out.push({ snippet: t.slice(idx, pos), start: idx, end: pos });
      idx = pos;
    } else {
      idx = idx + BEGIN.length;
    }
  }
  return out;
}

// Gom các định nghĩa preamble: \tikzset{...}, \newcommand...{...}, \def\...{...}
// (thường là macro vẽ hình như \tikzset{koi_red/.pic={...}}) để đính kèm khi biên dịch TikZ,
// và loại bỏ khỏi phần văn bản hiển thị.
function collectPreamble(content: string): { preamble: string; cleaned: string } {
  const src = content || '';
  const spans: { start: number; end: number; text: string }[] = [];
  const re = /\\(tikzset|newcommand|renewcommand|providecommand|def)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const macro = m[1];
    let p = m.index + m[0].length;
    while (p < src.length && /\s/.test(src[p])) p++;
    let end = -1;

    if (macro === 'tikzset') {
      if (src[p] === '{') end = matchBrace(src, p);
    } else {
      // newcommand/renewcommand/providecommand/def: thân = ngoặc nhọn cuối cùng
      let cursor = p;
      let lastBraceEnd = -1;
      while (cursor < src.length) {
        if (src[cursor] === '\\') {
          cursor += 2;
          while (cursor < src.length && /[a-zA-Z@]/.test(src[cursor])) cursor++;
        } else if (src[cursor] === '{') {
          lastBraceEnd = matchBrace(src, cursor);
          cursor = lastBraceEnd + 1;
        } else if (src[cursor] === '[') {
          let j = cursor + 1;
          while (j < src.length && src[j] !== ']') j++;
          cursor = j + 1;
        } else if (src[cursor] === '#') {
          cursor++;
          while (cursor < src.length && /[0-9]/.test(src[cursor])) cursor++;
        } else {
          break;
        }
        while (cursor < src.length && /\s/.test(src[cursor])) cursor++;
      }
      if (lastBraceEnd >= 0) end = lastBraceEnd;
    }

    if (end < 0) continue;
    spans.push({
      start: m.index,
      end: end + 1,
      text: src.slice(m.index, end + 1),
    });
    re.lastIndex = end + 1;
  }

  let cleaned = src;
  for (let i = spans.length - 1; i >= 0; i--) {
    cleaned = cleaned.slice(0, spans[i].start) + cleaned.slice(spans[i].end);
  }
  return { preamble: spans.map((s) => s.text).join('\n'), cleaned };
}

// Tách nội dung thành các phần markdown, hình/bảng (tikz/tabular), khối LaTeX phức tạp và \immini
function splitParts(content: string): Part[] {
  const { preamble, cleaned } = collectPreamble(content || '');
  const c = cleaned;

  // Tập hợp mọi "khối đặc biệt" theo vị trí
  const blocks: { start: number; end: number; part: Part }[] = [];

  // 0) Khối \begin{center}...\end{center} chứa \resizebox/\newcommand (hình phức tạp,
  //    macro lồng nhau) → biên dịch CẢ khối làm 1 ảnh LaTeX (không tách tikzpicture bên trong)
  const complexCenterRe = /\\begin\{center\}([\s\S]*?)\\end\{center\}/g;
  let cm: RegExpExecArray | null;
  while ((cm = complexCenterRe.exec(c)) !== null) {
    if (/\\resizebox|\\newcommand|\\renewcommand|\\def\\/.test(cm[1])) {
      blocks.push({
        start: cm.index,
        end: cm.index + cm[0].length,
        part: { type: 'latex', snippet: cm[0], centered: false },
      });
    }
  }
  // 0b) Khối \begin{multicols}{n}...\end{multicols} chứa hình → biên dịch CẢ KHỐI
  //     (giữ bố cục nhiều cột; nếu tách riêng từng tikzpicture sẽ vỡ bố cục)
  const multicolsRe = /\\begin\{multicols\}\{\d+\}([\s\S]*?)\\end\{multicols\}/g;
  while ((cm = multicolsRe.exec(c)) !== null) {
    if (/\\begin\{tikz/.test(cm[0])) {
      blocks.push({
        start: cm.index,
        end: cm.index + cm[0].length,
        part: { type: 'latex', snippet: cm[0], centered: false },
      });
    }
  }
  const insideComplex = (start: number, end: number) =>
    blocks.some(
      (b) => b.part.type === 'latex' && start >= b.start && end <= b.end,
    );

  // tikzpicture: khớp CÂN BẰNG (chịu lồng nhau) ; tabular: regex đơn giản
  const balancedTikz = findBalancedTikz(c);
  for (const b of balancedTikz) {
    if (insideComplex(b.start, b.end)) continue;
    blocks.push({
      start: b.start,
      end: b.end,
      part: { type: 'tikz', snippet: b.snippet, preamble, centered: false },
    });
  }
  const tabularRe = /\\begin\{tabular\}(\[[^\]]*\])?[\s\S]*?\\end\{tabular\}/g;
  let m: RegExpExecArray | null;
  while ((m = tabularRe.exec(c)) !== null) {
    if (insideComplex(m.index, m.index + m[0].length)) continue;
    const mIndex = m.index;
    if (balancedTikz.some((b) => mIndex >= b.start && mIndex < b.end)) continue;
    blocks.push({
      start: m.index,
      end: m.index + m[0].length,
      part: { type: 'tikz', snippet: m[0], preamble, centered: false },
    });
  }

  // \immini[opt]{text}{figure} — chữ bên cạnh hình (gói ex_test của giáo viên VN)
  const imminiRe = /\\immini(L)?(?:\[([^\]]*)\])?\{/g;
  while ((m = imminiRe.exec(c)) !== null) {
    const arg1Start = m.index + m[0].length - 1; // vị trí '{' của text
    const arg1End = matchBrace(c, arg1Start);
    const text = c.slice(arg1Start + 1, arg1End);
    // bỏ khoảng trắng, tìm '{' của figure
    let p = arg1End + 1;
    while (p < c.length && /\s/.test(c[p])) p++;
    let figure = '';
    let blockEnd = arg1End;
    if (c[p] === '{') {
      const figEnd = matchBrace(c, p);
      figure = c.slice(p + 1, figEnd);
      blockEnd = figEnd;
    }
    if (insideComplex(m.index, blockEnd + 1)) continue;
    blocks.push({
      start: m.index,
      end: blockEnd + 1,
      part: { type: 'immini', text, figure, preamble, centered: false },
    });
  }

  if (blocks.length === 0) return [{ type: 'md', text: c }];

  // Sắp xếp theo vị trí, bỏ block lồng nhau
  blocks.sort((a, b) => a.start - b.start);
  const kept: typeof blocks = [];
  for (const b of blocks) {
    if (kept.length && b.start < kept[kept.length - 1].end) continue;
    kept.push(b);
  }

  // Tìm các mốc \begin{center} / \end{center}
  const centerRe = /\\begin\{center\}|\\end\{center\}/g;
  const centerMarks: { pos: number; isBegin: boolean }[] = [];
  while ((m = centerRe.exec(c)) !== null) {
    centerMarks.push({ pos: m.index, isBegin: m[0] === '\\begin{center}' });
  }
  function inCenter(pos: number): boolean {
    let depth = 0;
    for (const mark of centerMarks) {
      if (mark.pos > pos) break;
      depth += mark.isBegin ? 1 : -1;
    }
    return depth > 0;
  }

  const parts: Part[] = [];
  let cursor = 0;
  for (const b of kept) {
    const mdText = c
      .slice(cursor, b.start)
      .replace(/\\begin\{center\}|\\end\{center\}/g, '');
    if (mdText.trim()) parts.push({ type: 'md', text: mdText });
    const centered = inCenter(b.start);
    if (b.part.type === 'tikz') {
      parts.push({
        type: 'tikz',
        snippet: b.part.snippet,
        preamble: b.part.preamble,
        centered,
      });
    } else if (b.part.type === 'latex') {
      parts.push({ type: 'latex', snippet: b.part.snippet, centered });
    } else if (b.part.type === 'immini') {
      parts.push({
        type: 'immini',
        text: b.part.text,
        figure: b.part.figure,
        preamble: b.part.preamble,
        centered,
      });
    } else {
      parts.push({ type: 'md', text: b.part.text });
    }
    cursor = b.end;
  }
  const tail = c.slice(cursor).replace(/\\begin\{center\}|\\end\{center\}/g, '');
  if (tail.trim()) parts.push({ type: 'md', text: tail });
  return parts;
}

// ============ Khối TikZ: tự biên dịch → PDF cắt đúng hình ============

const tikzCache = new Map<string, string>();

function TikzBlock({ snippet, preamble, centered }: { snippet: string; preamble: string; centered: boolean }) {
  // Đính kèm các định nghĩa (\tikzset/\newcommand/\def) trước hình để biên dịch được pic/macro tuỳ chỉnh
  const full = preamble ? preamble + '\n' + snippet : snippet;
  const [url, setUrl] = useState<string | null>(() => tikzCache.get(full) || null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (url) return;
    const cached = tikzCache.get(full);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    // Không để treo vô hạn: quá 45s → báo lỗi kèm nút thử lại
    const timer = setTimeout(() => controller.abort(), 45000);
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/exams/compile-tikz', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ snippet: full }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (!cancelled) {
            setError(
              `HTTP ${res.status}: ` +
                String(err.message || err.error || 'Lỗi biên dịch').slice(-300),
            );
          }
          return;
        }
        const blob = await res.blob();
        const u = URL.createObjectURL(blob);
        tikzCache.set(full, u);
        if (!cancelled) setUrl(u);
      } catch (e: any) {
        if (!cancelled) {
          setError(
            e?.name === 'AbortError'
              ? 'Biên dịch quá 45 giây — có thể dịch vụ vẽ hình đang bận.'
              : e.message,
          );
        }
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [full, url, attempt]);

  if (error) {
    return (
      <div
        style={{
          margin: '10px 0',
          padding: 10,
          border: '1px dashed color-mix(in oklch, var(--color-danger) 50%, transparent)',
          borderRadius: 8,
          fontSize: 12.5,
          color: 'var(--color-danger)',
          background: 'color-mix(in oklch, var(--color-danger) 6%, var(--color-paper))',
        }}
      >
        <div>⚠️ Không vẽ được hình/bảng: {error}</div>
        <button
          type="button"
          className="lm-filter-btn"
          style={{ marginTop: 8, padding: '5px 12px', fontSize: 12 }}
          onClick={() => {
            setError(null);
            setAttempt((a) => a + 1);
          }}
        >
          🔄 Thử biên dịch lại
        </button>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 11 }}>Xem code TikZ</summary>
          <pre
            style={{
              fontSize: 11,
              whiteSpace: 'pre-wrap',
              fontFamily: 'var(--font-mono)',
              background: 'var(--color-paper-2)',
              padding: 10,
              borderRadius: 6,
              marginTop: 6,
            }}
          >
            {full}
          </pre>
        </details>
      </div>
    );
  }

  if (!url) {
    return (
      <div
        className="mono"
        style={{
          fontSize: 12,
          color: 'var(--color-muted)',
          padding: '14px 12px',
          border: '1px dashed var(--color-rule)',
          borderRadius: 8,
          margin: '10px 0',
          textAlign: 'center',
        }}
      >
        ⏳ Đang biên dịch hình/bảng…
      </div>
    );
  }

  return (
    <div
      style={
        centered
          ? { textAlign: 'center', margin: '10px 0' }
          : { margin: '10px 0' }
      }
    >
      <img
        src={url}
        alt="Hình TikZ"
        style={{
          maxWidth: '100%',
          height: 'auto',
          display: centered ? 'inline-block' : 'block',
          border: '1px solid var(--color-rule)',
          borderRadius: 8,
          background: '#fff',
        }}
      />
    </div>
  );
}

// ============ Khối markdown + math (dùng lại cho \immini) ============
function MarkdownPart({ text }: { text: string }) {
  const processed = preprocessMath(text);

  // 1) Môi trường LaTeX VĂN BẢN (enumerate/center/itemize/itemchoice...) → TeX Live → ảnh
  const latexBlocks: string[] = [];
  let withEnv = processed;
  const envRe = new RegExp(
    `\\\\begin\\{(${TEXT_ENVS})\\*?\\}([\\s\\S]*?)\\\\end\\{\\1\\*?\\}`,
    'g',
  );
  withEnv = withEnv.replace(envRe, (m: string, env: string, inner: string) => {
    const i = latexBlocks.length;
    // Chuẩn hoá macro VN trước khi gửi TeX Live:
    // \begin{itemch}/\begin{itemchoice} → \begin{itemize} ; \itemch → \item
    const frag = `\\begin{${env}}${inner}\\end{${env}}`
      .replace(/\\begin\{itemch(?:oice)?\}/g, '\\begin{itemize}')
      .replace(/\\end\{itemch(?:oice)?\}/g, '\\end{itemize}')
      .replace(/\\itemch(?![a-zA-Z])/g, '\\item');
    latexBlocks.push(frag);
    // Dùng đường dẫn tương đối (không phải scheme lạ) để react-markdown không lọc mất src
    return `\n\n![latex](/lm-latex/${i})\n\n`;
  });

  // 2) Công thức KaTeX KHÔNG hiểu → thay bằng ảnh biên dịch TeX Live
  const mathFallbacks: string[] = [];
  // MỘT lượt quét duy nhất (alternation): ưu tiên $$...$$ (display) rồi mới $...$ (inline).
  // Nếu tách 2 lượt như trước, lượt inline sẽ khớp "xuyên" qua ranh giới 2 khối display
  // (ăn dấu $ cuối khối trước + chữ ở giữa + dấu $ đầu khối sau) → sinh lỗi "$![math]$".
  const withFallback = withEnv.replace(
    /\$\$([\s\S]*?)\$\$|\$([^$]+)\$/g,
    (m: string, display: string | undefined, inline: string | undefined) => {
      const isDisplay = display !== undefined;
      const tex = isDisplay ? display : inline;
      if (tex === undefined) return m;
      if (katexOk(tex, isDisplay)) return m;
      const i = mathFallbacks.length;
      mathFallbacks.push(tex);
      return isDisplay ? `\n\n![math](/lm-math/${i})\n\n` : `![math](/lm-math/${i})`;
    },
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={{
        img: ({ src, alt }) => {
          const s = src || '';
          if (s.startsWith('/lm-latex/')) {
            const idx = Number(s.slice('/lm-latex/'.length));
            return latexBlocks[idx] ? (
              <LatexBlock latex={latexBlocks[idx]} />
            ) : null;
          }
          if (s.startsWith('/lm-math/')) {
            const idx = Number(s.slice('/lm-math/'.length));
            return mathFallbacks[idx] ? (
              <MathImage latex={mathFallbacks[idx]} />
            ) : null;
          }
          return (
            <img
              src={s.replace(/^https?:\/\/localhost:4000\/api\//, '/api/')}
              alt={alt || 'ảnh'}
              style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, margin: '8px 0' }}
            />
          );
        },
      }}
    >
      {withFallback}
    </ReactMarkdown>
  );
}

// ============ Khối \immini{text}{figure}: chữ bên trái + hình bên phải ============
function ImminiBlock({
  text,
  figure,
  preamble,
  centered,
}: {
  text: string;
  figure: string;
  preamble: string;
  centered: boolean;
}) {
  const fig = (figure || '').trim();
  // Gom định nghĩa (\tikzset/\newcommand/\def) NẰM TRONG HÌNH (figure) + preamble chung của nội dung
  const figPreamble = collectPreamble(fig).preamble;
  const combinedPreamble = [preamble, figPreamble].filter(Boolean).join('\n');
  const balanced = findBalancedTikz(fig);
  const tikzSnippet = balanced.length
    ? balanced[0].snippet
    : /\\begin\{tabular\}(\[[^\]]*\])?[\s\S]*?\\end\{tabular\}/.exec(fig)?.[0] ||
      /\\begin\{(?:tikz[a-zA-Z]*)\}(\[[^\]]*\])?[\s\S]*?\\end\{(?:tikz[a-zA-Z]*)\}/.exec(fig)?.[0] ||
      null;
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        margin: '10px 0',
        padding: 10,
        border: '1px dashed var(--color-rule)',
        borderRadius: 8,
        background: 'var(--color-paper-2)',
        color: 'var(--color-ink)',
        ...(centered ? { justifyContent: 'center' } : {}),
      }}
    >
      <div style={{ flex: '1 1 200px', minWidth: 150 }}>
        <MarkdownPart text={text} />
      </div>
      {tikzSnippet ? (
        <div style={{ flex: '0 1 auto' }}>
          <TikzBlock snippet={tikzSnippet} preamble={combinedPreamble} centered={false} />
        </div>
      ) : fig ? (
        <div style={{ flex: '0 1 auto', minWidth: 120 }}>
          <MarkdownPart text={fig} />
        </div>
      ) : null}
    </div>
  );
}

// Đổi mã LaTeX trích dẫn (\lq\lq ... \rq\rq) thành ngoặc kép thật → không bao giờ lộ code ra màn hình
function fixQuoteCodes(s: string): string {
  return String(s || '')
    .replace(/\\lq\\lq/g, '\u201C') // “
    .replace(/\\rq\\rq/g, '\u201D') // ”
    .replace(/\\lq/g, '\u2018') // ‘
    .replace(/\\rq/g, '\u2019'); // ’
}

// ===== Tiền xử lý khối câu hỏi soạn bằng gói ex_test =====
// Giáo viên "tự gõ đề" thường dán nguyên khối \begin{ex} ... \choice ... \loigiai{...} \end{ex}.
// - \loigiai{...} (lời giải) BỊ ẨN khỏi màn hình (chỉ dùng làm gợi ý cho AI chấm, dữ liệu gốc vẫn giữ)
// - \begin{ex} / \end{ex} được bỏ lớp bọc
// - \choice + các nhóm {...} → danh sách A. B. C. D. ; bỏ \True/\False để không lộ đáp án
function stripEnvBlock(s: string, macro: string): string {
  let out = '';
  let i = 0;
  const open = '\\' + macro;
  while (true) {
    const idx = s.indexOf(open, i);
    if (idx === -1) {
      out += s.slice(i);
      break;
    }
    // Không cắt nhầm \loigiaikhac... (phải là ranh giới từ)
    const after = s[idx + open.length] || '';
    if (/[a-zA-Z]/.test(after)) {
      out += s.slice(i, idx + open.length);
      i = idx + open.length;
      continue;
    }
    out += s.slice(i, idx);
    let p = idx + open.length;
    while (p < s.length && /\s/.test(s[p])) p++;
    if (s[p] === '[') {
      // tham số tuỳ chọn [...]
      let j = p + 1;
      while (j < s.length && s[j] !== ']') j++;
      p = j + 1;
      while (p < s.length && /\s/.test(s[p])) p++;
    }
    if (s[p] === '{') {
      const end = matchBrace(s, p);
      i = end + 1;
    } else {
      i = idx + open.length;
    }
  }
  return out;
}

function preprocessExTest(content: string): string {
  let s = String(content || '');
  // Chỉ chạy khi nội dung thật sự là "đề gõ tay" (tránh ảnh hưởng câu đã nhập từ ngân hàng)
  if (
    !/\\begin\{ex|\\(choice|loigiai|True|False|section|subsection|documentclass|usepackage)\b|\\begin\{document\}/.test(
      s,
    )
  ) {
    return s;
  }

  // 0) Dọn lệnh cấp tài liệu / trang trí thừa (giống bước làm sạch khi nhập vào ngân hàng đề)
  s = s
    .replace(/\\documentclass(\[[^\]]*\])?\{[^{}]*\}/g, '')
    .replace(/\\usepackage(\[[^\]]*\])?\{[^{}]*\}/g, '')
    .replace(/\\begin\{document\}/g, '')
    .replace(/\\end\{document\}/g, '')
    .replace(/\\(maketitle|tableofcontents|newpage|clearpage|noindent|centering|allowdisplaybreaks)\b(\[\d+\])?/g, '')
    .replace(/\\pagestyle\{[^{}]*\}/g, '')
    .replace(/\\setcounter\{[^{}]*\}\{[^{}]*\}/g, '')
    .replace(/\\thispagestyle\{[^{}]*\}/g, '')
    // lệnh khoảng cách / xuống dòng thừa
    .replace(/\\break(?![a-zA-Z])/g, ' ')
    .replace(/\\qquad(?![a-zA-Z])/g, ' ')
    .replace(/\\quad(?![a-zA-Z])/g, ' ')
    .replace(/\\newline(?![a-zA-Z])/g, ' ');

  // 0b) Tiêu đề mục → heading markdown (giữ chữ, bỏ lệnh LaTeX)
  s = s
    .replace(/\\section\*?\{([^{}]*)\}/g, '\n\n### $1\n\n')
    .replace(/\\subsection\*?\{([^{}]*)\}/g, '\n\n#### $1\n\n')
    .replace(/\\subsubsection\*?\{([^{}]*)\}/g, '\n\n##### $1\n\n');

  // 1) Bỏ lời giải khỏi phần hiển thị
  s = stripEnvBlock(s, 'loigiai');

  // 2) Bỏ lớp bọc \begin{ex}[...] ... \end{ex}; mỗi khối ex → "Bài N." cho dễ đọc
  let exNo = 0;
  s = s.replace(/\\begin\{ex\}(\[[^\]]*\])?/g, () => {
    exNo += 1;
    return `\n\n**Bài ${exNo}.** `;
  });
  s = s.replace(/\\end\{ex\}/g, '');
  // "**Bài N.**" đứng cùng dòng với nội dung cho gọn
  s = s.replace(/\*\*Bài (\d+)\.\*\*[ \t]*\n+/g, '**Bài $1.** ');

  // 3) \choice + các nhóm {...} → danh sách lựa chọn
  const LETTERS = 'ABCDEFGH';
  let out = '';
  let i = 0;
  while (true) {
    const idx = s.indexOf('\\choice', i);
    if (idx === -1) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, idx);
    let p = idx + '\\choice'.length;
    const opts: string[] = [];
    for (let guard = 0; guard < 12; guard++) {
      while (p < s.length && /\s/.test(s[p])) p++;
      if (s[p] !== '{') break;
      const end = matchBrace(s, p);
      const raw = s.slice(p + 1, end);
      // bỏ dấu đáp án đúng/sai, giữ nội dung
      opts.push(
        raw
          .replace(/\\True(?![a-zA-Z])/g, '')
          .replace(/\\False(?![a-zA-Z])/g, '')
          .trim(),
      );
      p = end + 1;
    }
    if (opts.length) {
      out +=
        '\n\n' +
        opts
          .map((o, k) => `**${LETTERS[k] || k + 1}.** ${o}`)
          .join('\n\n') +
        '\n\n';
    }
    i = p;
  }
  s = out;

  // 4) Còn sót \True/\False → bỏ; \dapso{...} → in đậm "Đáp số"
  s = s
    .replace(/\\True(?![a-zA-Z])/g, '')
    .replace(/\\False(?![a-zA-Z])/g, '');
  s = replaceMacroBlocks(s, 'dapso', (inner) => `\n\n**Đáp số:** ${inner}\n\n`);
  return s;
}

// Hiển thị nội dung LaTeX: markdown + công thức toán (KaTeX) + hình/bảng (PNG) + \immini + ảnh upload
// Bọc memo: nội dung là string, không đổi thì không parse/render lại (tối ưu P1)
function LatexRenderer({ content }: { content: string }) {
  const parts = splitParts(stripLatexComments(fixQuoteCodes(preprocessExTest(content))));

  return (
    <div
      style={{
        lineHeight: 1.7,
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        minWidth: 0,
        // Đảm bảo chữ luôn có màu đọc được, không bị nhạt theo màu cha
        color: 'var(--color-ink)',
      }}
    >
      {parts.map((part, i) => {
        if (part.type === 'tikz') {
          return (
            <TikzBlock
              key={i}
              snippet={part.snippet}
              preamble={part.preamble}
              centered={part.centered}
            />
          );
        }
        if (part.type === 'latex') {
          return (
            <div key={i} style={{ textAlign: part.centered ? 'center' : 'left' }}>
              <LatexBlock latex={part.snippet} />
            </div>
          );
        }
        if (part.type === 'immini') {
          return (
            <ImminiBlock
              key={i}
              text={part.text}
              figure={part.figure}
              preamble={part.preamble}
              centered={part.centered}
            />
          );
        }
        return <MarkdownPart key={i} text={part.text} />;
      })}
    </div>
  );
}

// memo: chỉ render lại khi `content` đổi (so sánh chuỗi) — tránh parse lại toàn bộ LaTeX
// mỗi khi component cha re-render (gõ phím, mở modal, đổi filter…)
export default memo(LatexRenderer);
