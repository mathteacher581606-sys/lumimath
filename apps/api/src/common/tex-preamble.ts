/**
 * Khung LaTeX dùng chung cho mọi lần biên dịch trên server (công thức, đoạn văn bản,
 * hình TikZ, PDF đề, PDF đáp án).
 *
 * - Bộ gói nằm trong `lumimath.sty` của container LaTeX (apps/latex-service/texmf/…/lumimath).
 * - Tài liệu dạng standalone mở đầu đúng 2 dòng
 *     \documentclass[...]{standalone}
 *     \usepackage{lumimath}
 *   → container tự dùng định dạng nạp sẵn lmfmt.fmt (nhanh hơn ~5 lần).
 * - Container cũ chưa dựng lại (chưa có lumimath.sty) → compileRaw tự thay bằng LEGACY_PACKAGES.
 *
 * File .tex cho người dùng TẢI VỀ (export.helper, docx.helper, texSource của đề) KHÔNG dùng
 * lumimath — máy của họ không có gói này.
 */

export const LUMIMATH_PKG = '\\usepackage{lumimath}';

/** Khung cũ (trước 21/11/2026) — chỉ dùng khi container LaTeX chưa có lumimath.sty */
export const LEGACY_PACKAGES: string[] = [
  '\\usepackage{ex_test}',
  '\\usepackage{amsmath}',
  '\\usepackage{amssymb}',
  '\\usepackage{amsfonts}',
  '\\usepackage{mathtools}',
  '\\usepackage{siunitx}',
  '\\usepackage{cancel}',
  '\\usepackage{empheq}',
  '\\usepackage{systeme}',
  '\\usepackage{graphicx}',
  '\\usepackage[dvipsnames,svgnames,x11names,table]{xcolor}',
  '\\usepackage{array}',
  '\\usepackage{booktabs}',
  '\\usepackage{colortbl}',
  '\\usepackage[shortlabels]{enumitem}',
  '\\usepackage{tikz}',
  '\\usepackage{pgfplots}',
  '\\pgfplotsset{compat=1.16}',
  '\\usepgfplotslibrary{fillbetween,polar,colormaps,statistics,dateplot,groupplots,units,patchplots,ternary}',
  '\\usetikzlibrary{arrows,arrows.meta,calc,patterns,patterns.meta,decorations.pathreplacing,decorations.markings,decorations.pathmorphing,decorations.shapes,decorations.text,angles,quotes,shapes,shapes.geometric,shapes.misc,shapes.symbols,shapes.arrows,shapes.multipart,positioning,fit,matrix,chains,scopes,through,backgrounds,fadings,shadows,mindmap,trees,plotmarks,intersections,3d,perspective,math,spy,automata,er,petri,lindenmayersystems,calendar,folding}',
  '\\usepackage{tkz-base}',
  '\\usepackage{tkz-tab}',
  '\\usepackage{tkz-euclide}',
  '\\usepackage{circuitikz}',
  '\\usepackage{tikz-cd}',
  '\\usepackage{tikz-3dplot}',
  '\\IfFileExists{esvect.sty}{\\usepackage[e]{esvect}}{}',
  '\\IfFileExists{yhmath.sty}{\\usepackage{yhmath}}{}',
  '\\providecommand{\\wideparen}[1]{\\overset{\\frown}{#1}}',
  '\\providecommand{\\vv}[1]{\\overrightarrow{#1}}',
  '\\makeatletter',
  '\\@ifundefined{heva}{\\newcommand{\\heva}[1]{\\ensuremath{\\left\\{\\begin{aligned}#1\\end{aligned}\\right.}}}{}',
  '\\@ifundefined{hoac}{\\newcommand{\\hoac}[1]{\\ensuremath{\\left[\\begin{aligned}#1\\end{aligned}\\right.}}}{}',
  '\\@ifundefined{itemchoice}{\\newenvironment{itemchoice}{\\begin{itemize}}{\\end{itemize}}}{}',
  '\\@ifundefined{itemch}{\\newcommand{\\itemch}{\\item}}{}',
  '\\makeatother',
];

/** Lỗi do container chưa có lumimath.sty → cần quay về khung cũ */
export function isMissingLumimath(err: string): boolean {
  return /lumimath\.sty'? not found/i.test(String(err || ''));
}

export function legacyFallback(tex: string): string {
  return String(tex).replace(LUMIMATH_PKG, LEGACY_PACKAGES.join('\n'));
}

/**
 * Lệnh giáo viên tự định nghĩa trong câu hỏi (\newcommand/\renewcommand) có thể trùng lệnh
 * lumimath đã có (\abs, \dint, \vv…) → "already defined". Xoá định nghĩa cũ trước
 * để định nghĩa của giáo viên luôn thắng; \renewcommand lệnh chưa có cũng không lỗi nữa.
 */
export function neutralizeRedefs(s: string): string {
  return String(s || '').replace(
    /\\(?:re)?newcommand(\*?)\s*(?:\{\s*(\\[A-Za-z@]+)\s*\}|(\\[A-Za-z@]+))/g,
    (_m, star, a, b) => {
      const cs = a || b;
      return `\\let${cs}\\undefined\\newcommand${star}{${cs}}`;
    },
  );
}

/** Tài liệu standalone dùng bộ gói chung (đủ điều kiện dùng định dạng nạp sẵn) */
export function standaloneDoc(classOpts: string, body: string): string {
  return [
    `\\documentclass[${classOpts}]{standalone}`,
    LUMIMATH_PKG,
    '\\begin{document}',
    neutralizeRedefs(body),
    '\\end{document}',
  ].join('\n');
}

/** Mở đầu tài liệu article (PDF đề/đáp án) dùng bộ gói chung */
export function articleHead(classOpts = '12pt'): string[] {
  return [`\\documentclass[${classOpts}]{article}`, LUMIMATH_PKG];
}
