---

description: "Task list — P1 polish/harden/perf"
---

# Tasks: Polish màn hình · Harden · Hiệu năng (P1)

**Input**: `/specs/008-ui-p1-polish/`
**Prerequisites**: plan.md ✅, spec.md ✅

## Phase 1: Hiệu năng (US1)

- [x] T001 [US1] `apps/web/components/LatexRenderer.tsx` — import `memo` từ React
- [x] T002 [US1] Đổi `export default function LatexRenderer` → `function LatexRenderer` +
      `export default memo(LatexRenderer)`

## Phase 2: Đồng hồ thi (US2)

- [x] T010 [US2] `apps/web/app/student/exams/[id]/take/page.tsx` — đồng hồ 3 mốc:
      bình thường `#4f46e5` > 5′ · hổ phách `#d97706` ≤ 5′ · đỏ `#dc2626` ≤ 1′
- [x] T011 [US2] Thêm nhãn "Còn dưới 5 phút" / "Sắp hết giờ!"
- [x] T012 [US2] `fontVariantNumeric: 'tabular-nums'` + cỡ 24px

## Phase 3: Harden (US3)

- [x] T020 [US3] `globals.css` — `img/video/canvas/svg/table { max-width: 100% }`,
      `pre/code { overflow-x: auto }`, `.card/.lm-detail-body { min-width: 0 }`
- [x] T021 [US3] `globals.css` — polish bảng dữ liệu: `border-collapse`, `thead th` đậm +
      `tabular-nums` + `nowrap`, `td/th { overflow-wrap: anywhere }`, sọc xen kẽ nhẹ
- [x] T022 [US3] `.lm-table-scroll` — vùng cuộn bảng có **header dính** (`position: sticky`)

## Phase 4: Phím tắt chấm bài (US4)

- [x] T040 [US4] `apps/web/app/teacher/courses/[id]/assignments/[assignmentId]/grade/page.tsx` —
      `useEffect` gắn `keydown`: `J`/`↓` bài kế · `K`/`↑` bài trước · `1`–`9` điểm (`0` = 10) ·
      `Ctrl/⌘+Enter` lưu · `?` bật/tắt gợi ý
- [x] T041 [US4] Guard `isTyping()`: bỏ qua khi focus ở `input`/`textarea`/`select`/`contentEditable`
- [x] T042 [US4] Dùng `saveRef`/`openRef` để listener không bị gắn lại mỗi render
- [x] T043 [US4] Nút "⌨️ Phím tắt" + bảng gợi ý (`<kbd>`) bật/tắt được

## Phase 5: Áp dụng nhanh trong Ma trận (US5)

- [x] T050 [US5] `apps/web/app/teacher/exams/matrix/page.tsx` — hàm
      `applyToPart(type, patch & { resetTopic })` cập nhật mọi slot cùng `type`
- [x] T051 [US5] Thêm "⚡ Lớp" và "⚡ Mức" vào thanh tiêu đề mỗi nhóm; tự reset về "—" sau khi áp dụng
- [x] T052 [US5] Đổi Lớp cho nhóm ⇒ xoá `topicId`/`topicIds` của các dòng (giữ câu hỏi đã bốc)
- [x] T053 [US5] Thanh tiêu đề nhóm thêm `flexWrap: wrap` để không tràn trên màn hẹp

## Phase 6: Hoàn thiện loading + bố cục thẻ (US6)

- [x] T060 [US6] `app/student/attempts/page.tsx` — `SkeletonRows` thay "Đang tải…"
- [x] T061 [US6] `app/student/leaderboard/page.tsx` — `SkeletonRows` thay "Đang tải…"
- [x] T062 [US6] `app/student/page.tsx` — lưới thẻ "Ôn tập / Bài tập / Chuỗi / Nhiệm vụ"
      thêm `alignItems: 'start'` (thẻ ngắn không bị kéo cao bằng thẻ dài nhất)

## Phase 7: Hiệu năng — nạp lười trình soạn LaTeX (US6)

- [x] T070 [US6] `app/teacher/bank/page.tsx` — `dynamic(() => import('@/components/LatexEditor'), { ssr: false, loading: skeleton })`
- [x] T071 [US6] `app/teacher/exams/compose/page.tsx` — nạp lười tương tự
- [x] T072 [US6] `app/teacher/exams/import/page.tsx` — nạp lười tương tự
- [x] T073 [US6] Đo lại payload: `/teacher/bank` **1.347,8 KB → 947,4 KB (−30%)**;
      `/teacher/exams/import` → 873,1 KB; `/teacher/exams/compose` → 428,1 KB
- [x] T074 [US6] Xác nhận **CodeMirror không còn trong gói tải ban đầu** (grep = 0) và số `<script>`
      của `/teacher/bank` giảm 14 → 11

## Phase 8: Skeleton cho màn hình giáo viên (US3 mở rộng)

- [x] T080 [US3] `app/teacher/courses/[id]/page.tsx` — thay `if (loading) return <div>Đang tải...</div>`
      bằng **khung chờ đúng bố cục** (banner 92px + sidebar chương 380px + 6 dòng bài giảng)
- [x] T081 [US3] Cùng file — 3 khối tải nội bộ (kết quả học tập, hoạt động, học sinh) đổi từ
      `<p>Đang tải…</p>` sang 3 dòng skeleton
- [x] T082 [US3] Xác nhận chunk trang khóa học chứa **7 khối** `skeleton`; payload
      `/teacher/courses/<id>` = 861,9 KB / 11 script

## Phase 9: Harden mobile + kiểm tra tải lười (US3/US6)

- [x] T090 [US3] Rà toàn bộ `gridTemplateColumns` có tổng cột px ≥ 420 → **chỉ 2 chỗ** (bảng Ma trận,
      604px). Các lưới khác đều `auto-fit/minmax` hoặc `fr` → đã responsive
- [x] T091 [US3] Sửa tràn ngang bảng Ma trận: thêm class `matrix-scroll` + CSS
      `overflow-x: auto !important` và `min-width: 900px` cho con trực tiếp (≤ 900px)
- [x] T092 [US6] Xác nhận `PdfAnnotator` (pdf.js 1,1 MB) **không** nằm trong tải đầu:
      `/teacher/courses/<id>/assignments/<aid>/grade` = **382,8 KB / 5 script**

## Phase 10: Harden bố cục + header dính bảng dài

- [x] T100 [US3] Rà `minWidth`/`width` cố định ≥ 380px trong JSX → **0 chỗ**;
      rà `min-width` trong CSS → chỉ media query và `.matrix-scroll` (có chủ đích)
- [x] T101 [US3] Bảng Ngân hàng đề: thêm class `lm-table-sticky` cho wrapper
- [x] T102 [US3] CSS `.lm-table-sticky thead th { position: sticky; top: 0 }` — header luôn hiển thị
      khi cuộn 1.123 câu

## Phase 11: Verify & Deploy

- [x] T030 `next build` pass
- [x] T031 Deploy + smoke 6 route → 200 (`/login`, `/teacher`, `/teacher/bank`, `/student`,
      `/student/my-courses`, `/student/courses`, `/student/exams`)
- [x] T032 Xác nhận `memo` có trong chunk dùng chung (`1712-*.js`)
- [x] T033 Xác nhận CSS chính (`f2170b6beb28276f.css`, 35.958 B) chứa đủ 12 quy tắc mới
      (`scale(.97)`, `tabular-nums`×6, `100dvh`, `skeleton-sweep`×2, `focus-visible`×8,
      `lm-sticky-actions`, `skeleton-table`×2, `lm-table-scroll`×2, `nth-child`,
      `prefers-reduced-motion`×2, `color-mix`×22, `hover:hover`)

## Requirements coverage

| FR | Task |
|---|---|
| FR-001 | T001, T002 |
| FR-002, FR-003 | T010–T012 |
| FR-004 | T020, T021, T022 |
| FR-005 | (đã có empty state ở các trang danh sách từ feature 006/007) |
| FR-006, FR-007 | T040–T043 |
| FR-008, FR-009 | T050–T053 |
| FR-010 (skeleton toàn bộ danh sách) | T060, T061 |
| FR-011 (lưới thẻ) | T062 |
| FR-012, FR-013 | T070–T074 |
| FR-010 (mở rộng: trang khóa học GV) | T080–T082 |
| FR-014 (ma trận cuộn ngang) | T090, T091 |
| FR-015 (pdf.js chỉ tải khi cần) | T092 |
