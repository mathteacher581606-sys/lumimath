'use client';

import { useEffect, useState } from 'react';

// Huy hiệu hạn nộp BTVN với đếm ngược (cập nhật mỗi phút)
export default function DeadlineBadge({ deadline }: { deadline: string }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 60000);
    return () => clearInterval(t);
  }, []);

  const d = new Date(deadline);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const overdue = diffMs < 0;
  const abs = Math.abs(diffMs);

  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);

  let text: string;
  if (days > 0) text = `${days} ngày ${hours} giờ`;
  else if (hours > 0) text = `${hours} giờ ${minutes} phút`;
  else text = `${minutes} phút`;

  return (
    <div
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        padding: '5px 10px',
        borderRadius: 6,
        marginBottom: 10,
        background: overdue
          ? 'color-mix(in oklch, var(--color-danger) 12%, var(--color-paper))'
          : 'color-mix(in oklch, var(--color-warning, #d97706) 14%, var(--color-paper))',
        color: overdue ? 'var(--color-danger)' : 'var(--color-warning, #b45309)',
        border: `1px solid ${overdue ? 'var(--color-danger)' : 'var(--color-warning, #d97706)'}`,
      }}
    >
      {overdue ? '⛔ Đã quá hạn ' : '⏰ Còn '}
      {text}
      <span style={{ opacity: 0.75, fontWeight: 400 }}>
        · hạn {d.toLocaleString('vi-VN')}
      </span>
    </div>
  );
}
