'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Trang cũ "Hàng chờ chấm" gọi API không tồn tại. Việc chấm bài nay nằm ở Bài tập của từng khóa;
// tổng số bài chờ chấm hiện ở trang chủ giáo viên → chuyển về đó.
export default function ReviewQueueRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/teacher');
  }, [router]);
  return <div className="page-container cl-muted">Đang chuyển tới trang chủ giáo viên…</div>;
}
