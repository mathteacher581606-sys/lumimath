'use client';

import katex from 'katex';
import 'katex/dist/katex.min.css';

// Hiển thị văn bản chứa công thức toán $...$ bằng KaTeX
export default function MathText({ text }: { text: string }) {
  if (!text) return null;
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          const latex = part.slice(1, -1);
          let html = '';
          try {
            html = katex.renderToString(latex, { throwOnError: false });
          } catch {
            html = part;
          }
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
