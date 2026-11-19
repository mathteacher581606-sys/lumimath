# Báo cáo rà soát + khôi phục đề bị thay nhầm câu (spec 013)

**Ngày**: 2026-11-19 · **Phạm vi**: 27 đề tạo trong 14 ngày qua
**Kết quả**: chỉ **1 câu** bị thay nhầm — đã khôi phục đúng.

## Cách phát hiện

1. Phân loại từng câu trong đề: câu "mới tạo" (`createdAt` cách đề < 1 giờ) vs "tái sử dụng"
   (câu đã có từ trước, `createdAt` cách đề > 1 giờ).
2. Chỉ các đề **vừa có câu mới vừa có câu tái sử dụng** mới là nhập .tex có thay thế.

## Kết quả

| Nhóm đề | Số đề | Kết luận |
|---|---|---|
| "Luyện tập/Luyện nhanh" (7–10 câu) | ~18 | Ghép từ kho có chủ đích (ma trận) — **không phải lỗi** |
| "Đề ôn tập/Đề ôn thi/Bài tập" (21–25 câu) | ~9 | Nhập .tex, toàn câu mới — **không bị thay** |
| **"Ôn tập phương trình mặt phẳng - đề 3"** | 1 | câu 2 tái sử dụng → **trùng thật** (đúng) |
| **"Đề ôn tập chương OXYZ - Đề 1"** | 1 | **câu 8 tái sử dụng → bị thay nhầm** ✅ đã sửa |

## Câu bị thay nhầm (đã khôi phục)

**Đề**: "Đề ôn tập chương OXYZ - Đề 1" (tạo 14/11, 22 câu)

| | Nội dung | Mặt phẳng |
|---|---|---|
| ❌ Câu cũ (bị thay) | A439610 | `x-2y+z-5=0` |
| ✅ Câu đúng (đề gốc) | A877885 (mới tạo) | `x-2y-z+1=0` |

Đáp án đúng: **D** — `Q(2;-3;1)` không thuộc (P).

**Đã làm**: tạo câu mới `A877885` đúng nội dung + đáp án + 4 lựa chọn + lời giải, và trỏ lại
`ExamItem` câu 8 vào câu mới. Câu cũ `A439610` **giữ nguyên trong kho** (không xoá, vẫn dùng cho
đề khác nếu có).

## Phòng ngừa (đã deploy trong spec 013)

- `markDuplicates` trả thêm `exact`; chỉ **trùng chính xác** mới tự "bỏ qua/đổi".
- Câu "gần giống" (khác số) chỉ cảnh báo đỏ, **không tự thay thế**.
