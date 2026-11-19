# Implementation Plan: Polish màn hình · Harden · Hiệu năng (P1)

**Branch**: `008-ui-p1-polish` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-ui-p1-polish/spec.md`

## Summary

Ba nhóm việc P1:
(1) **Hiệu năng**: bọc `LatexRenderer` trong `React.memo` — nội dung là chuỗi, không đổi thì
không parse lại markdown/KaTeX/tikz.
(2) **Polish**: đồng hồ thi 3 mốc màu + nhãn nhắc, chữ số đều.
(3) **Harden**: quy tắc chống tràn cho tên dài (đã có `overflow-wrap` từ feature 007, bổ sung
`min-width: 0` cho khung) và empty state.

## Technical Context

**Language/Version**: TypeScript 5 / React 18 / Next.js 14
**Primary Dependencies**: không thêm
**Testing**: `next build` + smoke HTTP + kiểm mã nguồn (memo, ngưỡng màu)
**Target Platform**: Web
**Performance Goals**: giảm số lần parse LaTeX khi state khác đổi
**Constraints**: VPS 2GB; không đổi hành vi nghiệp vụ
**Scale/Scope**: 2 file (`LatexRenderer.tsx`, `exams/[id]/take/page.tsx`)

## Constitution Check

| Nguyên tắc | Trạng thái | Ghi chú |
|---|---|---|
| I. Tiếng Việt | ✅ | Nhãn "Còn dưới 5 phút", "Sắp hết giờ!" |
| II. Bản sắc thị giác | ✅ | Dùng lại hổ phách `#d97706` và đỏ `#dc2626` đã có |
| III. Chuyển động có lý do | ✅ | Không thêm animation |
| IV. Nội dung toán học không vỡ | ✅ | `memo` không đổi logic render, chỉ giảm số lần gọi |
| V. VPS nhỏ | ✅ | không dependency, bundle gần như không đổi |
| VI. Di động trước | ✅ | đồng hồ 24px, tabular-nums, không tràn |

**Gate**: PASS.

## Project Structure

```text
apps/web/
├── components/LatexRenderer.tsx            # [~] function + export default memo(...)
├── app/student/exams/[id]/take/page.tsx    # [~] đồng hồ 3 mốc màu + nhãn
└── app/globals.css                         # [~] (đã có) overflow/min-width guards
specs/008-ui-p1-polish/{spec,plan,tasks}.md
```

## Research & Decisions

| Quyết định | Lý do |
|---|---|
| `memo` ở **default export** thay vì tách từng component con | Một thay đổi, rủi ro thấp nhất; `content` là string nên so sánh rẻ |
| Ngưỡng 5 phút / 1 phút | Khớp quy ước thi phổ thông; màu hổ phách đã có trong palette |
| Không dùng `content-visibility: auto` | Gây nhảy chiều cao khi cuộn trên Safari; rủi ro > lợi ích |
