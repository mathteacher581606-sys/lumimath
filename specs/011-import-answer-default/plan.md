# Implementation Plan: Sửa lỗi MCQ thiếu đáp án bị mặc định thành A

**Branch**: `011-import-answer-default` | **Date**: 2026-11-18 | **Spec**: [spec.md](./spec.md)

## Summary

`parseExBlock` (nhánh MCQ) khởi tạo `answer = 'A'` rồi chỉ ghi đè khi gặp `\True`. Khi nguồn
không có `\True` (hoặc dùng quy ước khác), đáp án bị **gán sai thành A**. Sửa thành `answer = null`
kèm cờ `answerMissing`, và cảnh báo ở bước preview để giáo viên biết câu chưa có đáp án.

## Technical Context

**Language/Version**: TypeScript 5 · NestJS 10 · Next.js 14
**Primary Dependencies**: không thêm
**Testing**: round-trip qua `POST /bank/import-tex/preview` với đề mẫu có/không `\True`
**Target Platform**: Web + API
**Scale/Scope**: `apps/api/src/bank/bank.service.ts`, `apps/web/app/teacher/exams/import/page.tsx`

## Constitution Check

| Nguyên tắc | Trạng thái |
|---|---|
| I. Tiếng Việt | ✅ cảnh báo "Chưa xác định đáp án" |
| II. Bản sắc thị giác | ✅ dùng `badge badge-danger` có sẵn |
| III. Chuyển động | ✅ không thêm |
| IV. Nội dung toán học không vỡ | ✅ chỉ đổi giá trị `answer`, không đụng nội dung |
| V. VPS nhỏ | ✅ 0 dependency |
| VI. Di động | ✅ badge nằm trong hàng wrap |

**Gate**: PASS.

## Project Structure

```text
apps/api/src/bank/bank.service.ts                  # parseExBlock: answer=null + answerMissing
apps/web/app/teacher/exams/import/page.tsx         # cảnh báo badge + reparseQuestion
specs/011-import-answer-default/{spec,plan,tasks}.md
```

## Research & Decisions

| Quyết định | Lý do |
|---|---|
| `answer = null` thay vì giữ `'A'` | Không chấm sai tự động; `gradeQuestion` trả `false` khi `answer=null` → giáo viên chấm tay |
| Cờ `answerMissing` riêng thay vì chỉ `answer=null` | Phân biệt rõ "chưa có đáp án" để UI cảnh báo, không nhầm với các loại câu khác |
| Không mở rộng xử lý `\choiceTF` | Đúng/sai dùng cặp `\TrueTF/\FalseTF` riêng; ngoài phạm vi feature này |
| Kết luận chẩn đoán về "đổi ký tự" | Round-trip + quét 1.515 câu: **không có hỏng ký tự** (đã chứng minh) |
