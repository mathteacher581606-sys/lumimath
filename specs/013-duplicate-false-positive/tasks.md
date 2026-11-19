---

description: "Task list — sửa lỗi đề tự thay câu nghi trùng không giống nhau"
---

# Tasks: Sửa lỗi đề tự thay câu "nghi trùng"

**Input**: `/specs/013-duplicate-false-positive/`
**Prerequisites**: plan.md ✅, spec.md ✅

## Phase 1: Chẩn đoán

- [x] T001 Xác định `markDuplicates` đánh dấu cả câu "gần giống" (Levenshtein 0.88) là `duplicateOf`
- [x] T002 Xác định frontend mặc định `skipBank/include = !duplicateOf` → tự thay câu khác số

## Phase 2: Sửa backend

- [x] T010 `markDuplicates()` trả thêm `exact: boolean` (true = khớp chuẩn hoá tuyệt đối,
      false = gần giống)

## Phase 3: Sửa frontend

- [x] T020 `teacher/exams/import/page.tsx`: `skipBank = !!(q.duplicateOf && q.duplicateOf.exact)`
- [x] T021 `teacher/bank/page.tsx` (DOCX): `docxChecked` = `!(q.duplicateOf && q.duplicateOf.exact)`
- [x] T022 `teacher/bank/page.tsx` (TeX): `include = !(q.duplicateOf && q.duplicateOf.exact)` + cập nhật thông báo

## Phase 4: Kiểm thử thực tế

- [x] T030 Import 2 câu: trùng đúng (`x^2 - 5x`) → `exact=true`; khác 1 số (`x^3 - 5x`) → `exact=false`
- [x] T031 `nest build` + `next build` pass · `web 200` · `public 200`

## Requirements coverage

| FR | Task |
|---|---|
| FR-001 | T010 |
| FR-002 | T020, T021, T022 |
| FR-003 | T020, T021, T022 |
| FR-004 | (không đổi — giữ nguyên) |
