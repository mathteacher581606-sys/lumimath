# Feature Specification: Kiểm soát nộp lại & lịch sử bài nộp

**Feature Branch**: `006-resubmit-control`

**Created**: 2026-11-10

**Status**: Implemented

**Input**: User description: "giới hạn số lần sửa (VD tối đa 3 lần), hoặc chỉ cho sửa khi giáo viên chưa chấm, hoặc lưu lịch sử các lần nộp để đối chiếu"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Giới hạn số lần sửa (Priority: P1)

Giáo viên đặt **số lần được sửa tối đa** cho từng bài giao; học sinh thấy còn bao nhiêu lượt.

**Why this priority**: Không giới hạn thì học sinh sửa liên tục, giáo viên không chốt được bài.

**Independent Test**: Đặt "Số lần được SỬA tối đa = 2" → nộp lần 1 + sửa 2 lần OK, sửa lần 3 bị chặn.

**Acceptance Scenarios**:

1. **Given** `maxResubmit = 2`, **When** học sinh nộp và sửa 2 lần, **Then** cả 3 lần đều thành công.
2. **Given** đã dùng hết 2 lượt, **When** nộp lần nữa, **Then** API trả **403** với thông báo
   "Bạn đã dùng hết 2 lượt sửa bài".
3. **Given** `maxResubmit = 0`, **When** học sinh cố sửa, **Then** bị chặn với thông báo riêng.
4. **Given** `maxResubmit` để trống, **When** học sinh sửa, **Then** không giới hạn.

---

### User Story 2 - Khoá sửa sau khi giáo viên đã chấm (Priority: P1)

Giáo viên bật/tắt "Khoá sửa sau khi đã chấm" (mặc định BẬT); bài đã chấm thì học sinh không sửa được.

**Why this priority**: Sửa sau khi chấm làm điểm đã công bố không còn đúng.

**Independent Test**: Chấm điểm một bài → học sinh mở lại: hiện dải đỏ "Giáo viên đã chấm…";
tắt khoá → sửa được.

**Acceptance Scenarios**:

1. **Given** bài đã có `gradedAt`/`status = GRADED`/`published`, **When** `lockAfterGraded = true`
   và học sinh nộp lại, **Then** **403** "Giáo viên đã chấm bài nên không thể sửa".
2. **Given** cùng trạng thái nhưng `lockAfterGraded = false`, **When** học sinh nộp lại, **Then** 201.

---

### User Story 3 - Lịch sử các lần nộp (Priority: P1)

Mỗi lần nộp/sửa được lưu thành một **phiên bản**; giáo viên xem lại để đối chiếu.

**Why this priority**: Khiếu nại điểm cần bằng chứng học sinh đã nộp gì, lúc nào.

**Independent Test**: Sửa bài 2 lần → trang chấm hiện "Lịch sử nộp bài (3)" với đủ nội dung/ảnh.

**Acceptance Scenarios**:

1. **Given** học sinh nộp 1 lần, **When** mở lịch sử, **Then** có phiên bản 1 (nộp đầu).
2. **Given** học sinh sửa 2 lần, **When** mở lịch sử, **Then** có 3 phiên bản theo thứ tự tăng dần,
   đúng nội dung/ảnh/thời điểm từng lần.
3. **Given** học sinh khác mở lịch sử, **When** gọi API, **Then** **403** (chỉ được xem của mình).

### Edge Cases

- Nộp lần đầu khi chưa có bản ghi lịch sử (dữ liệu cũ): coi như đã nộp 1 lần.
- Hai lần nộp đồng thời: bỏ qua lỗi trùng phiên bản, không chặn nộp.
- Hết hạn nộp: chặn trước cả khi xét số lượt sửa.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Bài giao MUST có `maxResubmit` (null = không giới hạn, 0 = không cho sửa, n = tối đa n lần).
- **FR-002**: Bài giao MUST có `lockAfterGraded` (mặc định `true`).
- **FR-003**: Mỗi lần nộp/sửa MUST ghi một bản ghi lịch sử (version, nội dung, ảnh, pdf, thời điểm).
- **FR-004**: `submit()` MUST kiểm tra lần lượt: hết hạn → số lượt sửa → khoá sau khi chấm.
- **FR-005**: `detail()` MUST trả `resubmit { editsUsed, maxResubmit, editsLeft, graded,
  lockedAfterGraded, pastDue, canEdit }` cho học sinh.
- **FR-006**: Phải có API `GET .../submissions/:id/history` (GV xem tất cả, HS chỉ xem của mình).
- **FR-007**: Form tạo/sửa bài giao MUST có 2 trường mới; trang học sinh MUST hiện số lượt còn lại
  hoặc lý do bị khoá.

### Key Entities

- **Assignment**: thêm `maxResubmit`, `lockAfterGraded`.
- **AssignmentSubmissionHistory**: phiên bản nộp (liên kết 1-n với AssignmentSubmission).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `maxResubmit = 2` → nộp 1 + sửa 2 thành công, lần thứ 4 trả **403**.
- **SC-002**: Đã chấm + khoá → **403**; tắt khoá → **201**.
- **SC-003**: Lịch sử trả đúng số phiên bản và đúng nội dung từng lần.
- **SC-004**: `pnpm prisma db push` + `nest build` + `next build` pass; `web 200`.

## Assumptions

- Học sinh nộp bài qua đúng một bản ghi `AssignmentSubmission` (không tạo bản mới mỗi lần sửa).
- Điểm/AI cũ bị reset khi nộp lại; giáo viên sẽ chấm lại.
- Dữ liệu lịch sử trước khi bật tính năng (nếu có) được coi là phiên bản 1.
