---

description: "Task list — đáp án PDF + tự sửa LaTeX khi xuất PDF"
---

# Tasks: Tải lại đáp án PDF & Tự động sửa lỗi LaTeX

**Input**: `/specs/009-answers-pdf-autofix/`
**Prerequisites**: plan.md ✅, spec.md ✅

## Phase 1: Lớp tự sửa LaTeX (US2)

- [x] T001 [US2] `apps/api/src/common/tex-autofix.ts` — `normalizeTex()`: lq/rq, break/quad,
      ex_test (`\begin{ex}`, `\loigiai`, `\choice`, `\dapso`), `\True/\False` → Đúng/Sai,
      `\immini` (giữ phần chữ), bỏ ký tự hỏng (surrogate lẻ / control chars)
- [x] T002 [US2] `fixFromLog()`: môi trường lạ, macro lạ, `&` ngoài bảng, ngoặc lệch, khối tikz lỗi
- [x] T003 [US2] `texToPlainText()`: bóc LaTeX về văn bản thuần
- [x] T004 [US2] Helper `readArg()` / `rewriteMacro()` — đọc đối số có ngoặc lồng nhau

## Phase 2: Biên dịch có tự sửa (US2)

- [x] T010 [US2] `exams.service.ts` — `compileWithAutoFix()`: thử → sửa theo log (≤ 3 lần) →
      fallback verbatim; ghi `/tmp/last-fail-answer.tex` để chẩn đoán
- [x] T011 [US2] Header `X-Latex-Autofix` + `X-Latex-Autofix-Count` trong controller

## Phase 3: PDF đáp án (US1)

- [x] T020 [US1] `buildAttemptAnswersPdf()` — dựng LaTeX từ `getAttemptDetail()`:
      tiêu đề, học sinh/lớp, điểm, thời điểm nộp, từng câu + lựa chọn (đọc `options[].text`),
      đáp án, bài làm, điểm câu, lời giải
- [x] T021 [US1] Preamble: `inputenc(utf8)`, `T5`, `vntex`, amsmath/amssymb, geometry, enumitem,
      graphicx, colortbl/xcolor, tikz (khi cần), định nghĩa `\heva/\hoac/\itemch/\itemchoice/\itemEX`
- [x] T022 [US1] Controller `GET :id/attempts/:attemptId/answers-pdf` (JWT; chủ bài/teacher/admin)
- [x] T023 [US1] Frontend: nút "📄 Tải đáp án PDF" + tải blob + trạng thái "⏳ Đang tạo PDF…"

## Phase 4: Kiểm thử thực tế

- [x] T030 [US1] Đề 39 câu → **HTTP 200, 293,6 KB, 16 trang**, header `%PDF-` hợp lệ
- [x] T031 [US1] Đọc lại text PDF bằng `pdfjs-dist`: có tiêu đề, tên HS, điểm, "Đáp án",
      "Bài làm của bạn", "Lời giải"; lựa chọn hiển thị đúng (A. 45°, B. 60°, C. 90°, D. 120°)
- [x] T032 [US1] Học sinh khác gọi API → **403**
- [x] T033 [US2] Header tự sửa: **3 lỗi** — `\break/\qquad/\quad`, `\True/\False`, `\immini`
- [x] T034 [US2] Sửa lỗi thật gặp trong quá trình làm:
      `\itemch` chưa định nghĩa → thêm preamble; `\False` undefined → đổi thành "Sai";
      `Invalid UTF-8 byte "90` → do preamble chứa `\newcommand{\True}` bị bộ chuẩn hoá ghi đè
      (đã bỏ định nghĩa đó); fallback lỗi `\\[A.]` → chuyển sang verbatim
- [x] T035 `nest build` + `next build` pass; `web 200`

## Requirements coverage

| FR | Task |
|---|---|
| FR-001, FR-002 | T020, T022 |
| FR-003, FR-004 | T020, T021 |
| FR-005 | T001 |
| FR-006 | T002 |
| FR-007 | T010 |
| FR-008 | T011 |
| FR-009 | T023 |
