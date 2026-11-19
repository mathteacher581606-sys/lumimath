# Tasks — 005-student-nav-split

**Spec**: [spec.md](./spec.md) · **Trạng thái**: ✅ Hoàn thành (2026-11-10)

## Trang mới
- [x] T001 Tạo `apps/web/app/student/my-courses/page.tsx` — danh sách khóa đã đăng ký (`GET /courses/my`),
      giữ nguyên thiết kế thẻ khóa học (bìa gradient/ảnh, môn·lớp, tên, GV, số bài), nút "Khám phá thêm",
      trạng thái loading / rỗng / lỗi.

## Trang chủ gọn lại
- [x] T010 `app/student/page.tsx`: bỏ state `tab`, bỏ thanh 2 tab trong banner.
- [x] T011 Bỏ khối JSX của tab "Khóa học của tôi" + `loadMyCourses`/`enrollments`/`loading`/`COVER_*` (không còn dùng).
- [x] T012 Giữ nguyên toàn bộ nội dung Trang chủ (XP, chuỗi học tập, nhiệm vụ, ôn tập, huy hiệu…).

## Điều hướng
- [x] T020 `app/student/layout.tsx`: thêm mục **Trang chủ** (`IconHome` → `/student`) đứng đầu.
- [x] T021 Mục **Khóa học của tôi** trỏ `/student/my-courses` (`IconBook`).
- [x] T022 `isActive`: `/student` chỉ active khi đúng trang chủ; các mục khác theo prefix.

## Kiểm thử & triển khai
- [x] T030 `next build` pass.
- [x] T031 `/student` → 200, `/student/my-courses` → 200.
- [x] T032 Route `student/my-courses` có trong `.next/server/...` và chunk client.
- [x] T033 Layout client chunk chứa `my-courses` + `Trang chủ` ✓.
- [x] T034 `public 200`.

## Acceptance
- [x] SC-1 `/student` chỉ còn dashboard, không còn thanh 2 tab ✔
- [x] SC-2 `/student/my-courses` hiển thị danh sách khóa đã đăng ký ✔
- [x] SC-3 Menu có 2 mục, sáng đúng URL ✔
- [x] SC-4 build pass + 200 ✔
