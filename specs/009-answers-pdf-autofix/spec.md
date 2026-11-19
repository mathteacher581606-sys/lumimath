# Feature Specification: Tải lại đáp án PDF & Tự động sửa lỗi LaTeX khi xuất PDF

**Feature Branch**: `009-answers-pdf-autofix`

**Created**: 2026-11-11

**Status**: Implemented

**Input**: User description: "học sinh khi xem lại lịch sử làm bài có thể tải lại đáp án PDF. Hơn nữa web tích hợp chế độ tự động fix lỗi latex khi xuất file PDF."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Học sinh tải lại đáp án PDF từ lịch sử làm bài (Priority: P1)

Học sinh mở **Lịch sử làm bài**, bấm "Xem chi tiết" một bài đã nộp, rồi bấm
**📄 Tải đáp án PDF** để tải về bản PDF gồm: đề, các lựa chọn, đáp án đúng, bài làm của chính em,
điểm từng câu và lời giải.

**Why this priority**: Học sinh cần bản đáp án có thể in/lưu để tự ôn; trước đây chỉ xem trên màn hình.

**Independent Test**: Mở một bài đã nộp → bấm "Tải đáp án PDF" → nhận file PDF mở được, có
tên đề, tên học sinh, điểm, từng câu kèm đáp án + lời giải.

**Acceptance Scenarios**:

1. **Given** học sinh đã nộp bài và mở chi tiết, **When** bấm "Tải đáp án PDF", **Then** tải về
   file `.pdf` hợp lệ (bắt đầu bằng `%PDF-`), nội dung tiếng Việt đúng.
2. **Given** đề có 39 câu, **When** tải, **Then** PDF có đủ các câu, mỗi câu có 4 lựa chọn và
   dòng "Đáp án", "Bài làm của bạn", "Điểm câu này", "Lời giải".
3. **Given** đề chưa cho phép xem đáp án, **When** tải, **Then** PDF **không** chứa đáp án/lời giải
   (tôn trọng cổng hiển thị đáp án của hệ thống).
4. **Given** học sinh khác cố tải đáp án của bạn mình, **When** gọi API, **Then** **403**.

---

### User Story 2 - Tự động sửa lỗi LaTeX khi xuất PDF (Priority: P1)

Khi xuất PDF, nội dung đề (soạn tay, nhập từ TeX, hoặc chứa `ex_test`/tikz) thường có lỗi nhỏ.
Hệ thống **tự chuẩn hoá và tự sửa** thay vì báo lỗi cho người dùng.

**Why this priority**: Nếu PDF lỗi, học sinh không có đáp án; giáo viên phải sửa tay từng câu.

**Independent Test**: Xuất đáp án của đề có `\immini` + `\True/\False` + `\break` → PDF vẫn ra,
header `X-Latex-Autofix-Count` > 0 và liệt kê các lỗi đã sửa.

**Acceptance Scenarios**:

1. **Given** nội dung có `\immini{text}{hình tikz lồng nhiều ngoặc}`, **When** xuất PDF,
   **Then** hình bị bỏ nhưng phần `text` **được giữ**.
2. **Given** nội dung có `\begin{ex}`, `\choice`, `\loigiai`, `\dapso`, `\True/\False`,
   **When** xuất PDF, **Then** chúng được chuyển thành dạng hiển thị được (danh sách A/B/C/D,
   "Đáp số", "Đúng"/"Sai"), không báo lỗi.
3. **Given** TeX báo "Undefined control sequence \\xyz", **When** xuất PDF, **Then** macro lạ bị
   loại bỏ và PDF vẫn ra.
4. **Given** lỗi **không sửa được**, **When** xuất PDF, **Then** hệ thống xuất bản **văn bản thuần**
   (verbatim) để người dùng vẫn có tài liệu, không trả lỗi trắng.
5. **Given** xuất thành công, **Then** response có header `X-Latex-Autofix` (danh sách lỗi đã sửa)
   và `X-Latex-Autofix-Count`.

### Edge Cases

- Ký tự hỏng (surrogate lẻ, ký tự điều khiển) → loại bỏ trước khi biên dịch (nguyên nhân lỗi
  "Invalid UTF-8 byte").
- `.tex` chứa `\end{verbatim}` → loại bỏ trước khi bọc verbatim.
- Bài nộp thuộc đề đã bị xoá → trả 404 rõ ràng.
- Xuất lâu (đề 39 câu ≈ 6 giây) → nút hiện "⏳ Đang tạo PDF…" và khoá bấm lại.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Phải có API `GET /exams/:id/attempts/:attemptId/answers-pdf` trả `application/pdf`.
- **FR-002**: API MUST cho phép chủ bài nộp; giáo viên/admin được xem; người khác **403**.
- **FR-003**: PDF MUST có: tiêu đề, tên học sinh + lớp, điểm, thời điểm nộp, từng câu hỏi,
  lựa chọn, đáp án, bài làm của học sinh, điểm câu, lời giải.
- **FR-004**: PDF MUST tôn trọng cổng hiển thị đáp án (không lộ đáp án khi bị khoá).
- **FR-005**: Hệ thống MUST chuẩn hoá LaTeX trước khi biên dịch: `\lq/\rq`, `\break/\qquad/\quad`,
  `ex_test` (`\begin{ex}`, `\loigiai`, `\choice`, `\dapso`, `\True/\False`), `\immini`.
- **FR-006**: Hệ thống MUST sửa theo log lỗi TeX: macro lạ, môi trường lạ, `&` ngoài bảng,
  ngoặc nhọn lệch, khối tikz lỗi.
- **FR-007**: Nếu vẫn lỗi, MUST xuất bản văn bản thuần (verbatim) thay vì trả lỗi.
- **FR-008**: Response MUST kèm `X-Latex-Autofix` / `X-Latex-Autofix-Count` để chẩn đoán.
- **FR-009**: Trang Lịch sử làm bài MUST có nút tải PDF, có trạng thái đang tạo và xử lý lỗi.

### Key Entities

- **ExamAttempt**: bài làm (điểm, thời điểm nộp, đáp án đã chọn).
- **Exam / ExamItem / Question**: đề và câu hỏi (nội dung, lựa chọn, đáp án, lời giải).
- **TeX AutoFix**: tập luật biến đổi chuỗi LaTeX (chuẩn hoá + sửa theo log).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Đề 39 câu → PDF **16 trang, ~294 KB**, mở được, tiếng Việt + công thức đúng.
- **SC-002**: Header `X-Latex-Autofix-Count` ≥ 1 với đề có nội dung cần sửa (thực đo: **3**).
- **SC-003**: Học sinh khác gọi API → **403**; chủ bài → **200**.
- **SC-004**: Thời gian tạo PDF ≤ 10 giây với đề 39 câu (thực đo ~6 giây).
- **SC-005**: `nest build` + `next build` pass; `web 200`.

## Assumptions

- Máy chủ có LaTeX service (TeX Live) như các tính năng xuất PDF hiện có.
- Nội dung đề có thể chứa lệnh `ex_test`/tikz; không yêu cầu giáo viên sửa tay.
- Bản PDF dùng cho ôn tập cá nhân, không phải bản phát hành chính thức.
