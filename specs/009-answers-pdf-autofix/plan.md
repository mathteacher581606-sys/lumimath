# Implementation Plan: Tải lại đáp án PDF & Tự động sửa lỗi LaTeX

**Branch**: `009-answers-pdf-autofix` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

## Summary

Thêm endpoint tạo **PDF đáp án** cho một `ExamAttempt` (dựng LaTeX từ `getAttemptDetail`, biên dịch
qua TeX Live) và một **lớp tự sửa LaTeX 3 tầng** dùng chung: chuẩn hoá lệnh phổ biến → sửa theo log
lỗi → fallback văn bản thuần.

## Technical Context

**Language/Version**: TypeScript 5 · NestJS 10 · Next.js 14 · Prisma 5
**Primary Dependencies**: không thêm (dùng LaTeX service sẵn có + `fs`, `fetch`)
**Testing**: script Node gọi API thật + `pdfjs-dist` đọc lại text trong PDF
**Target Platform**: Web + máy chủ VPS (LaTeX service :8080)
**Performance Goals**: ≤ 10 giây/đề 39 câu (thực đo ~6 giây)
**Constraints**: PDF phải luôn ra được (không trả lỗi trắng); không lộ đáp án khi bị khoá
**Scale/Scope**: `apps/api/src/common/tex-autofix.ts` (mới), `exams.service.ts`, `exams.controller.ts`,
`apps/web/app/student/attempts/page.tsx`

## Constitution Check

| Nguyên tắc | Trạng thái | Ghi chú |
|---|---|---|
| I. Tiếng Việt | ✅ | Tiêu đề "ĐÁP ÁN & LỜI GIẢI", "Bài làm của bạn", thông báo lỗi tiếng Việt |
| II. Bản sắc thị giác | ✅ | Nút dùng `btn-lm ghost` sẵn có |
| III. Chuyển động | ✅ | Không thêm animation |
| IV. Nội dung toán học không vỡ | ✅ | PDF dựng đúng LaTeX; tự sửa thay vì bỏ công thức |
| V. VPS nhỏ | ✅ | 0 dependency mới; PDF không cache (chấp nhận) |
| VI. Di động | ✅ | Nút nằm trong hàng badge, wrap được |

**Gate**: PASS.

## Project Structure

```text
apps/api/src/common/tex-autofix.ts          # [mới] normalizeTex / fixFromLog / texToPlainText
apps/api/src/exams/exams.service.ts         # compileWithAutoFix, buildAttemptAnswersPdf, answerToTex
apps/api/src/exams/exams.controller.ts      # GET :id/attempts/:attemptId/answers-pdf
apps/web/app/student/attempts/page.tsx      # nút "📄 Tải đáp án PDF" + tải blob
specs/009-answers-pdf-autofix/{spec,plan,tasks}.md
```

## Research & Decisions

| Quyết định | Lý do |
|---|---|
| Tự sửa **3 tầng** (chuẩn hoá → theo log → verbatim) | Đề thật có nhiều lỗi khác nhau; mỗi tầng bắt một lớp lỗi, tầng cuối đảm bảo luôn có PDF |
| Bỏ `\immini` nhưng **giữ phần chữ** | Hình tikz lồng nhiều ngoặc rất dễ lỗi; phần chữ mới là nội dung học sinh cần |
| `\True/\False` → **"Đúng"/"Sai"** thay vì xoá | Xoá thì mất nghĩa; đổi thành chữ vẫn đúng ngữ nghĩa |
| **Không** khai báo `\True/\False` trong preamble | Bộ chuẩn hoá chạy trên toàn văn bản sẽ ghi đè chính tên macro trong preamble → gây lỗi "Invalid UTF-8 byte" (đã gặp thật) |
| Fallback dùng **verbatim** | LaTeX không diễn giải lệnh trong verbatim → gần như không thể lỗi |
| Trả `X-Latex-Autofix*` header | Quan sát được hệ thống đã sửa gì, phục vụ chẩn đoán |
| Tôn trọng `getAttemptDetail` (cổng đáp án) | Không tạo đường rò rỉ đáp án mới |
