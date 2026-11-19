# Feature Specification: Tách "Trang chủ" và "Khóa học của tôi" ở menu học sinh

**Feature Branch**: `005-student-nav-split`

**Created**: 2026-11-10

**Status**: Implemented

**Input**: User description: "tách biệt tab Khóa học của tôi và tab trang chủ … tạo 1 tab Khóa học của tôi, 1 tab trang chủ ở cột điều hướng"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hai mục riêng ở cột điều hướng (Priority: P1)

Học sinh thấy menu trái có **2 mục tách biệt**: **Trang chủ** (bảng điều khiển) và
**Khóa học của tôi** (danh sách khóa đã đăng ký), bấm là tới đúng trang.

**Why this priority**: Trước đây chỉ có 1 mục "Khóa học của tôi" trỏ về `/student`, còn danh sách
khóa phải bấm tab phụ trong banner — học sinh hay bị lạc.

**Independent Test**: Đăng nhập học sinh → menu có "Trang chủ" và "Khóa học của tôi";
bấm lần lượt thấy đúng trang, mục đang mở sáng.

**Acceptance Scenarios**:

1. **Given** học sinh đang ở `/student`, **When** nhìn menu, **Then** chỉ mục **Trang chủ** sáng.
2. **Given** học sinh bấm **Khóa học của tôi**, **When** trang mở, **Then** URL là
   `/student/my-courses` và chỉ mục đó sáng.
3. **Given** học sinh ở trang con của khóa học, **When** nhìn menu, **Then** mục Khóa học của tôi sáng.
4. **Given** mở Trang chủ, **When** trang tải xong, **Then** **không còn** thanh 2 tab trong banner.

---

### User Story 2 - Danh sách khóa học giữ nguyên chất lượng (Priority: P1)

Trang "Khóa học của tôi" hiển thị đủ thông tin như cũ: bìa khóa, môn·lớp, tên, giáo viên, số bài.

**Why this priority**: Tách trang không được làm mất thông tin học sinh cần.

**Independent Test**: Học sinh có 3 khóa → thấy đủ 3 thẻ, mỗi thẻ có bìa + tên + GV + số bài.

**Acceptance Scenarios**:

1. **Given** học sinh đã đăng ký khóa, **When** mở Khóa học của tôi, **Then** thấy lưới thẻ khóa học.
2. **Given** học sinh chưa đăng ký khóa nào, **When** mở trang, **Then** thấy lời mời "Khám phá
   khóa học ngay" (empty state có CTA).
3. **Given** đang tải dữ liệu, **When** xem trang, **Then** thấy khung xương (skeleton) đúng bố cục.

### Edge Cases

- Mạng chậm: hiện skeleton, không hiện chữ "Đang tải…".
- Học sinh chưa có khóa nào → empty state, không phải trang trắng.
- API lỗi → hiện thông báo lỗi rõ ràng, không treo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Phải có route riêng `/student/my-courses` cho danh sách khóa đã đăng ký.
- **FR-002**: Menu học sinh MUST có mục **Trang chủ** (`/student`) và **Khóa học của tôi**
  (`/student/my-courses`).
- **FR-003**: Mục đang mở MUST được đánh dấu active theo URL (khớp chính xác cho `/student`).
- **FR-004**: Trang `/student` MUST bỏ thanh 2 tab nội bộ.
- **FR-005**: Trang mới MUST tự gọi `GET /courses/my`, có trạng thái loading (skeleton) / rỗng / lỗi.

### Key Entities

- **Enrollment**: liên kết học sinh ↔ khóa học (dùng để dựng danh sách khóa của tôi).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `/student` và `/student/my-courses` đều trả 200.
- **SC-002**: Menu có đúng 2 mục mới, active đúng theo URL.
- **SC-003**: Danh sách khóa hiển thị đủ trường như trước khi tách.
- **SC-004**: `next build` pass; `public 200`.

## Assumptions

- Mỗi học sinh có thể đăng ký nhiều khóa; dữ liệu lấy từ bảng `Enrollment`.
- "Khám phá" (`/student/courses`) là trang khác, giữ nguyên.
