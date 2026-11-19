# Feature Specification: Polish màn hình · Harden · Hiệu năng (P1)

**Feature Branch**: `008-ui-p1-polish`

**Created**: 2026-11-11

**Status**: Implemented

**Input**: User description: "tiếp tục P1 — polish từng màn hình, harden dữ liệu xấu, tối ưu hiệu năng"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nội dung LaTeX không render lại vô ích (Priority: P1)

Giáo viên gõ trong ô soạn đề hoặc mở/đóng modal: các khối công thức đã hiển thị **không** bị
parse lại từ đầu mỗi lần có thay đổi khác.

**Why this priority**: `LatexRenderer` parse markdown + KaTeX + tách tikz mỗi lần render; trong
trang soạn đề có hàng chục khối, gõ 1 ký tự làm toàn bộ parse lại → giật, tốn CPU.

**Independent Test**: Mở trang soạn đề có ≥ 10 câu, gõ vào ô tìm kiếm → gõ mượt, không khựng.

**Acceptance Scenarios**:

1. **Given** trang có nhiều khối LaTeX, **When** state khác thay đổi (filter, modal, toast),
   **Then** các khối có `content` không đổi **không** render lại.
2. **Given** `content` thay đổi, **When** render, **Then** khối đó vẫn cập nhật đúng.

---

### User Story 2 - Đồng hồ thi báo động đúng lúc (Priority: P1)

Học sinh đang làm bài thấy đồng hồ **chuyển màu** khi còn dưới 5 phút (hổ phách) và dưới 1 phút
(đỏ) + dòng nhắc, chữ số không nhảy.

**Why this priority**: Là thông tin sống còn khi thi; trước đây chỉ đổi đỏ khi còn < 60 giây.

**Independent Test**: Cho `timeLeft = 200` → đồng hồ màu hổ phách + "Còn dưới 5 phút".

**Acceptance Scenarios**:

1. **Given** còn 4 phút, **When** hiển thị, **Then** đồng hồ màu hổ phách + nhãn "Còn dưới 5 phút".
2. **Given** còn 30 giây, **When** hiển thị, **Then** đồng hồ màu đỏ + nhãn "Sắp hết giờ!".
3. **Given** đồng hồ chạy, **When** đổi giây, **Then** bề rộng khối số không đổi.

---

### User Story 3 - Dữ liệu xấu không làm vỡ giao diện (Priority: P2)
Tên học sinh rất dài, tên lớp lạ, danh sách rỗng, điểm 10 cạnh điểm 8 — bố cục vẫn thẳng hàng,
không tràn, không đè.

**Why this priority**: Dữ liệu thật của trường có nhiều tên dài; vỡ layout làm mất tin cậy.

**Independent Test**: Đổi tên HS thành 40 ký tự → thẻ/bảng vẫn gọn, không đẩy nút ra ngoài.

**Acceptance Scenarios**:

1. **Given** tên dài 40 ký tự, **When** hiển thị trong thẻ/bảng, **Then** xuống dòng hoặc cắt "…",
   không tràn khỏi khung.
2. **Given** danh sách rỗng, **When** mở trang, **Then** có empty state rõ ràng (không chỉ khoảng trắng).

### User Story 4 - Chấm bài bằng bàn phím (Priority: P2)

Giáo viên chấm hàng chục bài liên tiếp: dùng `J`/`↓` và `K`/`↑` để chuyển bài, `1`–`9` nhập điểm
nhanh (`0` = 10), `Ctrl/⌘ + Enter` để lưu — không phải rời mắt khỏi bài làm để bấm chuột.

**Why this priority**: Chấm bài là tác vụ lặp; mỗi lần chuyển bài bằng chuột tốn 2–3 giây,
20 bài là gần 1 phút mỗi lớp.

**Independent Test**: Mở trang chấm bài, nhấn `J` → sang bài kế; nhấn `5` → ô điểm thành 5;
`Ctrl+Enter` → lưu và thấy toast.

**Acceptance Scenarios**:

1. **Given** đang chấm bài, **When** nhấn `J`/`↓`, **Then** mở bài nộp kế tiếp.
2. **Given** đang ở ô nhập điểm/nhận xét, **When** gõ `j` hoặc số, **Then** **không** kích hoạt
   phím tắt (chỉ gõ chữ bình thường).
3. **Given** đang chấm bài, **When** nhấn `5`, **Then** ô điểm = 5.
4. **Given** đang chấm bài, **When** nhấn `Ctrl/⌘ + Enter`, **Then** lưu điểm.
5. **Given** giáo viên mới dùng lần đầu, **When** bấm "⌨️ Phím tắt", **Then** thấy bảng gợi ý.

### User Story 5 - Áp dụng nhanh cho cả nhóm câu trong Ma trận (Priority: P2)

Giáo viên lập ma trận 12 câu trắc nghiệm cùng lớp 12, cùng mức độ: thay vì chọn 12 lần cho từng
dòng, chỉ cần chọn **một lần ở thanh tiêu đề nhóm** và áp dụng cho cả nhóm.

**Why this priority**: Mỗi đề 22 câu ⇒ 44+ lần chọn lặp; đây là thao tác mất thời gian nhất
khi soạn ma trận.

**Independent Test**: Bấm "⚡ Lớp: 12" ở nhóm Trắc nghiệm → cả 12 dòng đổi sang Lớp 12 và chủ đề
được xoá để chọn lại cho đúng lớp.

**Acceptance Scenarios**:

1. **Given** nhóm Trắc nghiệm 12 dòng chưa chọn lớp, **When** chọn "⚡ Lớp: 12", **Then** cả 12 dòng
   có Lớp 12 và chủ đề đã chọn trước đó bị xoá (tránh lệch lớp).
2. **Given** nhóm Đúng/Sai 4 dòng, **When** chọn "⚡ Mức: Mức 2", **Then** cả 4 dòng đổi mức
   và câu hỏi đã bốc **không** bị mất.
3. **Given** chọn áp dụng, **When** hoàn tất, **Then** ô chọn tự trở về "—" để dùng lại được.

### User Story 6 - Màn hình giáo viên tải nhẹ hơn (Priority: P1)

Giáo viên mở Ngân hàng đề / Soạn đề / Nhập TeX: trình soạn LaTeX (CodeMirror) **chỉ tải khi thực
sự mở khung sửa**, không nằm trong gói tải ban đầu.

**Why this priority**: đo thực tế `/teacher/bank` tải **1.347 KB JS** — gấp 3 lần trang học sinh;
CodeMirror + các gói `@codemirror/*` chiếm ~400 KB.

**Independent Test**: Mở `/teacher/bank` với DevTools Network → không thấy chunk CodeMirror;
bấm "Sửa" mở khung LaTeX → chunk mới xuất hiện, hiện skeleton trong lúc chờ.

**Acceptance Scenarios**:

1. **Given** mở Ngân hàng đề, **When** trang tải xong, **Then** tổng JS **< 1.000 KB** và không có
   chunk CodeMirror.
2. **Given** bấm mở khung soạn LaTeX, **When** chunk đang tải, **Then** hiện **skeleton** thay vì
   khung trống.
3. **Given** chunk đã tải, **When** soạn LaTeX, **Then** editor hoạt động như trước.

## Requirements *(mandatory)*
### Functional Requirements

- **FR-001**: `LatexRenderer` MUST được bọc `React.memo` để không render lại khi `content` không đổi.
- **FR-002**: Đồng hồ thi MUST có 3 mốc màu: bình thường (>5′), hổ phách (≤5′), đỏ (≤1′) kèm nhãn.
- **FR-003**: Đồng hồ thi MUST dùng `font-variant-numeric: tabular-nums`.
- **FR-004**: Mọi tên/tiêu đề dài MUST có `overflow-wrap: anywhere` hoặc `text-overflow: ellipsis`
  trong khung có `min-width: 0`.
- **FR-005**: Danh sách rỗng MUST có empty state (icon + câu giải thích + CTA nếu có).
- **FR-006**: Trang chấm bài MUST hỗ trợ phím tắt `J`/`↓`, `K`/`↑`, `1`–`9` (`0` = 10),
  `Ctrl/⌘ + Enter`, `?`; MUST bỏ qua khi con trỏ đang ở `input`/`textarea`/`select`/`contentEditable`.
- **FR-007**: Phải có bảng gợi ý phím tắt bật/tắt được trên trang chấm bài.
- **FR-008**: Trang Ma trận MUST có điều khiển **"⚡ Lớp"** và **"⚡ Mức"** ở thanh tiêu đề mỗi nhóm,
  áp dụng cho **toàn bộ** dòng của nhóm đó.
- **FR-009**: Khi áp dụng lớp cho nhóm, chủ đề đã chọn của các dòng MUST được xoá (vì chủ đề gắn
  với lớp); câu hỏi đã bốc MUST được giữ nguyên khi chỉ đổi mức độ.
- **FR-010**: Mọi trang danh sách (khóa học, bài giao, khám phá, lịch sử làm bài, bảng xếp hạng,
  ngân hàng đề) MUST dùng skeleton khi tải, không dùng chữ "Đang tải…".
- **FR-011**: Lưới thẻ nhiều cột MUST dùng `align-items: start` để các thẻ ngắn không bị kéo cao
  bằng thẻ dài nhất.
- **FR-012**: `LatexEditor` (CodeMirror) MUST được nạp lười (`next/dynamic`, `ssr: false`) ở cả 3
  trang dùng nó, kèm **skeleton** trong thời gian tải.
- **FR-013**: Trang Ngân hàng đề MUST tải ít hơn **1.000 KB** JavaScript ở lần đầu.
- **FR-014**: Bảng Ma trận (lưới cột cố định 604px) MUST cuộn ngang được trên màn ≤ 900px,
  KHÔNG được cắt mất cột (không dùng `overflow: hidden` chặn nội dung).
- **FR-015**: `PdfAnnotator` (pdf.js ≈ 1,1 MB) MUST chỉ tải khi thực sự mở bài nộp PDF —
  không nằm trong gói tải đầu của trang chấm bài.
- **FR-016**: Bảng dài (Ngân hàng đề) MUST có **header dính** khi cuộn trang.
- **FR-017**: Không được có `minWidth`/`width` cố định ≥ 380px trong JSX gây tràn ngang (đã rà: 0 chỗ).

## Success Criteria *(mandatory)*

- **SC-001**: Không còn chỗ nào render lại `LatexRenderer` khi `content` giữ nguyên (kiểm bằng
  React DevTools Profiler hoặc lý luận memo).
- **SC-002**: 3 mốc màu đồng hồ hoạt động đúng ngưỡng.
- **SC-003**: `next build` pass; deploy `web 200`.
- **SC-004**: Không tăng kích thước bundle đáng kể (< 2%).
