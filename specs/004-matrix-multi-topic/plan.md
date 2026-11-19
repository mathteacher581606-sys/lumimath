# Implementation Plan: Chọn nhiều chủ đề trong một dòng ma trận

**Branch**: `004-matrix-multi-topic` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

## Summary

Cho phép một dòng ma trận lưu **mảng chủ đề**; ô chọn đổi từ `<select>` sang bảng checkbox theo
cây mục lục; backend mở rộng mỗi chủ đề thành toàn bộ cây con trước khi lọc câu hỏi.

## Technical Context

**Language/Version**: TypeScript 5 · React 18 · Next.js 14 · NestJS 10 · Prisma 5
**Primary Dependencies**: không thêm
**Storage**: PostgreSQL — ma trận lưu JSON trong `ExamMatrix.data` (không đổi schema)
**Testing**: build + gọi API với 2 chương để đối chiếu tổng câu
**Target Platform**: Web
**Performance Goals**: mỗi lần bốc câu ≤ 2 truy vấn
**Constraints**: giữ tương thích dữ liệu ma trận cũ (`topicId`)
**Scale/Scope**: `apps/web/app/teacher/exams/matrix/page.tsx`, `apps/api/src/bank/bank.service.ts`

## Constitution Check

| Nguyên tắc | Trạng thái |
|---|---|
| I. Tiếng Việt | ✅ nhãn "Chủ đề", "Bỏ chọn" |
| II. Bản sắc thị giác | ✅ dùng lại token hổ phách |
| III. Chuyển động có lý do | ✅ panel mở/đóng 180ms |
| IV. Nội dung toán học | ✅ không đụng render |
| V. VPS nhỏ | ✅ 0 dependency |
| VI. Di động | ✅ panel cuộn, checkbox ≥ 44px |

**Gate**: PASS.

## Project Structure

```text
apps/api/src/bank/bank.service.ts     # topicWithDescendants(mảng), readTopicIds()
apps/web/app/teacher/exams/matrix/page.tsx
                                      # TopicMultiPicker, appendTopicParams(), saveMatrix/loadMatrix
specs/004-matrix-multi-topic/{spec,plan,tasks}.md
```

## Research & Decisions

| Quyết định | Lý do |
|---|---|
| Gửi `topicIds` dạng CSV thay vì mảng lặp | URL ngắn, backend parse một lần |
| Giữ `topicId` = phần tử đầu | Ma trận cũ vẫn đọc được |
| Khử trùng sau khi hợp cây con | Chọn chương + dạng con không nhân đôi câu |
