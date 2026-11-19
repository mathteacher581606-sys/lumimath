'use client';

import { useRouter } from 'next/navigation';

// Nút "Trở về" dùng chung: quay lại trang trước, nếu không có lịch sử thì về fallback
export default function BackButton({
  to,
  label = 'Trở về',
}: {
  to?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-outline"
      style={{
        width: 'auto',
        padding: '6px 14px',
        fontSize: 13,
        marginBottom: 14,
        // Nền sáng + chữ đậm để nổi bật trên cả nền tối (band đỏ đô) lẫn nền sáng
        background: 'var(--color-paper)',
        color: 'var(--color-ink)',
        border: '1px solid var(--color-rule)',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
        fontWeight: 700,
      }}
      onClick={() => {
        if (to) {
          router.push(to);
        } else if (window.history.length > 1) {
          router.back();
        } else {
          router.push('/');
        }
      }}
    >
      ← {label}
    </button>
  );
}
