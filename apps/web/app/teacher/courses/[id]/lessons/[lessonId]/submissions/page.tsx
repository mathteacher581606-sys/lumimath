'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Trang cũ "bài nộp theo bài giảng" gọi API không tồn tại. Bài tập của bài giảng nay là bài giao
// trong hệ thống Bài tập → mở thẳng bài giảng đó (có danh sách bài tập + nút Chấm bài).
export default function LessonSubmissionsRedirect() {
  const params = useParams();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/teacher/courses/${params.id}?lesson=${params.lessonId}`);
  }, [params, router]);
  return <div className="page-container cl-muted">Đang mở bài giảng…</div>;
}
