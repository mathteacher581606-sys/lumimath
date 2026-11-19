# Feature Specification: Chọn nhiều chủ đề trong một dòng ma trận

**Feature Branch**: `004-matrix-multi-topic`

**Created**: 2026-11-09

**Status**: Implemented

**Input**: User description: "cho phép chọn nhiều chủ đề trong 1 dòng"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chọn nhiều chủ đề cho một dòng (Priority: P1)

Giáo viên lập ma trận đề: tại cột **Chủ đề** của một dòng, chọn **nhiều chủ đề** (theo cây mục lục)
để một dòng bao phủ nhiều chương/dạng mà vẫn đúng lớp.

**Why this priority**: Một dòng ma trận thường cần gom nhiều chủ đề liên quan; nếu chỉ chọn được 1,
giáo viên phải tách thành nhiều dòng giả và tự cộng điểm.

**Independent Test**: Mở Ma trận → bấm ô Chủ đề → tick 2 chủ đề → nút hiển thị "2 chủ đề";
bốc câu ra câu thuộc cả hai nhánh.

**Acceptance Scenarios**:

1. **Given** dòng ma trận chưa chọn chủ đề, **When** bấm ô Chủ đề và tick 2 mục, **Then** nút hiển thị
   "2 chủ đề" và danh sách vẫn đúng thứ tự cây, có thụt lề.
2. **Given** đã tick nhiều chủ đề, **When** bấm "Bỏ chọn", **Then** danh sách về rỗng và bốc câu
   không lọc theo chủ đề nữa.
3. **Given** đã tick nhiều chủ đề, **When** bấm bốc câu, **Then** câu lấy về nằm trong **hợp** các
   nhánh đã chọn (gồm cả Dạng con).
4. **Given** đổi Lớp của dòng, **When** chọn lại, **Then** danh sách chủ đề chỉ còn của lớp đó.

---

### User Story 2 - Giữ đúng lớp/dạng/mức khi chọn nhiều chủ đề (Priority: P1)

Việc chọn nhiều chủ đề không được phá vỡ bộ lọc lớp, dạng bài và mức độ.

**Why this priority**: Sai lớp hoặc sai dạng làm đề không dùng được.

**Independent Test**: Chọn 2 chương lớp 10 + mức "Nhận biết" → câu trả về đều lớp 10 và đúng mức.

**Acceptance Scenarios**:

1. **Given** dòng có Lớp 10 và 2 chủ đề, **When** bốc câu, **Then** không có câu lớp 11/12.
2. **Given** dòng có Mức "Vận dụng", **When** bốc câu, **Then** câu trả về đúng mức (hoặc báo thiếu).

---

### User Story 3 - Lưu và khôi phục ma trận (Priority: P2)

Ma trận lưu vào kho phải giữ danh sách chủ đề đã chọn và khôi phục đúng khi mở lại.

**Why this priority**: Mất lựa chọn khi lưu/mở lại làm giáo viên phải làm lại.

**Independent Test**: Chọn 3 chủ đề → Lưu → mở lại → vẫn đủ 3 chủ đề.

**Acceptance Scenarios**:

1. **Given** ma trận có dòng chọn 2 chủ đề, **When** bấm Lưu rồi mở lại từ kho, **Then** dòng đó
   vẫn hiển thị "2 chủ đề" và bốc câu đúng phạm vi.
2. **Given** ma trận cũ (chỉ có `topicId`), **When** mở lại, **Then** vẫn đọc được (tương thích ngược).

### Edge Cases

- Chọn chủ đề rồi đổi Lớp → danh sách chủ đề reset, không giữ chủ đề khác lớp.
- Chủ đề đã bị xoá khỏi ngân hàng → bỏ qua, không lỗi.
- Chọn chủ đề cha và con cùng lúc → hợp các nhánh, khử trùng.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `Slot` (dòng ma trận) MUST lưu được **mảng** chủ đề (`topicIds`), vẫn giữ `topicId`
  (phần tử đầu) để tương thích.
- **FR-002**: Ô chọn chủ đề MUST là **bảng checkbox** theo cây mục lục, có thụt lề và nút "Bỏ chọn".
- **FR-003**: Query bốc câu MUST gửi `topicIds` (phân cách dấu phẩy) khi chọn > 1 chủ đề.
- **FR-004**: Backend MUST mở rộng mỗi `topicId` thành **toàn bộ cây con** trước khi lọc.
- **FR-005**: Lưu/khôi phục ma trận MUST bao gồm `topicIds`.
- **FR-006**: Ô chọn chủ đề MUST tự đóng khi bấm ra ngoài.

### Key Entities

- **Slot**: một dòng ma trận (kiểu, lớp, danh sách chủ đề, mức, dạng, câu hỏi).
- **Topic**: nút cây mục lục (chương/bài/dạng) có `grade`, `parentId`, `order`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Chọn 2 chương lớp 10 (102 + 49 câu) → bốc câu trả tổng **151** câu, **0 câu** ngoài phạm vi.
- **SC-002**: Nút tóm tắt hiển thị đúng số chủ đề đã chọn.
- **SC-003**: Lưu rồi mở lại ma trận vẫn giữ đủ danh sách chủ đề.
- **SC-004**: `nest build` + `next build` pass; `web 200`.

## Assumptions

- Cây chủ đề trong ngân hàng đề đã đúng (chương → bài → dạng) và mỗi topic đều có `grade`.
- Ma trận được lưu dưới dạng JSON (`data.slots`), không cần đổi schema.
- Giáo viên hiểu "chọn nhiều chủ đề" nghĩa là hợp các nhánh, không phải giao.
