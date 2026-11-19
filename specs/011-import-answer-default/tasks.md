---

description: "Task list — sửa lỗi nhập đề: MCQ thiếu đáp án mặc định thành A"
---

# Tasks: Sửa lỗi MCQ thiếu đáp án bị mặc định thành A

**Input**: `/specs/011-import-answer-default/`
**Prerequisites**: plan.md ✅, spec.md ✅

## Phase 1: Chẩn đoán (đã làm)

- [x] T001 Quét 1.515 câu: **0 ký tự hỏng** (không U+FFFD, không mojibake). 14 cờ "backslash-kép"
      là false-positive — đó là `\\` xuống dòng hợp lệ của LaTeX
- [x] T002 Round-trip qua `POST /bank/import-tex/preview`: giữ nguyên 100% ký tự (dấu Việt,
      `\dfrac`, `\frac`, `% & # _ ^ ~`)
- [x] T003 Phát hiện bug: `parseExBlock` khởi tạo `answer='A'`, chỉ đổi khi có `\True` ⇒
      MCQ không `\True` bị gán đáp án **A** (sai)

## Phase 2: Sửa backend

- [x] T010 `parseExBlock` (MCQ): `let answer: string | null = null` + `answerMissing = true`;
      `\True` đặt `answer` + `answerMissing=false`
- [x] T011 `previewImport` trả `answerMissing: !!p.answerMissing`
- [x] T012 `importExamPreview` trả `answerMissing: !!p.answerMissing`
- [x] T013 `parseQuestionBlock` trả `answerMissing` (cho nút "Sửa code" từng câu)

## Phase 3: Sửa frontend

- [x] T020 `apps/web/app/teacher/exams/import/page.tsx` — badge "⚠️ Chưa xác định đáp án" khi
      `q.answerMissing`
- [x] T021 `reparseQuestion` mang `answerMissing` về state

## Phase 4: Kiểm thử thực tế

- [x] T030 Round-trip lại:
      Q1 (có `\True` ở B) → `answer="B"` ✔
      Q2 (không `\True`) → `answer=null` ✔ (trước là "A")
      Q3 (`\shortans`) → `answer="4"` ✔
      Ký tự vẫn nguyên vẹn ✔
- [x] T031 `nest build` + `next build` pass · `web 200` · `public 200`

## Phase 5: Rà soát toàn bộ + cảnh báo Đúng/Sai (mở rộng)

- [x] T050 Audit 1.515 câu: 0 ký tự hỏng (U+FFFD/mojibake); round-trip giữ nguyên ký tự
- [x] T051 Re-parse 845 MCQ từ `texSource`: 827 khớp đáp án; 2 "lệch" là đề gốc tự sai
      (đáp án lưu mới đúng → KHÔNG sửa); 1 thiếu `\True`; ~110 không khớp content (immini/tikz)
- [x] T052 `parseExBlock` nhánh `\choiceTF`: thêm cờ `answerMissing` khi cả 4 ý không có dấu
      `\TrueTF`/`\FalseTF`/`\True`
- [x] T053 Test: TF có dấu → `answer={a:T,b:F,c:T,d:F}`, `answerMissing=false`;
      TF không dấu → `answerMissing=true`
- [x] T054 `nest build` pass · `api 401` (sống) · deploy ok
- [x] T055 Ghi báo cáo [audit.md](./audit.md)

## Requirements coverage

| FR | Task |
|---|---|
| FR-001, FR-002 | T010 |
| FR-003 | T011, T012, T013 |
| FR-004 | (đã có sẵn — `confirmImport` lưu `answer` null) |
| FR-005 | T020, T021 |
| (Đúng/Sai) | T052, T053 |
