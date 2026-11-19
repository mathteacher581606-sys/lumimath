# Implementation Plan: Sửa lỗi ảnh bài làm học sinh bị hỏng khi tải lên

**Branch**: `010-upload-image-corruption` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

## Summary

Ảnh bài làm > 1 MB bị **nén hỏng hoàn toàn** khi tải lên: `@napi-rs/canvas` dùng thang chất lượng
**0–100**, nhưng mã cũ truyền `0.75 / 0.6 / 0.5 / 0.4` (thang 0–1 của canvas trình duyệt) → JPEG
gần như rỗng (~13 KB) ⇒ ảnh vỡ khối, mất màu, không đọc được.

Sửa: dùng thang 0–100, nâng cạnh dài lên 1600px, thêm **chốt an toàn** (bỏ kết quả < 8 KB, không
nén được vừa thì giữ ảnh gốc), và **không xoay EXIF thủ công** vì `loadImage()` đã tự áp.

## Technical Context

**Language/Version**: TypeScript 5 · NestJS 10
**Primary Dependencies**: `@napi-rs/canvas` ^1.0.9 (không thêm mới)
**Storage**: `storage/uploads` (tệp phẳng, tên UUID)
**Testing**: script Node upload ảnh thật 2,6 MB qua API + tải lại + đo bằng Pillow
**Target Platform**: VPS 2 vCPU / 2GB
**Performance Goals**: nén ảnh 2,6 MB < 1 giây (thực đo ~0,5 s)
**Constraints**: ảnh ≤ 1 MB giữ nguyên; giới hạn 15 MB; phải đọc được chữ viết tay
**Scale/Scope**: `apps/api/src/uploads/uploads.controller.ts`

## Constitution Check

| Nguyên tắc | Trạng thái | Ghi chú |
|---|---|---|
| I. Tiếng Việt | ✅ | Thông báo lỗi giữ tiếng Việt |
| II. Bản sắc thị giác | ✅ | Không đổi UI |
| III. Chuyển động | ✅ | Không liên quan |
| IV. Nội dung toán học không vỡ | ✅ | Ảnh bài làm là dữ liệu chấm bài — **ưu tiên đọc được** hơn dung lượng |
| V. VPS nhỏ | ✅ | Không thêm dependency; ảnh ~400 KB thay vì 13 KB hỏng |
| VI. Di động | ✅ | Upload từ điện thoại là luồng chính |

**Gate**: PASS.

## Project Structure

```text
apps/api/src/uploads/uploads.controller.ts   # compressImage(): thang 0–100 + chốt an toàn
specs/010-upload-image-corruption/{spec,plan,tasks}.md
```

## Research & Decisions

| Quyết định | Bằng chứng |
|---|---|
| **Nguyên nhân**: sai thang chất lượng | Thực nghiệm trên server: `q=0.75/0.6/0.5/0.4` → **cả 4 đều 13,1 KB**; `q=75/60/50/40` → **185 / 131 / 111 / 92 KB** |
| `maxDim` 1280 → **1600** | Ảnh chụp bài viết tay cần đủ nét để đọc công thức; 1600px cho ~400 KB, vẫn nhẹ |
| **Không** xoay EXIF thủ công | `loadImage()` của `@napi-rs/canvas` **đã tự áp** EXIF: ảnh 2400×3200 có EXIF=6 → trả về **3200×2400**. Xoay thêm sẽ quay 2 lần (đã mắc và sửa trong quá trình làm) |
| Giữ ảnh gốc khi không nén vừa | Thà nặng hơn là mất dữ liệu chấm bài |
| Chốt an toàn < 8 KB | Chặn tái diễn "ảnh rỗng" mà không cần đoán |
| Không sửa ảnh cũ | Dữ liệu đã mất khi nén sai — không thể phục hồi |
