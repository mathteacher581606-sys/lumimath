# 014 · Giao diện mới: 5 bảng màu + trang chủ học sinh + Cài đặt 3 tab

**Trạng thái:** đợt 1 xong (học sinh + Cài đặt dùng chung); đợt 2: trang giáo viên.
**Duyệt bởi:** chủ dự án, 19/11/2026 (canvas "LumiMath — 3 phương án giao diện", bản "Kết hợp").

## Mục tiêu
- Người dùng tự chọn 1 trong 5 bảng màu trong **Cài đặt → Giao diện**; cả web đổi theo.
- Trang chủ học sinh theo bố cục "Vở ô li" (C) + khối nhắc bài cỡ lớn kiểu "Báo tường" (E).
- Học sinh/giáo viên **tự sửa thông tin cá nhân** và đổi mật khẩu trong Cài đặt.

## Bảng màu (`data-theme` trên `<html>`, lưu `localStorage['lumimath-theme']`)
| Chữ | id | Tên | Ghi chú |
|---|---|---|---|
| A | `paper` | Mực & Giấy | mặc định |
| B | `chalk` | Bảng đen | tối; ảnh công thức PNG được đảo màu |
| F | `garden` | Khu vườn | Lexend, bo góc lớn |
| D | `blueprint` | Bản vẽ | Inter Tight, góc vuông |
| C | `notebook` | Vở ô li | Nunito, nền kẻ ô, viền 2px |

Id cũ được map: `cobalt→blueprint`, `evergreen→garden`, `nocturne→chalk`, `maroon→paper`.
Token mới: `--color-surface`, `--color-card-border`, `--color-rule-2`, `--color-cta(-ink)`,
`--color-track`, `--color-danger-wash`, `--color-success-ink`, `--bg-grid`, `--radius-card`,
`--radius-ctrl`, `--border-w(-strong)`. Token `--lm-*` của ngân hàng đề nay suy ra từ bảng màu.

## API mới
- `GET /auth/profile` — hồ sơ đầy đủ của chính mình.
- `PATCH /auth/profile` — sửa `fullName, className, school, workplace, grade, birthDate, phone,
  parentPhone, avatarUrl`. Không sửa được email, vai trò, mã HS/GV, XP.
- Cột mới (chỉ thêm, nullable): `User.birthDate`, `User.phone`, `User.parentPhone`.
