'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getUser } from '@/lib/api';
import Logo from '@/components/Logo';

const FEATURES = [
  {
    n: '01',
    title: 'Ngân hàng đề theo chuẩn GDPT 2018',
    desc: 'Câu hỏi phân loại theo lớp, chuyên đề, độ khó — từ nhận biết đến vận dụng cao. Soạn một lần, dùng nhiều năm.',
  },
  {
    n: '02',
    title: 'Soạn đề LaTeX ngay trên web',
    desc: 'Trình soạn thảo LaTeX với tự động gợi ý. Biên dịch thử và xem bản PDF ngay trong trình duyệt — không cần cài phần mềm.',
  },
  {
    n: '03',
    title: 'Tạo đề thi theo ma trận',
    desc: 'Định nghĩa ma trận đề, hệ thống bốc câu hỏi ngẫu nhiên đúng tiêu chí và xuất ra file .tex hoặc PDF sẵn sàng in.',
  },
  {
    n: '04',
    title: 'Thi thử online, chấm điểm tự động',
    desc: 'Học sinh làm bài trực tuyến có đồng hồ đếm giờ, chống chuyển tab. Điểm số và lời giải chi tiết hiện ngay sau khi nộp.',
  },
  {
    n: '05',
    title: 'Bài tập tự luận chấm bằng AI',
    desc: 'Giáo viên giao bài, học sinh nộp, AI chấm điểm kèm nhận xét điểm mạnh — điểm yếu của từng bài làm.',
  },
  {
    n: '06',
    title: 'XP, level và bảng xếp hạng',
    desc: 'Mỗi bài thi tích lũy XP, mở khóa thành tích. Bảng xếp hạng tạo động lực luyện tập mỗi ngày.',
  },
];

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    if (u) {
      setLoggedIn(true);
      setRole(u.role);
    }
  }, []);

  const homeHref = role === 'TEACHER' ? '/teacher' : '/student';

  return (
    <div>
      {/* Thanh trên */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 40px',
          borderBottom: '1px solid var(--color-rule)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <Logo size={30} />
        </span>
        <nav style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {loggedIn ? (
            <Link href={homeHref} className="btn" style={{ width: 'auto', padding: '9px 18px' }}>
              Vào trang của tôi
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--color-ink)',
                  textUnderlineOffset: 3,
                  padding: '8px 12px',
                }}
              >
                Đăng nhập
              </Link>
              <Link href="/register" className="btn" style={{ width: 'auto', padding: '9px 18px' }}>
                Đăng ký miễn phí
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section style={{ padding: '72px 40px 56px', borderBottom: '1px solid var(--color-rule)' }}>
        <p className="mono" style={{ fontSize: 12, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 18 }}>
          Toán phổ thông · lớp 10 – 12
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(34px, 5.5vw, 58px)',
            fontWeight: 500,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            maxWidth: '15em',
          }}
        >
          Ngân hàng đề cho thầy cô.
          <br />
          Sân luyện cho học trò.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 16, maxWidth: '52ch', marginTop: 18, lineHeight: 1.65 }}>
          Soạn đề LaTeX, biên dịch trực tiếp trên web, giao bài tập tự luận cho AI chấm.
          Học sinh thi thử online, xem lời giải và tích lũy XP mỗi ngày.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
          {loggedIn ? (
            <Link href={homeHref} className="btn" style={{ width: 'auto', padding: '13px 26px', fontSize: 15 }}>
              Vào trang của tôi
            </Link>
          ) : (
            <>
              <Link href="/register" className="btn" style={{ width: 'auto', padding: '13px 26px', fontSize: 15 }}>
                Bắt đầu ngay
              </Link>
              <Link
                href="/login"
                className="btn btn-outline"
                style={{ width: 'auto', padding: '13px 26px', fontSize: 15 }}
              >
                Đăng nhập
              </Link>
            </>
          )}
        </div>
        <div className="mono" style={{ fontSize: 12, color: 'var(--color-rule)', marginTop: 40, lineHeight: 2, userSelect: 'none' }}>
          {'\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}    ∫ₐᵇ f(x)dx = F(b) − F(a)    e^{iπ} + 1 = 0'}
        </div>
      </section>

      {/* Tính năng */}
      <section style={{ padding: '64px 40px', borderBottom: '1px solid var(--color-rule)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, marginBottom: 36 }}>
          Sáu công cụ, một nền tảng
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 28,
          }}
        >
          {FEATURES.map((f) => (
            <div key={f.n}>
              <div className="mono" style={{ fontSize: 12, color: 'var(--color-accent)', marginBottom: 10 }}>
                {f.n}
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 500, marginBottom: 8 }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 14, color: 'var(--color-muted)', lineHeight: 1.65, maxWidth: '42ch' }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Cho giáo viên / học sinh */}
      <section
        style={{
          padding: '64px 40px',
          borderBottom: '1px solid var(--color-rule)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 40,
        }}
      >
        <div>
          <p className="mono" style={{ fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            Cho giáo viên
          </p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, marginBottom: 14 }}>
            Soạn đề một lần, dùng nhiều năm
          </h2>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, color: 'var(--color-muted)' }}>
            <li>— Nhập đề LaTeX hàng loạt, tự tách thành từng câu hỏi</li>
            <li>— Tạo đề theo ma trận, bốc câu ngẫu nhiên đúng độ khó</li>
            <li>— Công khai đề thi cho học sinh làm online</li>
            <li>— Giao bài tự luận, AI chấm điểm và góp ý từng bài</li>
          </ul>
        </div>
        <div>
          <p className="mono" style={{ fontSize: 12, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
            Cho học sinh
          </p>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, marginBottom: 14 }}>
            Luyện tập mỗi ngày, tiến bộ từng tuần
          </h2>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, color: 'var(--color-muted)' }}>
            <li>— Xem bài giảng video và tài liệu theo khóa học</li>
            <li>— Thi thử online, xem điểm và lời giải ngay lập tức</li>
            <li>— Nộp bài tự luận, nhận nhận xét chi tiết từ AI</li>
            <li>— Tích lũy XP, mở khóa thành tích, leo bảng xếp hạng</li>
          </ul>
        </div>
      </section>

      {/* CTA cuối */}
      <section style={{ padding: '72px 40px', textAlign: 'left' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 500, maxWidth: '18em' }}>
          Bắt đầu với một đề thi, hoặc một câu hỏi.
        </h2>
        <div style={{ marginTop: 24 }}>
          {loggedIn ? (
            <Link href={homeHref} className="btn" style={{ width: 'auto', padding: '13px 26px' }}>
              Vào trang của tôi
            </Link>
          ) : (
            <Link href="/register" className="btn" style={{ width: 'auto', padding: '13px 26px' }}>
              Đăng ký miễn phí
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          padding: '28px 40px',
          borderTop: '1px solid var(--color-rule)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <Logo size={24} />
        <span className="mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          Toán 10 · 11 · 12 — Luyện tập mỗi ngày
        </span>
      </footer>
    </div>
  );
}
