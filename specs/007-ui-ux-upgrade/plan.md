# Implementation Plan: Nâng cấp & Tối ưu Giao diện – Trải nghiệm (Giai đoạn 0+1+2)

**Branch**: `007-ui-ux-upgrade` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-ui-ux-upgrade/spec.md`

## Summary

Xây một **lớp "cảm giác"** dùng chung cho toàn bộ `apps/web`: token chuyển động + độ sâu,
trạng thái tương tác (`:active`, `:focus-visible`, hover có điều kiện), theme cho browser surfaces,
`tabular-nums`, skeleton loading, animation cho modal/toast, và các bản vá mobile-native
(`100dvh`, chống iOS zoom, vùng chạm 44px, safe-area). **Không** đổi bố cục hay bảng màu;
toàn bộ triển khai trong `app/globals.css` + một component `components/Skeleton.tsx` + vài điểm
gắn class ở các trang danh sách.

## Technical Context

**Language/Version**: TypeScript 5 / Node 22 — Next.js 14 (App Router), React 18

**Primary Dependencies**: không thêm mới. Dùng CSS thuần + React. (framer-motion **không** dùng ở giai đoạn này.)

**Storage**: N/A (thuần trình bày)

**Testing**: `next build` (type + compile), smoke HTTP 200 qua Cloudflare, kiểm thủ công
DevTools (computed style, `prefers-reduced-motion`), kiểm 360px/768px/1440px.

**Target Platform**: Web — Chrome/Safari/Firefox đời mới; mobile Safari/Chrome Android.

**Project Type**: Web app (monorepo: `apps/web`, `apps/api`, `packages/db`).

**Performance Goals**: animation 60fps (chỉ `transform`/`opacity`); CLS ≈ 0 khi nội dung hiện ra;
UI animation < 300ms; CSS client tăng ≤ 15%.

**Constraints**: VPS 2 vCPU / 2GB — không thêm dependency nặng; build web/API không chạy đồng thời;
giữ nguyên bản sắc thị giác; toàn bộ chữ tiếng Việt.

**Scale/Scope**: 66 file UI, ~2.582 inline style; 4 màn hình danh sách chính + modal dùng chung.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc | Trạng thái | Ghi chú |
|---|---|---|
| I. Tiếng Việt là ngôn ngữ sản phẩm | ✅ PASS | Không thêm chuỗi tiếng Anh nào vào UI; skeleton dùng `aria-live` với nhãn tiếng Việt |
| II. Bản sắc thị giác bất biến | ✅ PASS | Chỉ thêm token mới (easing/shadow/duration); **không** đổi `--color-*`; không hard-code màu mới |
| III. Chuyển động có lý do | ✅ PASS | Chỉ animate `transform/opacity`; modal 240ms, toast 180ms; không animate menu/phím tắt; `reduced-motion` bật |
| IV. Nội dung toán học không được vỡ | ✅ PASS | Không đụng `LatexRenderer`/KaTeX; `.katex-display` giữ nguyên luật tràn ngang |
| V. Deploy trên VPS nhỏ | ✅ PASS | 0 dependency mới; CSS tăng ~14KB (thô) — trong hạn mức |
| VI. Di động trước | ✅ PASS | 100dvh, 16px input, tap target 44px, safe-area, hover có điều kiện |

**Kết luận gate**: PASS — không cần mục Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-ui-ux-upgrade/
├── spec.md              # Yêu cầu (spec-kit template)
├── plan.md              # File này
└── tasks.md             # Danh sách task (Phase 2 output)
```

### Source Code (repository root)

```text
apps/web/
├── app/
│   ├── globals.css                     # [+ token, state, browser surfaces, skeleton,
│   │                                   #  modal/toast animation, mobile-native]
│   ├── student/
│   │   ├── my-courses/page.tsx         # [~] skeleton thay "Đang tải…"
│   │   ├── courses/page.tsx            # [~] skeleton thay "Đang tải…"
│   │   └── courses/[id]/assignments/page.tsx
│   │                                   # [~] skeleton + `.lm-sticky-actions` cho nút nộp bài
│   └── ...
└── components/
    └── Skeleton.tsx                    # [mới] SkeletonLine / SkeletonText / SkeletonCards / SkeletonRows / Loading

DESIGN.md                               # [mới] Hệ thiết kế (token, motion, slop list)
.specify/                               # [mới] constitution + templates + scripts (spec-kit)
```

**Structure Decision**: Chỉ mở rộng `apps/web` (frontend thuần). Không đụng `apps/api` hay
`packages/db` vì feature không thay đổi nghiệp vụ.

## Complexity Tracking

Không có vi phạm Constitution — bảng trống.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Research & Decisions

| Quyết định | Lý do | Nguồn |
|---|---|---|
| **CSS thuần, không thêm thư viện animation** | framer-motion ≈ 40KB gz cho 6 hiệu ứng — không đáng trên VPS nhỏ; CSS đủ cho `:active`, modal, toast | `skills-main` (chỉ animate transform/opacity), ràng buộc V |
| **`tabular-nums` đặt ở `body`** | Đảm bảo mọi con số (điểm, XP, đồng hồ) không nhảy mà không phải sửa 2.582 inline style | UI cheatsheet (Emil) |
| **Hover chỉ trong `@media (hover:hover) and (pointer: fine)`** | Chống "sticky hover" trên điện thoại | `mobile-native` skill |
| **Skeleton thay chữ "Đang tải…"** | Giảm CLS, cảm nhận nhanh hơn | `impeccable` craft floor (states) |
| **`prefers-reduced-motion` dùng `!important` toàn cục** | Vì nhiều transition được đặt inline trong JSX, chỉ cách này vô hiệu được tất cả | `skills-main` (accessibility) |
| **Token đặt ở cuối `globals.css`** | Thắng theo thứ tự cascade mà không phải sửa 2.000 dòng phía trên | kỹ thuật CSS |
| **Không animate từ `scale(0)`** | Vật thể thật không hiện ra từ hư không; `0.985` + opacity tự nhiên hơn | `skills-main` |

## Phase Plan

- **Phase 0 (Setup)**: `.specify/` + `DESIGN.md` + token chuyển động/độ sâu.
- **Phase 1 (Foundational)**: trạng thái tương tác, browser surfaces, kiểu chữ, `tabular-nums`,
  skeleton, modal/toast animation, `reduced-motion`.
- **Phase 2 (US1–US6)**: gắn skeleton vào các trang danh sách, sticky action bar, kiểm mobile.
- **Phase 3 (Verify)**: build + deploy + smoke + kiểm DevTools.

P1 (polish từng màn hình, harden, hiệu năng) nằm ngoài feature này — sẽ là `008-…` tiếp theo.
