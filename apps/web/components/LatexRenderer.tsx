'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

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

  // \heva{...} (hệ phương trình VN) → \begin{cases}...\end{cases} — kể cả TRONG $...$
  let out = '';
  let last = 0;
  const hevaRe = /\\heva\{/g;
  let hm: RegExpExecArray | null;
  while ((hm = hevaRe.exec(m)) !== null) {
    const end = matchBrace(m, hm.index + hm[0].length - 1);
    const inner = m.slice(hm.index + hm[0].length, end);
    out += m.slice(last, hm.index) + `\\begin{cases}${inner}\\end{cases}`;
    last = end + 1;
  }
  out += m.slice(last);
  return out;
}

// Tiền xử lý: chuyển các cú pháp LaTeX phổ biến sang markdown + math
// Chịu được công thức $...$ xuống dòng, $$...$$, \[...\], \(...\)
function preprocessMath(content: string): string {
  let c = content || '';

  // BỎ THỤT ĐẦU DÒNG (tab/khoảng trắng) — nếu không markdown hiểu nhầm
  // thành CODE BLOCK → công thức không render + tràn dòng
  c = c.replace(/^[ \t]+/gm, '');

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
      const fixed = fixRows(inner);
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
      const fixed = fixRows(inner);
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

  // 2c. \begin{itemch}/\begin{itemchoice} → danh sách (môi trường chọn mục VN)
  c = c.replace(
    /\\begin\{itemch(?:oice)?\}([\s\S]*?)\\end\{itemch(?:oice)?\}/g,
    (m: string, inner: string) => `\n\n\\begin{itemize}${inner}\\end{itemize}\n\n`,
  );

  // 3. Lệnh text ngoài math → markdown đậm/nghiêng/gạch chân + xuống dòng
  c = applyTextMacros(c);

  // 4. Khôi phục các khối math
  c = c.replace(/\u0000M(\d+)\u0000/g, (m: string, i: string) => mathTokens[Number(i)] ?? m);

  // \begin{enumerate} → danh sách đánh số
  c = c.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (m: string, inner: string) => {
    return '\n\n' + inner.replace(/\\item\s*(?:\[(.*?)\]\s*)?/g, (mm: string, p1: string) => (p1 ? `\n${p1} ` : '\n1. ')) + '\n\n';
  });
  // \begin{itemize} → danh sách chấm
  c = c.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (m: string, inner: string) => {
    return '\n\n' + inner.replace(/\\item\s*(?:\[(.*?)\]\s*)?/g, (mm: string, p1: string) => (p1 ? `\n${p1} ` : '\n- ')) + '\n\n';
  });
  return c;
}

type Part =
  | { type: 'md'; text: string }
  | { type: 'tikz'; snippet: string; centered: boolean }
  | { type: 'immini'; text: string; figure: string; centered: boolean };

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

// Tách nội dung thành các phần markdown, hình/bảng (tikz/tabular) và \immini
function splitParts(content: string): Part[] {
  const c = content || '';

  // Tập hợp mọi "khối đặc biệt" theo vị trí: tikz/tabular + \immini
  const blocks: { start: number; end: number; part: Part }[] = [];

  const tikzRe =
    /\\begin\{(?:tikz[a-zA-Z]*|tabular)\}(\[[^\]]*\])?[\s\S]*?\\end\{(?:tikz[a-zA-Z]*|tabular)\}/g;
  let m: RegExpExecArray | null;
  while ((m = tikzRe.exec(c)) !== null) {
    blocks.push({
      start: m.index,
      end: m.index + m[0].length,
      part: { type: 'tikz', snippet: m[0], centered: false },
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
    blocks.push({
      start: m.index,
      end: blockEnd + 1,
      part: { type: 'immini', text, figure, centered: false },
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
      parts.push({ type: 'tikz', snippet: b.part.snippet, centered });
    } else if (b.part.type === 'immini') {
      parts.push({
        type: 'immini',
        text: b.part.text,
        figure: b.part.figure,
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

function TikzBlock({ snippet, centered }: { snippet: string; centered: boolean }) {
  const [url, setUrl] = useState<string | null>(() => tikzCache.get(snippet) || null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (url) return;
    const cached = tikzCache.get(snippet);
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
          body: JSON.stringify({ snippet }),
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
        tikzCache.set(snippet, u);
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
  }, [snippet, url, attempt]);

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
            {snippet}
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
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm]}
      rehypePlugins={[rehypeKatex]}
      components={{
        img: ({ src, alt }) => (
          <img
            src={(src || '').replace(/^https?:\/\/localhost:4000\/api\//, '/api/')}
            alt={alt || 'ảnh'}
            style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, margin: '8px 0' }}
          />
        ),
      }}
    >
      {preprocessMath(text)}
    </ReactMarkdown>
  );
}

// ============ Khối \immini{text}{figure}: chữ bên trái + hình bên phải ============
function ImminiBlock({
  text,
  figure,
  centered,
}: {
  text: string;
  figure: string;
  centered: boolean;
}) {
  const fig = (figure || '').trim();
  const tikzMatch =
    /(\\begin\{(?:tikz[a-zA-Z]*|tabular)\}(\[[^\]]*\])?[\s\S]*?\\end\{(?:tikz[a-zA-Z]*|tabular)\})/.exec(
      fig,
    );
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
        ...(centered ? { justifyContent: 'center' } : {}),
      }}
    >
      <div style={{ flex: '1 1 200px', minWidth: 150 }}>
        <MarkdownPart text={text} />
      </div>
      {tikzMatch ? (
        <div style={{ flex: '0 1 auto' }}>
          <TikzBlock snippet={tikzMatch[1]} centered={false} />
        </div>
      ) : fig ? (
        <div style={{ flex: '0 1 auto', minWidth: 120 }}>
          <MarkdownPart text={fig} />
        </div>
      ) : null}
    </div>
  );
}

// Hiển thị nội dung LaTeX: markdown + công thức toán (KaTeX) + hình/bảng (PNG) + \immini + ảnh upload
export default function LatexRenderer({ content }: { content: string }) {
  const parts = splitParts(stripLatexComments(content));

  return (
    <div
      style={{
        lineHeight: 1.7,
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        minWidth: 0,
      }}
    >
      {parts.map((part, i) => {
        if (part.type === 'tikz') {
          return <TikzBlock key={i} snippet={part.snippet} centered={part.centered} />;
        }
        if (part.type === 'immini') {
          return (
            <ImminiBlock
              key={i}
              text={part.text}
              figure={part.figure}
              centered={part.centered}
            />
          );
        }
        return <MarkdownPart key={i} text={part.text} />;
      })}
    </div>
  );
}
