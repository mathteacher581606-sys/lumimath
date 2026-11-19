# Tasks — 004-matrix-multi-topic

**Spec**: [spec.md](./spec.md) · **Trạng thái**: ✅ Hoàn thành (2026-11-09)

## Backend (`apps/api/src/bank/bank.service.ts`)
- [x] T001 `topicWithDescendants(bankId, topicId | topicId[])` — nhận 1 hoặc nhiều gốc, trả hợp cây con.
- [x] T002 Helper `readTopicIds(query)` — đọc `topicIds` (comma) + `topicId` (cũ), khử trùng.
- [x] T003 `listQuestionsPaged`: `where.topicId = { in: topicWithDescendants(bank, roots) }`.
- [x] T004 `listFormsByFilter`: áp dụng cùng quy tắc.

## Frontend (`apps/web/app/teacher/exams/matrix/page.tsx`)
- [x] T010 `Slot` thêm `topicIds: string[]` (giữ `topicId` = phần tử đầu).
- [x] T011 Component `TopicMultiPicker` (button + panel checkbox theo cây, có "Bỏ chọn", đóng khi bấm ra ngoài).
- [x] T012 Thay `<select>` chủ đề bằng `TopicMultiPicker` ở cột Chủ đề.
- [x] T013 Helper `appendTopicParams(qs, slot)` — gửi `topicId` (1) hoặc `topicIds` (nhiều).
- [x] T014 Áp dụng cho `fillFromBank`, `loadPicker`, `swapSlotRandom`.
- [x] T015 Đổi Lớp ⇒ reset `topicId` + `topicIds`.
- [x] T016 `saveMatrix` lưu `topicId/topicIds/grade`; `loadMatrix` đọc lại (tương thích dữ liệu cũ).
- [x] T017 Import Excel: map `topicIds` (hoặc `topicId` cũ) → mảng.
- [x] T018 `buildQuick` gán `topicIds` từ `quickTopicId`.

## Kiểm thử & triển khai
- [x] T020 Test API: Chương A=102, Chương B=49, A+B=151 = 102+49 ✓ (hợp đúng).
- [x] T021 Test API: 100 câu lấy về thuộc A∪B, **0 câu sai chủ đề** ✓.
- [x] T022 `nest build` + `next build` pass · `web 200` · `public 200` ✓.

## Acceptance
- [x] SC-1 Chọn 2 chương ⇒ đúng tổng 2 nhánh, 0 câu ngoài phạm vi ✓
- [x] SC-2 Nút hiển thị "N chủ đề" khi chọn >1 ✓ (logic `label`)
- [x] SC-3 Lưu/khôi phục ma trận giữ danh sách chủ đề ✓
- [x] SC-4 build + 200 ✓
