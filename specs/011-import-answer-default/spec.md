# Feature Specification: Sửa lỗi nhập đề — câu MCQ thiếu đáp án bị mặc định thành A

**Feature Branch**: `011-import-answer-default`

**Created**: 2026-11-18

**Status**: Implemented

**Input**: User description: "Kiểm tra hệ thống nhập đề xem có trục trặc không, ví dụ nhập đề bằng latex thì đề bị thay đổi hoặc đáp án bị thay đổi kí tự (so với đề gốc)"

## Kết quả chẩn đoán (đã làm trước khi sửa)

1. **KHÔNG có lỗi đổi ký tự**: round-trip qua `POST /bank/import-tex/preview` giữ nguyên 100%
   ký tự — dấu tiếng Việt (ẩm ớ ý ỹ đ), `\dfrac`, `\frac{1}{2}`, `% & # _ ^ ~`, `\lq\lq…\rq\rq`.
   Quét 1.515 câu trong DB: **0 ký tự hỏng** (không có U+FFFD, không mojibake).
2. **CÓ 1 bug thật**: hàm `parseExBlock` khởi tạo `let answer = 'A'` rồi chỉ ghi đè khi gặp `\True`.
   Nghĩa là **câu MCQ không có `\True` → đáp án bị gán mặc định "A"** dù đáp án đúng là khác.

**Bằng chứng** (round-trip thật): câu "Nghiệm của $x^2-1=0$" có 4 lựa chọn, đáp án đúng là D
($x=\pm1$) nhưng không có `\True` → hệ thống lưu đáp án **A** (sai).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Không gán đáp án sai khi nguồn thiếu dấu đáp án (Priority: P1)

Giáo viên nhập một khối `\begin{ex}…\choice…\end{ex}` mà quên (hoặc không có) `\True`: hệ thống
phải **báo "chưa xác định đáp án"** thay vì âm thầm gán đáp án A.

**Why this priority**: Đáp án sai làm hệ thống chấm sai toàn bộ, giáo viên không biết cho tới khi
học sinh khiếu nại điểm.

**Independent Test**: Nhập MCQ không có `\True` → kết quả preview có `answer = null` và
`answerMissing = true`.

**Acceptance Scenarios**:

1. **Given** khối `\choice` không có `\True`, **When** parse, **Then** `answer = null`,
   `answerMissing = true` (KHÔNG còn là "A").
2. **Given** khối `\choice` có `\True` ở lựa chọn B, **When** parse, **Then** `answer = "B"`,
   `answerMissing = false`.
3. **Given** kết quả preview, **When** câu có `answerMissing`, **Then** giao diện hiển thị cảnh báo
   "⚠️ Chưa xác định đáp án".
4. **Given** câu đã xác định đáp án, **When** preview, **Then** không có cảnh báo.

### Edge Cases

- `\True` nằm trong văn bản lựa chọn (không phải dấu đáp án) → vẫn tính là đáp án (giữ hành vi cũ,
  không mở rộng phạm vi).
- Câu Đúng/Sai (`\choiceTF`) không có `\TrueTF/\FalseTF` → ngoài phạm vi feature này (ghi chú riêng).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `parseExBlock` (nhánh MCQ) MUST khởi tạo `answer = null` thay vì `'A'`.
- **FR-002**: Khi phát hiện `\True` trong lựa chọn thứ i, MUST đặt `answer` = id (A/B/C/D) và
  `answerMissing = false`.
- **FR-003**: `previewImport` và `importExamPreview` MUST trả kèm `answerMissing` cho mỗi câu.
- **FR-004**: `confirmImport` / `importExamConfirm` MUST lưu `answer = null` (đã hỗ trợ) — câu
  chưa có đáp án sẽ không được chấm tự động (giáo viên chấm tay).
- **FR-005**: Giao diện preview nhập đề MUST hiển thị cảnh báo cho câu `answerMissing`.

### Key Entities

- **Question.answer**: với MCQ là chuỗi `"A"|"B"|"C"|"D"` hoặc `null` (chưa xác định).
- **parseExBlock**: hàm tách một khối `\begin{ex}…\end{ex}`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: MCQ không có `\True` → `answer = null`, `answerMissing = true`.
- **SC-002**: MCQ có `\True` ở B → `answer = "B"`.
- **SC-003**: Không đổi hành vi với `\shortans` (answer là chuỗi) và `\loigiai`.
- **SC-004**: `nest build` pass; round-trip preview vẫn giữ nguyên ký tự.

## Assumptions

- Quy ước đáp án MCQ trong `ex_test` là `\True` nằm trong lựa chọn đúng.
- Câu Đúng/Sai dùng `\TrueTF/\FalseTF` riêng, không đụng trong feature này.
