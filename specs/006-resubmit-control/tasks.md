# Tasks — 006-resubmit-control

**Spec**: [spec.md](./spec.md) · **Trạng thái**: ✅ Hoàn thành (2026-11-10)

## Database
- [x] T001 `Assignment.maxResubmit Int?` (null = không giới hạn, 0 = không cho sửa).
- [x] T002 `Assignment.lockAfterGraded Boolean @default(true)`.
- [x] T003 Model `AssignmentSubmissionHistory` (version, content, imageUrls, pdfUrl, answers, submittedAt) + quan hệ.
- [x] T004 `prisma db push` + `prisma generate` trên VPS.

## Backend
- [x] T010 `submit()`: đếm phiên bản → tính `editsUsed`.
- [x] T011 `submit()`: chặn khi `editsUsed >= maxResubmit` (403, thông báo rõ).
- [x] T012 `submit()`: chặn khi `lockAfterGraded` và bài đã chấm/published (403).
- [x] T013 `submit()`: ghi 1 bản ghi lịch sử mỗi lần nộp (version tuần tự, bỏ qua lỗi trùng).
- [x] T014 `detail()`: trả `resubmit { isEssay, editsUsed, maxResubmit, editsLeft, graded, lockedAfterGraded, pastDue, canEdit }`.
- [x] T015 `submissionHistory()` service + `GET :id/submissions/:submissionId/history` (GV xem tất cả, HS chỉ xem của mình).
- [x] T016 `create()` / `update()` lưu `maxResubmit`, `lockAfterGraded`.

## Frontend
- [x] T020 Form tạo bài giao: ô "Số lần được SỬA tối đa" + checkbox "Khoá sửa sau khi đã chấm".
- [x] T021 Form sửa bài giao: 2 trường tương tự (nạp/ghi đúng giá trị).
- [x] T022 Trang học sinh: `canSubmit` theo `resubmit.canEdit` từ server.
- [x] T023 Trang học sinh: dải xanh "Còn N/M lượt sửa" hoặc dải đỏ nêu lý do khoá.
- [x] T024 Trang chấm bài: nút "📜 Lịch sử nộp bài (N)" + danh sách phiên bản (nội dung, ảnh, PDF, thời điểm).

## Kiểm thử & triển khai
- [x] T030 `maxResubmit=2` ⇒ nộp 1 + sửa 2 OK, sửa lần 3 bị chặn 403 ✔
- [x] T031 Lịch sử đúng 3 phiên bản, nội dung hiện tại = lần 3 ✔
- [x] T032 Đã chấm + `lockAfterGraded=true` ⇒ 403; tắt khoá ⇒ 201 ✔
- [x] T033 API lịch sử: GV 200 (4 phiên bản), HS 200 ✔
- [x] T034 `nest build` + `next build` pass · `web 200` · `public 200` ✔

## Acceptance
- [x] SC-1 Giới hạn số lần sửa ✔
- [x] SC-2 Khoá sửa sau khi chấm ✔
- [x] SC-3 Lưu & xem lịch sử nộp ✔
- [x] SC-4 Build + 200 ✔
