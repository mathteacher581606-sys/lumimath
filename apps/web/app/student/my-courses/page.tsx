'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import BackButton from '@/components/BackButton';
import { SkeletonCards } from '@/components/Skeleton';

const COVER_GRADIENTS = [
  'linear-gradient(135deg, #7b1113 0%, #be123c 60%, #e11d48 100%)',
  'linear-gradient(135deg, #1e3a8a 0%, #3730a3 60%, #6d28d9 100%)',
  'linear-gradient(135deg, #065f46 0%, #0d9488 60%, #14b8a6 100%)',
  'linear-gradient(135deg, #92400e 0%, #d97706 60%, #f59e0b 100%)',
  'linear-gradient(135deg, #0c4a6e 0%, #0284c7 60%, #38bdf8 100%)',
];
const COVER_ICONS = ['📐', '📊', '📈', '🎯', '🧮'];

// Trang riêng: KHÓA HỌC CỦA TÔI (tách khỏi tab Trang chủ để menu điều hướng rõ ràng hơn)
export default function MyCoursesPage() {
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiFetch('/courses/my');
        if (alive) setEnrollments(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Không tải được danh sách khóa học');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <BackButton />
        <h1 className="page-title" style={{ margin: 0 }}>Khóa học của tôi</h1>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ fontSize: 17, margin: 0 }}>
          Đã đăng ký{' '}
          {!loading && !error ? (
            <span style={{ color: 'var(--color-muted)', fontWeight: 500, fontSize: 14 }}>
              ({enrollments.length})
            </span>
          ) : null}
        </h2>
        <Link
          href="/student/courses"
          className="btn"
          style={{ width: 'auto', padding: '9px 16px', textDecoration: 'none' }}
        >
          Khám phá thêm
        </Link>
      </div>

      {loading ? (
        <SkeletonCards count={6} height={168} />
      ) : error ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--color-danger)' }}>
          ❌ {error}
        </div>
      ) : enrollments.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--color-muted)' }}>
          <p style={{ fontSize: 16, marginBottom: 12 }}>Bạn chưa đăng ký khóa học nào</p>
          <Link
            href="/student/courses"
            className="btn"
            style={{ width: 'auto', display: 'inline-block', textDecoration: 'none' }}
          >
            Khám phá khóa học ngay
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {enrollments.map((en, i) => (
            <Link
              key={en.id}
              href={`/student/courses/${en.course.id}`}
              className="card course-card"
              style={{ textDecoration: 'none', color: 'inherit', display: 'block', padding: 0, overflow: 'hidden', borderRadius: 14 }}
            >
              <div
                className="course-cover"
                style={{
                  background: en.course.coverUrl
                    ? '#000'
                    : COVER_GRADIENTS[i % COVER_GRADIENTS.length],
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '26px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 96,
                }}
              >
                {en.course.coverUrl && (
                  <>
                    <img
                      src={en.course.coverUrl}
                      alt={en.course.title}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent 60%)' }} />
                  </>
                )}
                <span style={{ fontSize: 30, position: 'relative', zIndex: 2 }}>
                  {en.course.coverUrl ? '' : COVER_ICONS[i % COVER_ICONS.length]}
                </span>
                <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, color: '#fff', opacity: 0.9 }}>
                    {en.course.subject || 'Toán'}
                    {en.course.grade ? ` · Lớp ${en.course.grade}` : ' · THPT'}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.25 }}>
                    {en.course.title}
                  </span>
                </div>
              </div>
              <div style={{ padding: 14 }}>
                <p style={{ color: 'var(--color-muted)', fontSize: 13, marginBottom: 8 }}>
                  {en.course.teacher?.fullName || 'Giáo viên'}
                </p>
                <div className="mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {en.course._count?.lessons ?? 0} bài giảng
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
