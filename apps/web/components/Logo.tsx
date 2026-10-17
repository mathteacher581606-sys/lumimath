'use client';

import { useId } from 'react';

// Logo LumiMath — biểu tượng học thuật (tích phân) + tia sáng (Lumi) + wordmark hai tông
export default function Logo({
  size = 34,
  wordmark = true,
  invert = false,
}: {
  size?: number;
  wordmark?: boolean;
  invert?: boolean;
}) {
  const gid = useId().replace(/:/g, '');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, lineHeight: 1 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role="img"
        aria-label="LumiMath"
        style={{ flexShrink: 0, display: 'block' }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7b1113" />
            <stop offset="0.62" stopColor="#be123c" />
            <stop offset="1" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="13" fill={`url(#${gid})`} />
        {/* Dấu tích phân ∫ (học thuật) */}
        <path
          d="M17 12.5 C 9.6 12.5, 9.6 20.5, 17 20.5 C 24.4 20.5, 24.4 28.5, 17 28.5 C 9.6 28.5, 9.6 36, 17 36"
          stroke="#ffffff"
          strokeWidth="4.6"
          fill="none"
          strokeLinecap="round"
        />
        {/* Tia sáng ✦ (Lumi = ánh sáng) */}
        <path
          d="M36 6.8 L37.75 11.25 L42.2 13 L37.75 14.75 L36 19.2 L34.25 14.75 L29.8 13 L34.25 11.25 Z"
          fill="#ffd27a"
        />
      </svg>
      {wordmark && (
        <span
          style={{
            fontFamily: 'var(--font-display), Georgia, serif',
            fontWeight: 700,
            fontSize: Math.round(size * 0.62),
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: invert ? '#fff' : '#7b1113' }}>Lumi</span>
          <span style={{ color: invert ? '#ffd27a' : '#d97706' }}>Math</span>
        </span>
      )}
    </span>
  );
}
