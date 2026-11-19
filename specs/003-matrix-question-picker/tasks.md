# Tasks — 003-matrix-question-picker

**Spec**: [spec.md](./spec.md) · **Trạng thái**: ✅ Hoàn thành (2026-11-09)

## Backend (`apps/api/src/bank/bank.service.ts`)
- [x] T001 Thêm `topicWithDescendants(bankId, topicId)` — BFS theo `parentId`, trả `[id, …con/cháu]`.
- [x] T002 `listQuestionsPaged`: `where.topicId = { in: topicWithDescendants(...) }`.
- [x] T003 `listFormsByFilter`: áp dụng cùng quy tắc mở rộng chủ đề.

## Frontend (`apps/web/app/teacher/exams/matrix/page.tsx`)
- [x] T010 `fillFromBank`: thêm mảng `shortages`.
- [x] T011 Nới lọc mức cho **cả 2 chế độ** (giữ lớp/chủ đề/dạng).
- [x] T012 Chế độ TỰ CHỌN: bỏ fallback "chỉ theo kiểu câu" ⇒ ghi `shortages`, để trống dòng.
- [x] T013 Sau vòng lặp: `alert` liệt kê dòng thiếu + gợi ý chọn lại Chủ đề.
- [x] T014 Chế độ NGẪU NHIÊN: giữ fallback cũ (không đổi).

## Kiểm thử & triển khai
- [x] T020 Test API: CHƯƠNG I (17 node) ⇒ 102 câu MCQ, **0 câu sai chủ đề**.
- [x] T021 Test API: Bài 1 ⇒ 40 câu MCQ, 0 sai.
- [x] T022 Test API: Dạng lá ⇒ 20 câu (không đổi).
- [x] T023 Test API: Chương + mức "Vận dụng" ⇒ 0 câu ⇒ frontend sẽ cảnh báo (không bốc bừa).
- [x] T024 `nest build` + `next build` pass · `web 200` · `public 200`.

## Acceptance
- [x] SC-1 Chương I ⇒ 102 câu ✔
- [x] SC-2 Bài 1 ⇒ 40 câu ✔
- [x] SC-3 0% câu ngoài nhánh ✔
- [x] SC-4 Thiếu câu ⇒ cảnh báo, không lấp bừa ✔
- [x] SC-5 build + 200 ✔
