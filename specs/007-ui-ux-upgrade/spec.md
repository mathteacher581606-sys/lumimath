# Feature Specification: Nâng cấp & Tối ưu Giao diện – Trải nghiệm (Giai đoạn 0+1+2)

**Feature Branch**: `007-ui-ux-upgrade`

**Created**: 2026-11-11

**Status**: Implemented (P0) — P1 pending

**Input**: User description: "Học các skill này (react-bits, skills-main, impeccable, taste-skill) và đề xuất phương án nâng cấp và tối ưu giao diện web và người dùng web. Làm giai đoạn 0 + 1 + 2 trước. Làm theo quy tắc spec-kit."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Phản hồi tức thì khi bấm (Priority: P1)

Giáo viên và học sinh bấm nút / thẻ / menu và thấy phản hồi ngay lập tức — không còn cảm giác
"bấm mà app không nghe". Điều hướng bàn phím luôn thấy mình đang ở đâu.

**Why this priority**: Chạm vào 100% màn hình, ảnh hưởng trực tiếp cảm nhận về độ nhanh của app.
Trước đây toàn bộ app chỉ có **1** quy tắc `:active` và **1** `:focus-visible`.

**Independent Test**: Mở bất kỳ trang, bấm giữ một nút → nút co nhẹ 0.97; nhấn Tab →
thấy vòng focus màu nhấn rõ ràng.

**Acceptance Scenarios**:

1. **Given** người dùng đang ở trang khóa học, **When** bấm nút "Bài tập", **Then** nút co lại
   ~3% trong ≤ 120ms rồi trở về, và hành động chạy bình thường.
2. **Given** người dùng chỉ dùng bàn phím, **When** nhấn Tab qua các nút/menu, **Then** mỗi phần tử
   có vòng `outline` 2px màu `--color-focus`, offset 2px.
3. **Given** người dùng trên điện thoại, **When** chạm một thẻ khóa học, **Then** thẻ không bị
   "dính" trạng thái hover nâng lên sau khi nhả tay.

---

### User Story 2 - Số liệu không nhảy khi thay đổi (Priority: P1)

Học sinh xem điểm, XP, đếm ngược thời gian thi; giáo viên xem bảng điểm. Khi một con số đổi giá trị,
các chữ số bên cạnh không được xê dịch.

**Why this priority**: Lỗi thị giác rất dễ thấy trong app nhiều số (điểm, STT, đồng hồ), và trước đây
toàn app chỉ có 2 chỗ dùng `tabular-nums`.

**Independent Test**: Vào trang thi online, khi đồng hồ chạy từ 09:59 → 09:58, độ rộng khối số không đổi.

**Acceptance Scenarios**:

1. **Given** đồng hồ thi đang chạy, **When** giá trị giảm 1 giây, **Then** vị trí các chữ số không xê dịch.
2. **Given** bảng điểm có điểm 8 và 10, **When** hiển thị cạnh nhau, **Then** cột số thẳng hàng.

---

### User Story 3 - Trạng thái chờ có khung xương (Priority: P1)

Khi dữ liệu đang tải, người dùng thấy khung xương (skeleton) đúng hình dạng nội dung sắp hiện
thay vì dòng chữ "Đang tải…".

**Why this priority**: Cảm nhận tốc độ; tránh giật layout khi nội dung hiện ra (CLS).

**Independent Test**: Mở trang "Khóa học của tôi" với mạng chậm → thấy lưới thẻ xám nhấp nháy
đúng bố cục, sau đó nội dung thay vào cùng vị trí.

**Acceptance Scenarios**:

1. **Given** mạng chậm, **When** mở danh sách khóa học, **Then** hiện skeleton lưới thẻ, không hiện chữ thô.
2. **Given** dữ liệu tải xong, **When** nội dung hiện ra, **Then** không có cú nhảy bố cục (CLS ≈ 0).
3. **Given** người dùng bật "giảm chuyển động", **When** skeleton hiển thị, **Then** không có hiệu ứng chạy sóng.

---

### User Story 4 - Dùng tốt trên điện thoại (Priority: P1)

Học sinh mở web bằng điện thoại: không cuộn ngang, không bị iOS tự phóng to khi chạm vào ô nhập,
nút đủ lớn để bấm, thanh nộp bài không bị thanh gợi ý che.

**Why this priority**: Đa số học sinh dùng điện thoại; đây là điều kiện để dùng được thật.

**Independent Test**: Mở trang nộp bài trên iPhone 375px → chạm ô nhập không bị zoom; nút "Nộp bài"
nằm trên vùng an toàn; không có thanh cuộn ngang.

**Acceptance Scenarios**:

1. **Given** màn hình 360px, **When** mở bất kỳ trang nào, **Then** không xuất hiện cuộn ngang.
2. **Given** iPhone, **When** chạm vào ô nhập liệu, **Then** trang KHÔNG tự phóng to.
3. **Given** điện thoại có tai thỏ, **When** cuộn tới nút "Nộp bài", **Then** nút không bị thanh home che.
4. **Given** người dùng chạm nút, **When** nhả tay, **Then** không có vệt xanh/xám mặc định của trình duyệt.

---

### User Story 5 - Tôn trọng thiết lập giảm chuyển động (Priority: P2)

Người dùng bị say chuyển động hoặc dùng thiết bị yếu có thể bật "giảm chuyển động" ở hệ điều hành
và toàn bộ animation của LumiMath dừng lại.

**Why this priority**: Yêu cầu accessibility; trước đây toàn app **không có** quy tắc nào.

**Independent Test**: Bật `prefers-reduced-motion: reduce` trong DevTools → modal mở tức thì,
skeleton không chạy sóng.

**Acceptance Scenarios**:

1. **Given** hệ điều hành bật giảm chuyển động, **When** mở modal chi tiết bài giao, **Then** modal
   hiện ngay không có hiệu ứng.
2. **Given** cùng thiết lập, **When** trang tải, **Then** skeleton đứng yên (không shimmer).

---

### User Story 6 - Chuyển cảnh có chủ đích (Priority: P2)

Modal, backdrop và toast xuất hiện với chuyển động ngắn, đúng hướng — tạo cảm giác liền mạch
chứ không "bụp" hiện ra.

**Why this priority**: Đây là các tương tác "thỉnh thoảng" nên được phép animate; nhưng không được
làm chậm thao tác.

**Independent Test**: Mở modal chấm bài → modal trượt nhẹ 8px + mờ dần trong ~240ms.

**Acceptance Scenarios**:

1. **Given** người dùng bấm xem chi tiết, **When** modal mở, **Then** modal vào trong ≤ 300ms với
   `ease-out`, bắt đầu từ `scale(0.985)` + opacity 0 (không phải `scale(0)`).
2. **Given** một thông báo toast hiện ra, **When** nó xuất hiện, **Then** trượt từ trên xuống 8px.

---

### Edge Cases

- Trình duyệt cũ không hỗ trợ `color-mix()` hoặc `100dvh` → phải có giá trị dự phòng, không vỡ layout.
- Người dùng dùng bàn phím + screen reader: focus ring không bị `overflow: hidden` cắt mất.
- Trang có `.card` lồng trong modal cuộn: hiệu ứng `sticky` của thanh nộp bài không được che nội dung.
- Khi `prefers-reduced-motion` bật, các transition đặt inline trong JSX vẫn phải bị vô hiệu
  (dùng `!important` toàn cục).
- iOS Safari cũ: `env(safe-area-inset-bottom)` trả 0 → padding vẫn hợp lý.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hệ thống MUST có bộ token chuyển động trong CSS (`--ease-out`, `--ease-in-out`,
  `--ease-drawer`, `--dur-press`, `--dur-pop`, `--dur-modal`) dùng chung toàn app.
- **FR-002**: Hệ thống MUST có bộ token độ sâu `--shadow-1..4` với offset + blur mềm.
- **FR-003**: Mọi phần tử tương tác (button, link dạng nút, nav-link, card bấm được) MUST có
  `:active { transform: scale(0.97) }`.
- **FR-004**: Mọi phần tử tương tác MUST có `:focus-visible` với outline 2px màu `--color-focus`,
  offset 2px.
- **FR-005**: Hover nâng khối MUST chỉ áp dụng trong `@media (hover: hover) and (pointer: fine)`;
  trên thiết bị cảm ứng MUST không dính trạng thái hover.
- **FR-006**: Hệ thống MUST theme các "browser surface": `::selection`, `caret-color`, scrollbar,
  `text-underline-offset`.
- **FR-007**: Toàn bộ chữ số trong app MUST dùng `font-variant-numeric: tabular-nums`.
- **FR-008**: Heading (h1–h3, `.page-title`) MUST có `letter-spacing: -0.02em` và `text-wrap: balance`.
- **FR-009**: Hệ thống MUST cung cấp component skeleton (dòng, đoạn, lưới thẻ, danh sách dòng) và
  các trang danh sách MUST dùng skeleton thay chữ "Đang tải…".
- **FR-010**: Modal (`.lm-detail`), backdrop và toast MUST có animation vào ≤ 300ms với `ease-out`,
  không bắt đầu từ `scale(0)`.
- **FR-011**: `@media (prefers-reduced-motion: reduce)` MUST vô hiệu hoá animation/transition toàn cục.
- **FR-012**: `html` MUST có `-webkit-tap-highlight-color: transparent`; `body` MUST có
  `min-height: 100dvh`.
- **FR-013**: Trên ≤ 640px, `input`/`select`/`textarea` MUST có `font-size: 16px` để chống iOS zoom.
- **FR-014**: Vùng chạm của `.nav-link`, `.btn`, `.btn-lm` trên mobile MUST ≥ 44px.
- **FR-015**: Thanh hành động chính (nộp bài) MUST dùng `.lm-sticky-actions` để dính đáy trên mobile
  và chừa `env(safe-area-inset-bottom)`.
- **FR-016**: Toàn bộ token MUST được ghi trong `DESIGN.md` và JSX MUST NOT hard-code mã màu mới.

### Key Entities

- **Design Token**: biến CSS mang giá trị thiết kế (màu, easing, thời lượng, shadow, bán kính).
- **Skeleton**: khối chờ có hình dạng tương ứng nội dung thật.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% phần tử tương tác có cả `:active` và `:focus-visible` (kiểm bằng grep +
  kiểm tra thủ công trên 5 màn chính).
- **SC-002**: Không còn chữ số nhảy: đồng hồ thi và bảng điểm dùng `tabular-nums` (kiểm bằng
  DevTools computed style).
- **SC-003**: 100% trang danh sách chính (khóa học, bài giao, khám phá, ngân hàng đề) có skeleton
  thay vì chữ "Đang tải…".
- **SC-004**: Bật `prefers-reduced-motion: reduce` → 0 animation chạy (kiểm bằng DevTools).
- **SC-005**: Ở 360px không có cuộn ngang trên 5 màn chính; iOS không zoom khi focus input.
- **SC-006**: `next build` + `nest build` pass trong giới hạn RAM VPS; `web 200` sau deploy.
- **SC-007**: Client CSS tăng ≤ 15% (đo bằng kích thước file CSS build).

## Assumptions

- Người dùng chính dùng Chrome/Safari đời mới; `color-mix()` và `100dvh` được hỗ trợ (có fallback).
- Bản sắc thị giác hiện tại (đỏ đô/kem/hổ phách) được giữ nguyên — không thiết kế lại.
- Hành vi nghiệp vụ (LaTeX, chấm bài, nộp bài) không thay đổi trong feature này.
- Không thêm thư viện UI/animation mới ở giai đoạn này; chỉ CSS + component React thuần.
