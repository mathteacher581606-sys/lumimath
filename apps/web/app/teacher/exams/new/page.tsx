'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Tính năng "Tạo đề thi" đã GỘP vào trang Ma trận đề
export default function NewExamRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/teacher/exams/matrix');
  }, [router]);
  return (
    <div className="page-container">
      <p style={{ color: 'var(--color-muted)' }}>
        Đang chuyển sang trang Tạo đề thi (ma trận)…
      </p>
    </div>
  );
}
