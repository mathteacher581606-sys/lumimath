# Feature Specification: Sửa lỗi đề tự thay câu "nghi trùng" không giống nhau

**Feature Branch**: `013-duplicate-false-positive`

**Created**: 2026-11-18

**Status**: Implemented

**Input**: User description: "đề tự lấy câu hỏi nghi cùng dạng trong ngân hàng đề thay thế mặc dù chúng không giống, hoặc đề tự sửa số"

## Nguyên nhân gốc (đã chẩn đoán)

- `markDuplicates()` đối chiếu câu mới với kho; câu "gần giống" (khác vài con số) bị gán
  `duplicateOf` (Levenshtein ngưỡng 0.88).
- Frontend bước "Phân tích đề" mặc định tick **"Bỏ qua (dùng câu có sẵn)"** cho **mọi** `duplicateOf`
  → đề **tự thay câu mới bằng câu cũ** (khác số) mà giáo viên không để ý.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Chỉ tự bỏ qua khi trùng CHÍNH XÁC (Priority: P1)

Khi nhập đề, câu **khớp tuyệt đối** với kho thì mới tự bỏ qua; câu **gần giống** chỉ cảnh báo
"nghi trùng" và **được nhập bình thường**.

**Why this priority**: Thay nhầm câu làm đề sai số, sai đáp án — ảnh hưởng trực tiếp học sinh.

**Independent Test**: Nhập 2 câu (1 trùng đúng, 1 khác 1 chữ số) → câu trùng có `exact=true`
(mặc định bỏ qua), câu khác số có `exact=false` (mặc định nhập).

**Acceptance Scenarios**:

1. **Given** câu mới khớp chuẩn hoá **tuyệt đối** với câu trong kho, **When** phân tích đề,
   **Then** `duplicateOf.exact = true` và mặc định "bỏ qua".
2. **Given** câu mới chỉ **khác một con số**, **When** phân tích đề, **Then**
   `duplicateOf.exact = false` và mặc định **được nhập** (chỉ hiện cảnh báo đỏ).
3. **Given** câu không trùng gì, **When** phân tích, **Then** `duplicateOf = null`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `markDuplicates()` MUST trả thêm trường `exact` (`true` = khớp chuẩn hoá tuyệt đối,
  `false` = gần giống).
- **FR-002**: Frontend nhập đề (TeX + DOCX) MUST chỉ tự bỏ qua khi `duplicateOf.exact === true`.
- **FR-003**: Câu `exact === false` MUST vẫn hiện cảnh báo "nghi trùng" nhưng giữ nguyên trạng thái
  "được nhập".
- **FR-004**: Không đổi `normalizeQuestion` / `similar` (để không gây tác dụng phụ khác).

### Key Entities

- **Question.duplicateOf**: kết quả so trùng khi nhập — `{ code, id, content, exact } | null`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Câu `x^2 - 5x` vs kho `x^2 - 5x` → `exact = true`.
- **SC-002**: Câu `x^3 - 5x` vs kho `x^2 - 5x` → `exact = false`.
- **SC-003**: `nest build` + `next build` pass; `web 200`.

## Assumptions

- So trùng "tuyệt đối" dùng chuỗi đã qua `normalizeQuestion` (bỏ lệnh LaTeX, dấu, hoa/thường) —
  nghĩa là 2 câu chỉ khác khoảng trắng/cách viết lệnh vẫn tính là trùng (đúng mong đợi).
