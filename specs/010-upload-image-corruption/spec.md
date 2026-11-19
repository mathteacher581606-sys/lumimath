# Feature Specification: Sửa lỗi ảnh bài làm học sinh bị hỏng khi tải lên

**Feature Branch**: `010-upload-image-corruption`

**Created**: 2026-11-13

**Status**: Implemented

**Input**: User description: "ảnh bài làm học sinh up lên sever đang hiển thị lỗi, hãy tìm nguyên nhân và fix theo quy tắc speckit"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ảnh tải lên phải giữ nguyên chất lượng đọc được (Priority: P1)

Học sinh chụp bài làm bằng điện thoại (ảnh 2–5 MB) và tải lên. Giáo viên mở trang chấm bài phải
đọc được **chữ viết tay, nét vẽ, công thức** — không bị vỡ khối, không bị đổi màu/xám, không bị xoay.

**Why this priority**: Ảnh hỏng khiến giáo viên không chấm được bài, học sinh phải nộp lại.

**Independent Test**: Tải một ảnh chụp bài > 1 MB → mở URL trả về → ảnh rõ, đúng chiều, đúng màu.

**Acceptance Scenarios**:

1. **Given** ảnh gốc 2 MB, **When** tải lên, **Then** ảnh lưu trên server **đọc được** (kích thước
   tệp hợp lý, không bị vỡ khối).
2. **Given** ảnh chụp bằng iPhone có EXIF Orientation = 6, **When** tải lên, **Then** ảnh lưu
   **đúng chiều** (không bị quay 90°).
3. **Given** ảnh gốc > 1 MB, **When** không nén được xuống dưới ngưỡng mà vẫn giữ chất lượng,
   **Then** hệ thống **giữ ảnh gốc** thay vì nén thành ảnh hỏng.
4. **Given** ảnh ≤ 1 MB, **When** tải lên, **Then** lưu nguyên bản (không nén).

---

### User Story 2 - Không tái diễn (Priority: P2)

Mọi chỗ nén ảnh phía server phải dùng đúng thang chất lượng và có kiểm tra an toàn.

**Why this priority**: Cùng một lỗi có thể lặp ở tính năng khác (avatar, ảnh ngân hàng đề…).

**Independent Test**: Rà toàn bộ mã server tìm `toBuffer('image/jpeg'` / `quality`.

**Acceptance Scenarios**:

1. **Given** mã nguồn, **When** rà `toBuffer(...jpeg...)`, **Then** mọi chỗ dùng **thang 0–100**.
2. **Given** kết quả nén, **When** nhỏ bất thường (< 8 KB), **Then** không lưu, dùng bản gốc.

### Edge Cases

- Ảnh PNG/WebP/GIF động: nếu giải mã lỗi → giữ nguyên file gốc.
- Ảnh có EXIF hỏng/không đọc được → bỏ qua bước xoay, vẫn nén bình thường.
- Ảnh rất lớn (15 MB) → giới hạn MAX_SIZE vẫn giữ nguyên.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `compressImage()` MUST gọi `canvas.toBuffer('image/jpeg', quality)` với **quality theo
  thang 0–100** (thư viện `@napi-rs/canvas` không dùng thang 0–1).
- **FR-002**: Hệ thống MUST đọc **EXIF Orientation** từ JPEG và áp dụng phép biến đổi tương ứng
  để ảnh lưu ra đúng chiều.
- **FR-003**: Hệ thống MUST kiểm tra kết quả nén; nếu **không đạt ngưỡng** ở mọi mức chất lượng
  thì **giữ ảnh gốc** (không nén thành ảnh hỏng).
- **FR-004**: Hệ thống MUST bỏ qua kết quả nén nhỏ bất thường (< 8 KB) để tránh ảnh rỗng.
- **FR-005**: Ảnh ≤ 1 MB MUST được lưu nguyên bản.
- **FR-006**: Giới hạn kích thước tải lên (15 MB) và định dạng cho phép MUST giữ nguyên.

### Key Entities

- **UploadedImage**: tệp trong `storage/uploads` + URL `/api/uploads/<uuid>.<ext>`.
- **EXIF Orientation**: thẻ 0x0112 trong APP1 của JPEG (1..8).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ảnh 1 MB (960×1280) sau nén ở quality 85 cho tệp **~185–250 KB** (trước lỗi: 13 KB).
- **SC-002**: Byte đầu ra khác nhau khi đổi quality (trước lỗi: mọi mức đều 13,1 KB).
- **SC-003**: Ảnh chụp có EXIF 6 lưu ra đúng chiều.
- **SC-004**: Ảnh hỏng cũ (đã mất dữ liệu) không thể phục hồi — ghi nhận trong báo cáo.
- **SC-005**: `nest build` pass; upload thật trả 200; mở URL ảnh thấy rõ nét.

## Assumptions

- Ảnh học sinh gửi chủ yếu là JPEG từ camera điện thoại.
- Các tệp đã hỏng trước bản sửa **không thể phục hồi** (dữ liệu đã mất khi nén sai).
- Dung lượng VPS đủ cho ảnh ~200–400 KB/trang.
