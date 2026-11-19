'use client';

import React, { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import {
  autocompletion,
  snippet,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete';

interface LatexEditorProps {
  value: string;
  onChange: (val: string) => void;
  height?: string;
}

// ============ GỢI Ý TỰ ĐỘNG (LaTeX + ex_test + TikZ) ============

const latexCompletions = [
  // ex_test
  {
    label: '\\begin{ex}',
    type: 'keyword',
    apply: snippet(
      '\\begin{ex}\n\t${1:Nội dung câu hỏi}\n\t\\choice\n\t{${2:Phương án A}}\n\t{\\True ${3:Phương án đúng}}\n\t{${4:Phương án C}}\n\t{${5:Phương án D}}\n\t\\loigiai{\n\t\t${6:Lời giải chi tiết}\n\t}\n\\end{ex}',
    ),
  },
  {
    label: '\\choice',
    type: 'keyword',
    apply: snippet(
      '\\choice\n{${1:Phương án A}}\n{\\True ${2:Phương án đúng}}\n{${3:Phương án C}}\n{${4:Phương án D}}',
    ),
  },
  {
    label: '\\choiceTF',
    type: 'keyword',
    apply: snippet(
      '\\choiceTF\n{\\TrueTF ${1:Mệnh đề đúng}}\n{\\FalseTF ${2:Mệnh đề sai}}\n{\\TrueTF ${3:Mệnh đề đúng}}\n{\\FalseTF ${4:Mệnh đề sai}}',
    ),
  },
  {
    label: '\\shortans',
    type: 'keyword',
    apply: snippet('\\shortans{${1:Đáp án}}'),
  },
  {
    label: '\\loigiai',
    type: 'function',
    apply: snippet('\\loigiai{\n\t${1:Lời giải chi tiết}\n}'),
  },
  // TikZ
  {
    label: '\\begin{tikzpicture}',
    type: 'keyword',
    apply: snippet(
      '\\begin{tikzpicture}[>=stealth, line join=round, line cap=round]\n\t${1:\\draw (0,0) -- (4,0);}\n\\end{tikzpicture}',
    ),
  },
  {
    label: '\\draw',
    type: 'function',
    apply: snippet('\\draw[${1:->, thick}] (${2:0,0}) -- (${3:3,0});'),
  },
  {
    label: '\\node',
    type: 'function',
    apply: snippet('\\node[${1:above}] at (${2:0,0}) {${3:A}};'),
  },
  {
    label: '\\coordinate',
    type: 'function',
    apply: snippet('\\coordinate (${1:A}) at (${2:0,0});'),
  },
  {
    label: '\\filldraw',
    type: 'function',
    apply: snippet(
      '\\filldraw[fill=${1:blue!20}, draw=${2:blue!80}] (${3:0,0}) circle (${4:2pt});',
    ),
  },
  {
    label: '\\foreach',
    type: 'keyword',
    apply: snippet(
      '\\foreach \\x in {${1:1,2,3}} {\n\t${2:\\draw (\\x,0) -- (\\x,2);}\n}',
    ),
  },
  // Toán học
  { label: '\\frac', type: 'function', apply: snippet('\\frac{${1:a}}{${2:b}}') },
  { label: '\\sqrt', type: 'function', apply: snippet('\\sqrt{${1:x}}') },
  { label: '\\lim', type: 'function', apply: snippet('\\lim_{${1:x \\to +\\infty}}') },
  {
    label: '\\int',
    type: 'function',
    apply: snippet('\\int_{${1:a}}^{${2:b}} ${3:f(x)} \\, \\mathrm{d}x'),
  },
  {
    label: '\\sum',
    type: 'function',
    apply: snippet('\\sum_{${1:i=1}}^{${2:n}}'),
  },
  { label: '\\vec', type: 'function', apply: snippet('\\vec{${1:u}}') },
  {
    label: '\\overrightarrow',
    type: 'function',
    apply: snippet('\\overrightarrow{${1:AB}}'),
  },
  { label: '\\angle', type: 'function', apply: snippet('\\angle ${1:ABC}') },
  { label: '\\parallel', type: 'constant', apply: '\\parallel ' },
  { label: '\\perp', type: 'constant', apply: '\\perp ' },
];

function latexAutocompletion(
  context: CompletionContext,
): CompletionResult | null {
  const word = context.matchBefore(/\\[a-zA-Z0-9_]*|\\begin\{[a-zA-Z0-9_]*/);
  if (!word && !context.explicit) return null;
  return {
    from: word ? word.from : context.pos,
    options: latexCompletions,
  };
}

// ============ THEME (Sáng mặc định — dễ đọc; tối khi app đang ở theme Nocturne) ============

// Màu cú pháp LaTeX cho nền SÁNG (dịu mắt, đủ tương phản)
const latexHighlightLight = HighlightStyle.define([
  { tag: tags.keyword, color: '#7c3aed', fontWeight: '600' },
  { tag: tags.string, color: '#059669' },
  { tag: tags.number, color: '#b45309' },
  { tag: tags.comment, color: '#94a3b8', fontStyle: 'italic' },
  { tag: tags.operator, color: '#2563eb' },
  { tag: tags.bracket, color: '#334155' },
  { tag: tags.atom, color: '#db2777' },
  { tag: tags.variableName, color: '#1e293b' },
  { tag: tags.typeName, color: '#0e7490' },
  { tag: tags.tagName, color: '#b45309' },
  { tag: tags.attributeName, color: '#7c3aed' },
  { tag: tags.processingInstruction, color: '#7c3aed' },
  { tag: tags.meta, color: '#64748b' },
]);

// Màu cú pháp LaTeX cho nền TỐI (dịu, không chói)
const latexHighlightDark = HighlightStyle.define([
  { tag: tags.keyword, color: '#c4b5fd', fontWeight: '600' },
  { tag: tags.string, color: '#86efac' },
  { tag: tags.number, color: '#fdba74' },
  { tag: tags.comment, color: '#7b8794', fontStyle: 'italic' },
  { tag: tags.operator, color: '#7dd3fc' },
  { tag: tags.bracket, color: '#cbd5e1' },
  { tag: tags.atom, color: '#f9a8d4' },
  { tag: tags.variableName, color: '#e2e8f0' },
  { tag: tags.typeName, color: '#67e8f9' },
  { tag: tags.tagName, color: '#fcd34d' },
  { tag: tags.attributeName, color: '#c4b5fd' },
  { tag: tags.processingInstruction, color: '#c4b5fd' },
  { tag: tags.meta, color: '#94a3b8' },
]);

const latexThemeLight = EditorView.theme(
  {
    '&': {
      fontSize: '13.5px',
      backgroundColor: '#ffffff',
      color: '#1f2937',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: '"Fira Code", Menlo, Monaco, Consolas, "Courier New", monospace',
      padding: '12px 14px',
      caretColor: '#2563eb',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#2563eb',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: '#bfdbfe',
    },
    '.cm-gutters': {
      backgroundColor: '#f3f4f6',
      color: '#6b7280',
      border: 'none',
      borderRight: '1px solid #e5e7eb',
    },
    '.cm-activeLine': {
      backgroundColor: '#eff6ff',
    },
    '.cm-tooltip-autocomplete': {
      backgroundColor: '#ffffff',
      border: '1px solid #d1d5db',
      borderRadius: '6px',
      color: '#111827',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#dbeafe',
      color: '#1d4ed8',
    },
  },
  { dark: false },
);

const latexThemeDark = EditorView.theme(
  {
    '&': {
      fontSize: '13.5px',
      backgroundColor: '#0f172a',
      color: '#e2e8f0',
      height: '100%',
    },
    '.cm-content': {
      fontFamily: '"Fira Code", Menlo, Monaco, Consolas, "Courier New", monospace',
      padding: '12px 14px',
      caretColor: '#7dd3fc',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#7dd3fc',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: '#1e3a5f',
    },
    '.cm-gutters': {
      backgroundColor: '#111c33',
      color: '#7b8794',
      border: 'none',
      borderRight: '1px solid #1e293b',
    },
    '.cm-activeLine': {
      backgroundColor: '#1e293b80',
    },
    '.cm-tooltip-autocomplete': {
      backgroundColor: '#111c33',
      border: '1px solid #334155',
      borderRadius: '6px',
      color: '#e2e8f0',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      backgroundColor: '#1e3a5f',
      color: '#ffffff',
    },
  },
  { dark: true },
);

// ============ MẪU CHÈN NHANH (toolbar) ============

const TOOLBAR_SNIPPETS: { label: string; text: string; color: string }[] = [
  {
    label: '+ Câu TN (ex)',
    color: '#059669',
    text: '\\begin{ex}\n\tCho hàm số $y = f(x)$. Mệnh đề nào sau đây đúng?\n\t\\choice\n\t{Phương án A}\n\t{\\True Phương án đúng}\n\t{Phương án C}\n\t{Phương án D}\n\t\\loigiai{\n\t\tLời giải chi tiết ở đây.\n\t}\n\\end{ex}\n',
  },
  {
    label: '+ Đúng/Sai (TF)',
    color: '#0d9488',
    text: '\\begin{ex}\n\tCho các mệnh đề sau:\n\t\\choiceTF\n\t{\\TrueTF Mệnh đề a đúng}\n\t{\\FalseTF Mệnh đề b sai}\n\t{\\TrueTF Mệnh đề c đúng}\n\t{\\FalseTF Mệnh đề d sai}\n\t\\loigiai{\n\t\tGiải thích chi tiết.\n\t}\n\\end{ex}\n',
  },
  {
    label: '+ TikZ Oxy',
    color: '#2563eb',
    text: '\\begin{tikzpicture}[>=stealth, scale=1]\n\t\\draw[->] (-1,0) -- (4,0) node[right] {$x$};\n\t\\draw[->] (0,-1) -- (0,4) node[above] {$y$};\n\t\\node[below left] at (0,0) {$O$};\n\\end{tikzpicture}\n',
  },
  {
    label: '+ Chóp tam giác',
    color: '#7c3aed',
    text: '\\begin{tikzpicture}[scale=0.8, >=stealth]\n\t\\coordinate (A) at (0,0);\n\t\\coordinate (B) at (4,-1);\n\t\\coordinate (C) at (5,1);\n\t\\coordinate (S) at (2,4);\n\t\\draw[dashed] (A) -- (C);\n\t\\draw (S) -- (A) -- (B) -- (C) -- (S) -- (B);\n\t\\node[left] at (A) {$A$};\n\t\\node[below] at (B) {$B$};\n\t\\node[right] at (C) {$C$};\n\t\\node[above] at (S) {$S$};\n\\end{tikzpicture}\n',
  },
  {
    label: '+ Đồ thị bậc 3',
    color: '#4f46e5',
    text: '\\begin{tikzpicture}[>=stealth, scale=0.7]\n\t\\draw[->] (-2.5,0) -- (2.5,0) node[right] {$x$};\n\t\\draw[->] (0,-2.5) -- (0,2.5) node[above] {$y$};\n\t\\draw[thick, blue, smooth, samples=100, domain=-1.8:1.8] plot (\\x, {(\\x)^3 - 3*(\\x)});\n\t\\node[below left] at (0,0) {$O$};\n\\end{tikzpicture}\n',
  },
  {
    label: '\\frac',
    color: '#4b5563',
    text: '\\frac{a}{b}',
  },
  {
    label: '\\sqrt',
    color: '#4b5563',
    text: '\\sqrt{x}',
  },
];

// ============ CHÈN ẢNH (Ctrl+V / kéo-thả / nút chọn file) ============

async function uploadImage(file: File): Promise<string> {
  const token = localStorage.getItem('token');
  const res = await fetch('/api/uploads/image', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'image/png',
      Authorization: `Bearer ${token}`,
    },
    body: file,
  });
  if (!res.ok) {
    const err = await res
      .json()
      .catch(() => ({ message: 'Không tải được ảnh' }));
    throw new Error(err.message || 'Không tải được ảnh');
  }
  const data = await res.json();
  return data.url;
}

function insertImageMarkdown(view: EditorView, url: string, pos?: number | null) {
  const md = `![ảnh](${url})`;
  const selection = view.state.selection.main;
  const from = pos ?? selection.from;
  const to = pos ?? selection.to;
  view.dispatch({
    changes: { from, to, insert: md },
    selection: { anchor: from + md.length },
  });
  view.focus();
}

const imageHandlers = EditorView.domEventHandlers({
  paste: (event, view) => {
    const items = event.clipboardData?.items;
    if (!items) return false;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (!file) return true;
        uploadImage(file)
          .then((url) => insertImageMarkdown(view, url))
          .catch((e) => alert(e.message));
        return true;
      }
    }
    return false;
  },
  drop: (event, view) => {
    const files = event.dataTransfer?.files;
    if (!files || !files.length) return false;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    let hasImage = false;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      hasImage = true;
      event.preventDefault();
      uploadImage(file)
        .then((url) => insertImageMarkdown(view, url, pos))
        .catch((e) => alert(e.message));
    }
    return hasImage;
  },
});

// ============ COMPONENT ============

export default function LatexEditor({
  value,
  onChange,
  height = '420px',
}: LatexEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // Theme sáng mặc định; chỉ tối khi app đang dùng theme Nocturne
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    try {
      setIsDark(
        (typeof window !== 'undefined' &&
          window.localStorage.getItem('lumimath-theme')) === 'nocturne',
      );
    } catch (e) {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value || '',
      extensions: [
        basicSetup,
        StreamLanguage.define(stex),
        autocompletion({
          override: [latexAutocompletion],
          defaultKeymap: true,
        }),
        isDark ? latexThemeDark : latexThemeLight,
        syntaxHighlighting(isDark ? latexHighlightDark : latexHighlightLight),
        EditorView.lineWrapping,
        imageHandlers,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (value !== currentDoc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value || '' },
      });
    }
  }, [value]);

  const insertSnippet = (text: string) => {
    const view = viewRef.current;
    if (!view) return;
    const selection = view.state.selection.main;
    view.dispatch({
      changes: { from: selection.from, to: selection.to, insert: text },
      selection: { anchor: selection.from + text.length },
    });
    view.focus();
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !viewRef.current) return;
    try {
      const url = await uploadImage(file);
      insertImageMarkdown(viewRef.current, url);
    } catch (err: any) {
      alert(err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Màu nền/viền theo theme sáng/tối
  const COLORS = {
    bg: isDark ? '#1e1e1e' : '#ffffff',
    toolbar: isDark ? '#252526' : '#f3f4f6',
    border: isDark ? '#374151' : '#d1d5db',
    buttonBg: isDark ? '#374151' : '#e5e7eb',
    buttonColor: isDark ? '#e5e7eb' : '#1f2937',
    buttonBorder: isDark ? '#4b5563' : '#9ca3af',
    muted: isDark ? '#9ca3af' : '#6b7280',
  };

  const wrapperStyle: React.CSSProperties = isFullscreen
    ? {
        position: 'fixed',
        inset: 16,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        overflow: 'hidden',
      };

  return (
    <div style={wrapperStyle}>
      {/* Thanh công cụ chèn nhanh */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          padding: '8px 12px',
          background: COLORS.toolbar,
          borderBottom: `1px solid ${COLORS.border}`,
          fontSize: 12,
        }}
      >
        <span style={{ color: COLORS.muted, fontWeight: 600, marginRight: 4 }}>
          Chèn nhanh:
        </span>
        {TOOLBAR_SNIPPETS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => insertSnippet(s.text)}
            style={{
              padding: '4px 10px',
              background: COLORS.buttonBg,
              color: COLORS.buttonColor,
              border: `1px solid ${COLORS.buttonBorder}`,
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
            title={s.text}
          >
            {s.label}
          </button>
        ))}
        <span
          style={{
            marginLeft: 'auto',
            color: COLORS.muted,
            fontSize: 11,
          }}
        >
          Gợi ý: Ctrl+Space gợi ý lệnh · Kéo-thả ảnh hoặc Ctrl+V để chèn ảnh
        </span>
        <button
          type="button"
          onClick={() => setIsFullscreen(!isFullscreen)}
          style={{
            padding: '4px 8px',
            background: COLORS.buttonBg,
            color: COLORS.buttonColor,
            border: `1px solid ${COLORS.buttonBorder}`,
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
          }}
          title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
        >
          {isFullscreen ? '🗕' : '⛶'}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '4px 10px',
            background: COLORS.buttonBg,
            color: COLORS.buttonColor,
            border: `1px solid ${COLORS.buttonBorder}`,
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
          }}
          title="Chèn ảnh từ máy tính (hoặc kéo-thả ảnh vào vùng soạn thảo, dán Ctrl+V)"
        >
          📷 Ảnh
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFilePick}
        />
      </div>

      {/* Vùng soạn thảo */}
      <div
        ref={containerRef}
        style={{
          height: isFullscreen ? 'calc(100vh - 130px)' : height,
          width: '100%',
          overflow: 'hidden',
        }}
      />
    </div>
  );
}
