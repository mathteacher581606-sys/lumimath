'use client';

import React from 'react';

/**
 * Skeleton loading — thay cho chữ "Đang tải…".
 * Dùng shimmer 1.2s (chỉ animate transform) và tôn trọng prefers-reduced-motion
 * qua CSS toàn cục (globals.css).
 */

export function SkeletonLine({
  width = '100%',
  height = 12,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: radius, marginBottom: 8, ...style }}
      aria-hidden="true"
    />
  );
}

/** Khối chữ nhiều dòng */
export function SkeletonText({
  lines = 3,
  widths,
}: {
  lines?: number;
  widths?: (number | string)[];
}) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: 12,
            borderRadius: 6,
            marginBottom: 8,
            width: widths?.[i] ?? (i === lines - 1 ? '62%' : '100%'),
          }}
        />
      ))}
    </div>
  );
}

/** Lưới thẻ chờ (dùng cho danh sách khóa học / bài giao) */
export function SkeletonCards({ count = 6, height = 150 }: { count?: number; height?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 14,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height, borderRadius: 14 }}
        />
      ))}
    </div>
  );
}

/** Danh sách dòng chờ (bảng, danh sách bài học) */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 42, borderRadius: 10 }}
        />
      ))}
    </div>
  );
}

/** Dòng "Đang tải…" cũ nhưng có kèm skeleton nhỏ (an toàn khi cần chữ) */
export default function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ padding: '10px 0' }}>
      <span
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <SkeletonText lines={3} />
    </div>
  );
}
