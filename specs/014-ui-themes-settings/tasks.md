# 014 · Tasks

## Đợt 1
- [x] `apps/web/app/globals.css` — 5 bảng màu, token mới, bỏ override `maroon`, CSS trang chủ HS + Cài đặt
- [x] `apps/web/lib/theme.ts`, `apps/web/app/layout.tsx` — danh sách theme, map id cũ, nạp font
- [x] Bỏ `data-theme="maroon"` cục bộ ở 11 trang; đổi nền `#fff`/kem cố định → token
- [x] `apps/web/app/student/page.tsx` — trang chủ mới
- [x] `apps/web/app/settings/layout.tsx` + `page.tsx` — Cài đặt 3 tab trong khung menu của đúng vai trò
- [x] `apps/api/src/auth/auth.controller.ts` — `GET/PATCH /auth/profile`
- [x] `packages/db/prisma/schema.prisma` + migration `20261119060000_user_profile_fields`
- [ ] Build web + API trên VPS, `prisma db push`, smoke test (chưa chạy: môi trường soạn code không có mạng để cài dependency)

## Đợt 2
- [x] Bảng màu lưu theo tài khoản: cột `User.theme`, `PATCH /auth/profile {theme}`, đồng bộ khi đăng nhập
- [x] `apps/api/src/announcements/*` — chỉ chủ khóa/trợ giảng quản lý; bài phải thuộc đúng khóa; bắt lỗi `notifyAll`; giới hạn độ dài; đếm bình luận đúng
- [x] `GET /teacher/grading-summary` (`grading-summary.controller.ts`) + trang chủ giáo viên có khối "N bài đang chờ chấm"
- [x] Đổi thêm ~100 mã màu cố định trong trang sang token (còn lại: bảng vẽ/chú thích ảnh cố ý dùng nền tối/trắng)
- [x] Phòng thi `student/exams/[id]/take`: đồng hồ theo giờ thật + trừ thời gian khi làm tiếp; tự nộp không mất bài tự luận;
      tự lưu cả chữ tự luận; luyện tập không bị cảnh báo chuyển tab; Đúng/Sai chấm đúng lựa chọn mới;
      cảnh báo trong trang thay `alert`; hộp xác nhận nộp bài (liệt kê câu chưa làm); bảng câu dạng cột phải / ngăn kéo trên điện thoại
- [x] `student/exams` — nội quy trước khi thi, "Làm tiếp bài dở", đếm lượt theo bài đã nộp (`listAvailableForStudent`)
- [ ] Build + smoke test trên VPS
