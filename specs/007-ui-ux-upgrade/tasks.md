---

description: "Task list — nâng cấp UI/UX LumiMath (Giai đoạn 0+1+2)"
---

# Tasks: Nâng cấp & Tối ưu Giao diện – Trải nghiệm (Giai đoạn 0+1+2)

**Input**: Design documents from `/specs/007-ui-ux-upgrade/`

**Prerequisites**: plan.md ✅, spec.md ✅

**Tests**: Không có test tự động (feature thuần trình bày) — kiểm bằng build + DevTools + smoke.

**Organization**: Task nhóm theo user story để mỗi story có thể kiểm độc lập.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: chạy song song được (khác file, không phụ thuộc)
- **[Story]**: US1…US6 tương ứng spec.md

## Path Conventions

Web app monorepo: `apps/web/…` (xem plan.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dựng nền spec-kit + token dùng chung

- [x] T001 Tạo `.specify/` (memory/constitution.md, templates/, scripts/) từ spec-kit
- [x] T002 [P] Viết `DESIGN.md` — palette, type scale, spacing, elevation, motion, slop list
- [x] T003 [P] Thêm token `--ease-out/--ease-in-out/--ease-drawer`, `--dur-press/pop/modal`,
      `--shadow-1..4` vào `apps/web/app/globals.css`

**Checkpoint**: Token dùng được cho mọi task sau.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Lớp CSS nền mà mọi user story dựa vào

- [x] T004 `@media (prefers-reduced-motion: reduce)` vô hiệu hoá animation/transition toàn cục
      trong `apps/web/app/globals.css`
- [x] T005 Theme browser surfaces: `::selection`, `caret-color`, scrollbar, `text-underline-offset`
- [x] T006 `body { min-height: 100dvh; font-variant-numeric: tabular-nums }`;
      `html { -webkit-tap-highlight-color: transparent }`
- [x] T007 Heading `h1,h2,h3,.page-title { letter-spacing: -0.02em; text-wrap: balance }`

**Checkpoint**: Nền sẵn sàng — bắt đầu các user story.

---

## Phase 3: User Story 1 - Phản hồi tức thì khi bấm (P1) 🎯 MVP

**Goal**: Mọi phần tử bấm được phản hồi tức thì và có focus ring.

**Independent Test**: Bấm giữ nút bất kỳ → co 0.97; nhấn Tab → thấy vòng focus.

- [x] T010 [US1] `:active { transform: scale(0.97) }` cho `button`, `.nav-link`, `.btn`,
      `.btn-lm`, `.lm-filter-btn`, `.course-card` (`globals.css`)
- [x] T011 [US1] `transition: transform var(--dur-press) var(--ease-out), …` cho cùng nhóm
- [x] T012 [US1] `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px }`
- [x] T013 [US1] Hover nâng khối chỉ trong `@media (hover: hover) and (pointer: fine)`;
      `@media (hover: none)` triệt tiêu transform hover của `.course-card`
- [x] T014 [US1] `touch-action: manipulation` cho phần tử tương tác

**Checkpoint**: US1 kiểm độc lập được.

---

## Phase 4: User Story 2 - Số liệu không nhảy (P1)

**Goal**: Điểm/XP/đồng hồ/STT dùng chữ số đều.

**Independent Test**: Đồng hồ thi đổi giây, độ rộng khối số không đổi.

- [x] T020 [US2] `font-variant-numeric: tabular-nums` trên `body` (`globals.css`)
- [x] T021 [US2] Bổ sung utility `.tnum`, áp cho `.mono`, `time`

**Checkpoint**: US2 kiểm độc lập được.

---

## Phase 5: User Story 3 - Skeleton loading (P1)

**Goal**: Trang danh sách hiển thị khung xương thay chữ "Đang tải…".

**Independent Test**: Mở "Khóa học của tôi" với mạng chậm → thấy lưới thẻ xám.

- [x] T030 [P] [US3] Tạo `apps/web/components/Skeleton.tsx`
      (`SkeletonLine`, `SkeletonText`, `SkeletonCards`, `SkeletonRows`, `Loading`)
- [x] T031 [P] [US3] CSS `.skeleton` + `@keyframes skeleton-sweep` (chỉ `transform`)
- [x] T032 [US3] `app/student/my-courses/page.tsx` — `SkeletonCards` thay "Đang tải…"
- [x] T033 [US3] `app/student/courses/page.tsx` — `SkeletonCards`
- [x] T034 [US3] `app/student/courses/[id]/assignments/page.tsx` — `SkeletonCards` cho danh sách bài giao

**Checkpoint**: US3 kiểm độc lập được.

---

## Phase 6: User Story 4 - Dùng tốt trên điện thoại (P1)

**Goal**: 360px không cuộn ngang, không iOS zoom, vùng chạm 44px, safe-area.

**Independent Test**: iPhone 375px, chạm ô nhập → không zoom; nút nộp bài không bị che.

- [x] T040 [US4] `input, select, textarea { font-size: 16px !important }` trong `@media (max-width: 640px)`
- [x] T041 [US4] `.nav-link, .btn, .btn-lm { min-height: 44px }` trên mobile
- [x] T042 [US4] `.lm-sticky-actions` — thanh dính đáy + `env(safe-area-inset-bottom)`
- [x] T043 [US4] Gắn `.lm-sticky-actions` cho khối nút "Nộp bài" ở
      `app/student/courses/[id]/assignments/page.tsx`
- [ ] T044 [US4] Kiểm 360px trên 5 màn chính, ghi nhận màn nào còn cuộn ngang
      → **cần trình duyệt thật** (headless Chrome bị sandbox chặn trong phiên này).
      Đã bù bằng quy tắc chống tràn: `img/video/canvas/svg/table { max-width: 100% }`,
      `pre/code { overflow-x: auto }`, `.card/.lm-detail-body { min-width: 0 }`.

**Checkpoint**: US4 kiểm độc lập được.

---

## Phase 7: User Story 5 - Giảm chuyển động (P2)

- [x] T050 [US5] Khối `@media (prefers-reduced-motion: reduce)` dùng `!important` cho
      `animation-duration`, `transition-duration`, `scroll-behavior`
- [ ] T051 [US5] Kiểm bằng DevTools: bật emulate reduced-motion → 0 animation chạy
      → **cần trình duyệt thật**. Đã bù bằng khối CSS thứ hai tắt hẳn `.skeleton::after`,
      `.lm-detail`, `.lm-detail-backdrop`, `.toast` (không chỉ rút ngắn thời gian).

---

## Phase 8: User Story 6 - Chuyển cảnh có chủ đích (P2)

- [x] T060 [US6] `.lm-detail-backdrop` fade-in 180ms
- [x] T061 [US6] `.lm-detail` `modal-in` 240ms `ease-out`, từ `scale(0.985)` + opacity 0
- [x] T062 [US6] `.toast` `toast-in` 180ms, trượt 8px từ trên

---

## Phase 9: Verify & Deploy

- [x] T070 `next build` pass (VPS 2GB)
- [x] T071 Deploy + `pm2 restart lumimath-web` + smoke: `/login`, `/teacher`, `/student`,
      `/student/my-courses`, `/student/courses` → 200
- [x] T072 Xác nhận CSS build chứa: `scale(.97)`, `tabular-nums` (×4), `100dvh`,
      `skeleton-sweep` (×2), `focus-visible` (×8), `lm-sticky-actions`, `skeleton-table` (×2),
      `prefers-reduced-motion` (×2), `color-mix` (×21)
- [ ] T073 Kiểm DevTools trên production: computed `font-variant-numeric` = `tabular-nums`;
      `:active` hoạt động; `prefers-reduced-motion` tắt animation
      → **cần trình duyệt thật**; phần CSS đã xác nhận hiện diện trong bundle.

**Kích thước CSS build**: 59.928 → 60.479 bytes (+551 B ≈ **+0,9%**) — đạt SC-007 (≤ 15%).

---

## Requirements coverage

| FR | Task | Trạng thái |
|---|---|---|
| FR-001, FR-002 | T003 | ✅ |
| FR-003, FR-004, FR-005 | T010–T013 | ✅ |
| FR-006 | T005, T014 | ✅ |
| FR-007 | T020, T021 | ✅ |
| FR-008 | T007 | ✅ |
| FR-009 | T030–T034 | ✅ |
| FR-010 | T060–T062 | ✅ |
| FR-011 | T004 | ✅ |
| FR-012, FR-013, FR-014 | T006, T040, T041 | ✅ |
| FR-015 | T042, T043 | ✅ |
| FR-016 | T002 | ✅ |

**Còn lại (kiểm thủ công)**: T044, T051, T073 — cần mở trình duyệt thật.
