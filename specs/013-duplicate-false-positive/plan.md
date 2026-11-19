# Implementation Plan: Sửa lỗi đề tự thay câu "nghi trùng"

**Branch**: `013-duplicate-false-positive` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

## Summary

So trùng khi nhập đề đánh dấu cả câu "gần giống" (khác vài con số) là `duplicateOf`, và frontend
mặc định bỏ qua **mọi** `duplicateOf` → đề tự thay câu mới bằng câu cũ khác số. Sửa: thêm cờ
`exact` vào kết quả so trùng; chỉ `exact=true` mới tự bỏ qua.

## Technical Context

**Language/Version**: TypeScript 5 · NestJS 10 · Next.js 14
**Primary Dependencies**: không thêm
**Testing**: import preview với 2 câu (trùng đúng + khác 1 số) → kiểm `duplicateOf.exact`
**Scale/Scope**: `apps/api/src/bank/bank.service.ts`, 2 trang frontend nhập đề

## Constitution Check

| Nguyên tắc | Trạng thái |
|---|---|
| I. Tiếng Việt | ✅ cảnh báo giữ tiếng Việt |
| II. Bản sắc thị giác | ✅ không đổi UI |
| III. Chuyển động | ✅ không liên quan |
| IV. Nội dung toán học không vỡ | ✅ **cốt lõi** — không thay nhầm câu khác số |
| V. VPS nhỏ | ✅ 0 dependency |
| VI. Di động | ✅ không liên quan |

**Gate**: PASS.

## Project Structure

```text
apps/api/src/bank/bank.service.ts                  # markDuplicates trả thêm `exact`
apps/web/app/teacher/exams/import/page.tsx         # skipBank chỉ khi exact
apps/web/app/teacher/bank/page.tsx                 # include + docxChecked chỉ khi exact
specs/013-duplicate-false-positive/{spec,plan,tasks}.md
```

## Research & Decisions

| Quyết định | Lý do |
|---|---|
| Thêm cờ `exact` thay vì tắt hẳn "nghi trùng" | Vẫn giữ cảnh báo hữu ích; chỉ ngừng **tự thay thế** |
| Không đổi `normalizeQuestion`/`similar` | Tránh tác dụng phụ lên `findDuplicatePairs` và các luồng khác |
| Sửa ở cả TeX + DOCX | Cả 2 luồng đều dùng `markDuplicates` và cùng bị lỗi |
