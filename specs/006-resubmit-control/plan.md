# Implementation Plan: Kiểm soát nộp lại & lịch sử bài nộp

**Branch**: `006-resubmit-control` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

## Summary

Thêm 2 trường chính sách cho bài giao (`maxResubmit`, `lockAfterGraded`) + bảng lịch sử
`AssignmentSubmissionHistory`; `submit()` kiểm tra hết hạn → số lượt → khoá sau khi chấm và ghi
lịch sử mỗi lần nộp; thêm API xem lịch sử và khối UI ở trang chấm bài.

## Technical Context

**Language/Version**: TypeScript 5 · NestJS 10 · Prisma 5 · PostgreSQL · Next.js 14
**Primary Dependencies**: không thêm
**Storage**: thêm 2 cột `Assignment`, thêm bảng `AssignmentSubmissionHistory`
**Testing**: kịch bản test tự động bằng Node (nộp 4 lần, chấm điểm, xem lịch sử)
**Target Platform**: Web
**Performance Goals**: mỗi lần nộp thêm 2 truy vấn (count + create history)
**Constraints**: tương thích dữ liệu cũ (bài nộp chưa có lịch sử ⇒ coi là phiên bản 1)
**Scale/Scope**: `apps/api/src/assignments/*`, `packages/db/prisma/schema.prisma`,
`apps/web/app/student/courses/[id]/assignments/page.tsx`,
`apps/web/app/teacher/courses/[id]/assignments/[assignmentId]/grade/page.tsx`

## Constitution Check

| Nguyên tắc | Trạng thái |
|---|---|
| I. Tiếng Việt | ✅ thông báo chặn/lý do khoá tiếng Việt |
| II. Bản sắc thị giác | ✅ dùng lại dải xanh/đỏ sẵn có |
| III. Chuyển động | ✅ không thêm animation |
| IV. Toán học | ✅ không đụng |
| V. VPS nhỏ | ✅ không thêm dependency; 1 bảng mới |
| VI. Di động | ✅ form đã responsive |

**Gate**: PASS.

## Project Structure

```text
packages/db/prisma/schema.prisma                    # maxResubmit, lockAfterGraded, History
apps/api/src/assignments/assignments.service.ts     # submit(), submissionHistory(), detail()
apps/api/src/assignments/assignments.controller.ts  # GET :id/submissions/:sid/history
apps/web/.../student/courses/[id]/assignments/page.tsx   # dải lượt sửa / lý do khoá
apps/web/.../teacher/courses/[id]/assignments/page.tsx   # 2 trường cấu hình
apps/web/.../assignments/[assignmentId]/grade/page.tsx   # khối Lịch sử nộp bài
specs/006-resubmit-control/{spec,plan,tasks}.md
```

## Research & Decisions

| Quyết định | Lý do |
|---|---|
| Bảng lịch sử **riêng** thay vì nhét mảng JSON vào submission | Truy vấn theo phiên bản, không phình bản ghi chính, dễ xoá theo cascade |
| `maxResubmit` **riêng** thay vì dùng `maxAttempts` | `maxAttempts` đang dùng cho số lần **thi lại** của đề thi — trộn sẽ gây tác dụng phụ |
| Khoá mặc định BẬT (`lockAfterGraded = true`) | An toàn cho điểm đã công bố; giáo viên chủ động mở nếu cần |
| Ghi lịch sử **sau** khi upsert submission | Đảm bảo có `submissionId`; bọc try/catch để lỗi trùng version không chặn nộp bài |
| Hạn nộp xét **trước** số lượt sửa | Thông báo cho học sinh đúng nguyên nhân gốc |
