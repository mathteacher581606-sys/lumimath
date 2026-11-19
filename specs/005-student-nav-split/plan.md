# Implementation Plan: Tách "Trang chủ" và "Khóa học của tôi"

**Branch**: `005-student-nav-split` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

## Summary

Tạo route riêng `/student/my-courses` cho danh sách khóa đã đăng ký; bỏ thanh 2 tab trong
`/student`; menu trái có 2 mục "Trang chủ" và "Khóa học của tôi".

## Technical Context

**Language/Version**: TypeScript 5 · React 18 · Next.js 14 (App Router)
**Primary Dependencies**: không thêm
**Storage**: N/A (đọc `GET /courses/my`)
**Testing**: build + smoke 200 + kiểm active theo URL
**Target Platform**: Web (mobile-first)
**Scale/Scope**: `apps/web/app/student/{page,layout}.tsx`, `apps/web/app/student/my-courses/page.tsx`

## Constitution Check

| Nguyên tắc | Trạng thái |
|---|---|
| I. Tiếng Việt | ✅ |
| II. Bản sắc thị giác | ✅ giữ nguyên thẻ khóa học |
| III. Chuyển động | ✅ không thêm animation vào điều hướng (dùng hàng ngày) |
| IV. Toán học | ✅ n/a |
| V. VPS nhỏ | ✅ thêm 1 route tĩnh nhỏ |
| VI. Di động | ✅ lưới `auto-fill minmax(280px,1fr)` |

**Gate**: PASS.

## Project Structure

```text
apps/web/app/student/layout.tsx            # navItems + isActive
apps/web/app/student/page.tsx              # bỏ tab, chỉ còn dashboard
apps/web/app/student/my-courses/page.tsx   # [mới] danh sách khóa
specs/005-student-nav-split/{spec,plan,tasks}.md
```

## Research & Decisions

| Quyết định | Lý do |
|---|---|
| Route riêng thay vì `?tab=courses` | URL chia sẻ được, đánh dấu active chính xác, back/forward đúng |
| `isActive('/student')` so khớp **chính xác** | Tránh mục Trang chủ sáng ở mọi trang con |
| Trang mới tự fetch `/courses/my` | Độc lập, không phụ thuộc state trang chủ |
