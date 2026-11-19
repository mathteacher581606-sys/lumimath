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
- [ ] Trang giáo viên: thay ~400 mã màu cố định còn lại bằng token (ưu tiên matrix, grade, bank, teacher home)
- [ ] Trang chủ giáo viên theo cùng ngôn ngữ thiết kế
