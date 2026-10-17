'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LatexEditor from '@/components/LatexEditor';
import { apiFetch } from '@/lib/api';
import { findBraceIssue } from '@/lib/texCheck';
import BackButton from '@/components/BackButton';

const INITIAL_TEX = `\\documentclass[12pt]{article}
\\usepackage{ex_test}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{tikz}
\\usetikzlibrary{arrows.meta,calc,patterns,angles,quotes,decorations.pathreplacing,intersections}
\\begin{document}
\\begin{center}{\\Large ĐỀ KIỂM TRA}\\end{center}

\\begin{ex}
Cho hàm số $y = x^2 - 2x + 3$. Tọa độ đỉnh của parabol là
\\choice
{$I(-1;2)$}
{\\True $I(1;2)$}
{$I(1;-2)$}
{$I(2;1)$}
\\loigiai{Đỉnh $I\\left(-\\frac{b}{2a};-\\frac{\\Delta}{4a}\\right)=(1;2)$.}
\\end{ex}

\\begin{ex}
Cho hàm số $y = x^3 - 3x$. Xét tính đúng sai:
\\choiceTF
{\\TrueTF Hàm số có hai điểm cực trị}
{\\FalseTF Hàm số đồng biến trên $\\mathbb{R}$}
{\\TrueTF Đồ thị nhận gốc tọa độ làm tâm đối xứng}
{\\FalseTF Hàm số có giá trị lớn nhất bằng $2$}
\\end{ex}

\\begin{ex}
Trong mặt phẳng $Oxy$, cho điểm $A(1;2)$ và $B(3;4)$:
\\begin{tikzpicture}[scale=0.7]
\\draw[->] (-1,0) -- (5,0) node[right] {$x$};
\\draw[->] (0,-1) -- (0,5) node[above] {$y$};
\\draw[help lines, gray!30] (-1,-1) grid (4,4);
\\filldraw[black] (1,2) circle (2.5pt) node[below left] {$A$};
\\filldraw[black] (3,4) circle (2.5pt) node[below left] {$B$};
\\draw[thick, blue] (1,2) -- (3,4);
\\end{tikzpicture}
\\shortans{$(2;2)$}
\\end{ex}

\\end{document}
`;

export default function ComposeExamPage() {
  const router = useRouter();
  const [tex, setTex] = useState(INITIAL_TEX);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function compile() {
    if (!tex.trim()) return;
    // Kiểm tra ngoặc trước khi biên dịch → báo đúng dòng lỗi ngay lập tức
    const braceIssue = findBraceIssue(tex);
    if (braceIssue) {
      setError(
        `⚠️ Dòng ${braceIssue.line}, cột ${braceIssue.char}: ${braceIssue.msg}.\n\nVí dụ lỗi thường gặp: thừa "}" sau công thức như $x}$, hoặc quên đóng ngoặc của \\frac{...}{...}, \\sqrt{...}...`,
      );
      return;
    }
    setCompiling(true);
    setError(null);
    setPreviewUrl(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/exams/compile-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ source: tex }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = String(err.message || err.error || 'Lỗi biên dịch');
        setError(msg.slice(-700));
        return;
      }
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCompiling(false);
    }
  }

  async function importToBank() {
    if (!tex.trim()) return;
    setImporting(true);
    try {
      const result = await apiFetch('/bank/import-tex', {
        method: 'POST',
        body: JSON.stringify({ texSource: tex }),
      });
      alert(`Đã nạp ${result.imported} câu hỏi vào ngân hàng đề!`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setImporting(false);
    }
  }

  function downloadTex() {
    const blob = new Blob([tex], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'de_thi.tex';
    a.click();
  }

  return (
    <div style={{ height: 'calc(100vh - 72px)', display: 'flex', flexDirection: 'column' }}>
      {/* Thanh công cụ */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          padding: '12px 20px',
          borderBottom: '1px solid var(--color-rule)',
          background: 'var(--color-paper-2)',
        }}
      >
        <h1 style={{ fontSize: 16, fontWeight: 600, marginRight: 'auto' }}>
          <BackButton to="/teacher/exams" label="Về Kho đề thi" />
          Soạn đề thi
        </h1>
        <button
          className="btn btn-outline"
          style={{ width: 'auto', padding: '8px 16px' }}
          onClick={downloadTex}
        >
          Tải .tex
        </button>
        <button
          className="btn btn-outline"
          style={{ width: 'auto', padding: '8px 16px' }}
          onClick={importToBank}
          disabled={importing}
        >
          {importing ? 'Đang nạp…' : 'Nạp vào ngân hàng'}
        </button>
        <button
          className="btn"
          style={{ width: 'auto', padding: '8px 20px' }}
          onClick={compile}
          disabled={compiling}
        >
          {compiling ? 'Đang biên dịch…' : 'Biên dịch & xem PDF'}
        </button>
      </div>

      {/* Split view: editor + preview */}
      <div style={{ flex: 1, display: 'flex', gap: 0, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, borderRight: '1px solid var(--color-rule)' }}>
          <LatexEditor value={tex} onChange={setTex} height="100%" />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              padding: '8px 14px',
              fontSize: 12,
              color: 'var(--color-muted)',
              borderBottom: '1px solid var(--color-rule)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            XEM TRƯỚC — PDF
          </div>
          <div style={{ flex: 1, background: 'var(--color-paper-2)', minHeight: 0 }}>
            {error ? (
              <pre
                style={{
                  padding: 16,
                  fontSize: 12,
                  color: 'var(--color-danger)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'var(--font-mono)',
                  maxHeight: '100%',
                  overflow: 'auto',
                }}
              >
                {error}
              </pre>
            ) : previewUrl ? (
              <iframe
                src={previewUrl}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="Xem trước PDF"
              />
            ) : (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-muted)',
                  fontSize: 14,
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 36, fontFamily: 'var(--font-display)' }}>TeX</span>
                <p>Nhấn "Biên dịch & xem PDF" để xem trước đề thi</p>
                <p className="mono" style={{ fontSize: 12 }}>
                  Hỗ trợ ex_test · TikZ · tiếng Việt
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
