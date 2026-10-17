'use client';

import { useState } from 'react';
import LatexRenderer from '@/components/LatexRenderer';

interface Formula {
  name: string;
  code: string;
  example: string;
}

const CATEGORIES: { title: string; icon: string; items: Formula[] }[] = [
  {
    title: 'Phép toán cơ bản',
    icon: '➕',
    items: [
      { name: 'Cộng, trừ', code: 'a + b - c', example: '$a + b - c$' },
      { name: 'Nhân (×)', code: 'a \\times b', example: '$a \\times b$' },
      { name: 'Nhân (·)', code: 'a \\cdot b', example: '$a \\cdot b$' },
      { name: 'Chia (÷)', code: 'a \\div b', example: '$a \\div b$' },
      { name: 'Cộng trừ (±)', code: '\\pm 1', example: '$x = \\pm 1$' },
      { name: 'Phân số', code: '\\frac{a}{b+c}', example: '$\\frac{a}{b+c}$' },
      { name: 'Lũy thừa', code: 'x^2, e^{2x+1}', example: '$e^{2x+1}$' },
      { name: 'Chỉ số dưới', code: 'a_1, x_{i,j}', example: '$x_{i,j}$' },
      { name: 'Căn bậc hai', code: '\\sqrt{a+b}', example: '$\\sqrt{a+b}$' },
      { name: 'Căn bậc n', code: '\\sqrt[3]{8}', example: '$\\sqrt[3]{8} = 2$' },
      { name: 'Tổ hợp', code: '\\binom{n}{k}', example: '$\\binom{n}{k} = C_n^k$' },
      { name: 'Modulo', code: '\\pmod{3}', example: '$x \\equiv 1 \\pmod{3}$' },
    ],
  },
  {
    title: 'Quan hệ & Logic',
    icon: '🔗',
    items: [
      { name: 'Khác (≠)', code: '\\neq', example: '$a \\neq b$' },
      { name: 'Nhỏ hơn/bằng (≤)', code: '\\leq', example: '$x \\leq 5$' },
      { name: 'Lớn hơn/bằng (≥)', code: '\\geq', example: '$y \\geq 0$' },
      { name: 'Xấp xỉ (≈)', code: '\\approx', example: '$\\pi \\approx 3.14$' },
      { name: 'Suy ra (⇒)', code: '\\Rightarrow', example: '$A \\Rightarrow B$' },
      { name: 'Khi và chỉ khi (⇔)', code: '\\Leftrightarrow', example: '$A \\Leftrightarrow B$' },
      { name: 'Với mọi (∀)', code: '\\forall', example: '$\\forall x \\in \\mathbb{R}$' },
      { name: 'Tồn tại (∃)', code: '\\exists', example: '$\\exists y > 0$' },
      { name: 'Hội (∧)', code: '\\wedge', example: '$p \\wedge q$' },
      { name: 'Tuyển (∨)', code: '\\vee', example: '$p \\vee q$' },
      { name: 'Phủ định (¬)', code: '\\neg', example: '$\\neg p$' },
    ],
  },
  {
    title: 'Tập hợp',
    icon: '🔵',
    items: [
      { name: 'Thuộc (∈)', code: '\\in', example: '$x \\in A$' },
      { name: 'Không thuộc (∉)', code: '\\notin', example: '$y \\notin B$' },
      { name: 'Tập con (⊂)', code: '\\subset', example: '$A \\subset B$' },
      { name: 'Tập con (⊆)', code: '\\subseteq', example: '$C \\subseteq D$' },
      { name: 'Giao (∩)', code: '\\cap', example: '$A \\cap B$' },
      { name: 'Hợp (∪)', code: '\\cup', example: '$C \\cup D$' },
      { name: 'Tập rỗng (∅)', code: '\\emptyset', example: '$A \\cap B = \\emptyset$' },
      { name: 'Hiệu (∖)', code: '\\setminus', example: '$\\mathbb{R} \\setminus \\{0\\}$' },
      { name: 'Số tự nhiên', code: '\\mathbb{N}', example: '$\\mathbb{N}$' },
      { name: 'Số nguyên', code: '\\mathbb{Z}', example: '$\\mathbb{Z}$' },
      { name: 'Số thực', code: '\\mathbb{R}', example: '$\\mathbb{R}$' },
    ],
  },
  {
    title: 'Hình học',
    icon: '📐',
    items: [
      { name: 'Vuông góc (⊥)', code: '\\perp', example: '$AB \\perp CD$' },
      { name: 'Song song (∥)', code: '\\parallel', example: '$d_1 \\parallel d_2$' },
      { name: 'Tam giác', code: '\\triangle ABC', example: '$\\triangle ABC$' },
      { name: 'Đồng dạng (∼)', code: '\\sim', example: '$\\triangle ABC \\sim \\triangle DEF$' },
      { name: 'Độ (°)', code: '90^\\circ', example: '$90^\\circ$' },
      { name: 'Góc (∠)', code: '\\angle A', example: '$\\angle A = 60^\\circ$' },
      { name: 'Góc đo', code: '\\measuredangle', example: '$\\measuredangle ABC$' },
    ],
  },
  {
    title: 'Giải tích',
    icon: '∫',
    items: [
      { name: 'Vô cùng (∞)', code: '\\infty', example: '$x \\to +\\infty$' },
      { name: 'Giới hạn', code: '\\lim_{x \\to a}', example: '$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$' },
      { name: 'Đạo hàm riêng (∂)', code: '\\partial', example: '$\\frac{\\partial f}{\\partial x}$' },
      { name: 'Đạo hàm (′)', code: "f'(x), y''", example: "$f'(x)$" },
      { name: 'Tổng (∑)', code: '\\sum_{i=1}^{n}', example: '$\\sum_{i=1}^{n} i^2$' },
      { name: 'Tích (∏)', code: '\\prod_{i=1}^{n}', example: '$\\prod_{i=1}^{n} x_i$' },
      { name: 'Tích phân (∫)', code: '\\int_{a}^{b}', example: '$\\int_{0}^{1} x\\,dx$' },
      { name: 'Tích phân kép', code: '\\iint_D', example: '$\\iint_D f(x,y)\\,dx\\,dy$' },
      { name: 'Nabla (∇)', code: '\\nabla', example: '$\\nabla f(x,y)$' },
    ],
  },
  {
    title: 'Ký tự Hy Lạp',
    icon: '🇬🇷',
    items: [
      { name: 'Alpha / Beta', code: '\\alpha, \\beta', example: '$\\alpha + \\beta$' },
      { name: 'Gamma / Delta', code: '\\gamma, \\delta, \\Delta', example: '$\\Delta = b^2 - 4ac$' },
      { name: 'Theta / Lambda', code: '\\theta, \\lambda', example: '$\\theta, \\lambda$' },
      { name: 'Pi / Sigma', code: '\\pi, \\sigma, \\Sigma', example: '$S = \\pi r^2$' },
      { name: 'Phi / Omega', code: '\\phi, \\omega, \\Omega', example: '$\\omega, \\Omega$' },
      { name: 'Mu / Rho', code: '\\mu, \\rho', example: '$\\mu, \\rho$' },
      { name: 'Biến thể', code: '\\varepsilon, \\varphi', example: '$\\varepsilon, \\varphi$' },
    ],
  },
  {
    title: 'Vectơ & Ma trận',
    icon: '➡️',
    items: [
      { name: 'Vectơ (mũi tên)', code: '\\vec{v}', example: '$\\vec{v}$' },
      { name: 'Vectơ 2 điểm', code: '\\overrightarrow{AB}', example: '$\\overrightarrow{AB} + \\overrightarrow{BC} = \\overrightarrow{AC}$' },
      { name: 'Chuẩn (‖·‖)', code: '\\| \\vec{v} \\|', example: '$\\|\\vec{v}\\|$' },
      { name: 'Hệ / rẽ nhánh', code: '\\begin{cases}...\\end{cases}', example: '$f(x) = \\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}$' },
      { name: 'Ma trận tròn', code: '\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}', example: '$\\begin{pmatrix}a & b \\\\ c & d\\end{pmatrix}$' },
      { name: 'Ma trận vuông', code: '\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}', example: '$\\begin{bmatrix}1 & 2 \\\\ 3 & 4\\end{bmatrix}$' },
      { name: 'Định thức', code: '\\begin{vmatrix}a & b \\\\ c & d\\end{vmatrix}', example: '$\\begin{vmatrix}a & b \\\\ c & d\\end{vmatrix}$' },
    ],
  },
  {
    title: 'Mũi tên',
    icon: '🏹',
    items: [
      { name: 'Mũi tên phải', code: '\\rightarrow', example: '$A \\rightarrow B$' },
      { name: 'Mũi tên trái', code: '\\leftarrow', example: '$C \\leftarrow D$' },
      { name: 'Mũi tên dài', code: '\\longrightarrow', example: '$A \\longrightarrow B$' },
      { name: 'Ánh xạ (↦)', code: '\\mapsto', example: '$x \\mapsto x^2$' },
      { name: 'Hai chiều (↔)', code: '\\leftrightarrow', example: '$X \\leftrightarrow Y$' },
      { name: 'Lên / xuống', code: '\\uparrow, \\downarrow', example: '$A \\uparrow$' },
    ],
  },
  {
    title: 'Dấu chấm & Khoảng cách',
    icon: '⋯',
    items: [
      { name: 'Chấm lửng (thấp)', code: '\\ldots', example: '$x_1, x_2, \\ldots, x_n$' },
      { name: 'Chấm lửng (giữa)', code: '\\cdots', example: '$x_1 + x_2 + \\cdots + x_n$' },
      { name: 'Chấm dọc / chéo', code: '\\vdots, \\ddots', example: '$\\vdots \\quad \\ddots$' },
      { name: 'Khoảng cách nhỏ', code: '\\,', example: '$\\int f(x)\\,dx$' },
      { name: 'Khoảng cách lớn', code: '\\quad, \\qquad', example: '$a \\quad b \\qquad c$' },
    ],
  },
  {
    title: 'Định dạng & Dấu phụ',
    icon: '✍️',
    items: [
      { name: 'Gạch dưới', code: '\\underline{x+y}', example: '$\\underline{x+y}$' },
      { name: 'Gạch trên (đoạn)', code: '\\overline{AB}', example: '$\\overline{AB}$' },
      { name: 'Dấu mũ (^)', code: '\\hat{x}', example: '$\\hat{y}$' },
      { name: 'Dấu mũ rộng', code: '\\widehat{ABC}', example: '$\\widehat{ABC}$' },
      { name: 'Dấu ngã', code: '\\tilde{x}', example: '$\\tilde{A}$' },
      { name: 'In đậm', code: '\\mathbf{X}', example: '$\\mathbf{X}$' },
      { name: 'Chữ hoa mỹ thuật', code: '\\mathcal{A}', example: '$\\mathcal{S}$' },
      { name: 'Hàm chuẩn (đứng)', code: '\\sin, \\cos, \\tan, \\log, \\ln', example: '$\\sin^2 x + \\cos^2 x = 1$' },
    ],
  },
];

export default function LatexGuidePage() {
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const search = q.trim().toLowerCase();

  return (
    <div className="page-container" style={{ maxWidth: 1000 }}>
      <h1 className="page-title" style={{ marginBottom: 4 }}>🧮 Bảng công thức LaTeX</h1>
      <p className="page-subtitle">
        Tra cứu cú pháp để gõ đề bài · bấm vào mã để <strong>copy</strong> · công thức luôn đặt trong dấu <code>$...$</code>
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 Tìm công thức (VD: phân số, vectơ, căn, sigma...)"
        style={{ marginBottom: 16, padding: 12, fontSize: 15 }}
      />

      {CATEGORIES.map((cat) => {
        const items = search
          ? cat.items.filter(
              (it) =>
                it.name.toLowerCase().includes(search) ||
                it.code.toLowerCase().includes(search),
            )
          : cat.items;
        if (!items.length) return null;
        return (
          <div key={cat.title} className="card" style={{ marginBottom: 14, padding: 16 }}>
            <h2 style={{ fontSize: 15, marginBottom: 10 }}>
              {cat.icon} {cat.title}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((it) => (
                <div
                  key={it.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '7px 10px',
                    borderRadius: 8,
                    background: 'var(--color-paper-2)',
                  }}
                >
                  <div style={{ width: 170, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                    {it.name}
                  </div>
                  <button
                    className="mono"
                    onClick={() => copyCode(it.code)}
                    title="Bấm để copy"
                    style={{
                      flex: '0 1 300px',
                      minWidth: 200,
                      textAlign: 'left',
                      background: copied === it.code ? 'color-mix(in oklch, var(--color-success) 15%, var(--color-paper))' : 'transparent',
                      border: '1px dashed var(--color-rule)',
                      borderRadius: 6,
                      padding: '5px 8px',
                      fontSize: 12,
                      cursor: 'pointer',
                      color: 'var(--color-ink)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {copied === it.code ? '✅ Đã copy!' : it.code}
                  </button>
                  <div style={{ flex: 1, minWidth: 150, fontSize: 15, paddingLeft: 4 }}>
                    <LatexRenderer content={it.example} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
