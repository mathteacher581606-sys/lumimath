import * as XLSX from 'xlsx';

// Escape ký tự đặc biệt LaTeX cho văn bản tiếng Việt
export function escapeTex(s: string): string {
  return String(s ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, (m) => '\\' + m)
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

// Tạo file Excel (.xlsx) từ mảng object
export function buildXlsx(sheetName: string, rows: Record<string, any>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// Tạo mã LaTeX cho bảng điểm (longtable: tự ngắt trang + lặp tiêu đề)
export function buildTablePdf(
  title: string,
  subtitle: string,
  headers: string[],
  rows: string[][],
): string {
  const cols = '|' + headers.map(() => 'c').join('|') + '|';
  const headerRow = headers.map((h) => `\\textbf{${escapeTex(h)}}`).join(' & ');
  const body = rows
    .map((r) => r.map((c) => escapeTex(c)).join(' & '))
    .join(' \\\\ \\hline\n');

  return [
    '\\documentclass[12pt,a4paper]{article}',
    '\\usepackage{vntex}',
    '\\usepackage{amsmath}',
    '\\usepackage{amssymb}',
    '\\usepackage{longtable}',
    '\\usepackage{geometry}',
    '\\geometry{margin=1.5cm}',
    '\\begin{document}',
    '\\begin{center}',
    `{\\Large\\bfseries ${escapeTex(title)}} \\\\[4pt]`,
    `\\textit{${escapeTex(subtitle)}}`,
    '\\end{center}',
    '\\vspace{4pt}',
    `\\begin{longtable}{${cols}}`,
    '\\hline',
    `${headerRow} \\\\ \\hline`,
    '\\endfirsthead',
    '\\hline',
    `${headerRow} \\\\ \\hline`,
    '\\endhead',
    '\\hline',
    '\\endfoot',
    body,
    '\\end{longtable}',
    '\\end{document}',
  ].join('\n');
}

// Chuẩn hóa tên file (bỏ ký tự đặc biệt)
export function safeFilename(name: string): string {
  return String(name || 'file')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}
