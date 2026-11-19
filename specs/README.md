# LumiMath — Danh mục đặc tả (spec-kit)

Repo dùng quy trình **spec-kit** (`github/spec-kit`): Hiến pháp → Spec → Plan → Tasks → Implement.
Cấu trúc:

```
.specify/
├── memory/constitution.md     ← 6 nguyên tắc bắt buộc của LumiMath
├── templates/                 ← spec · plan · tasks · checklist · constitution
└── scripts/                   ← powershell + bash (tạo feature, setup plan/tasks)
specs/<###-feature>/
├── spec.md                    ← User Scenarios (Given/When/Then) + FR + SC + Assumptions
├── plan.md                    ← Technical Context + Constitution Check + quyết định
└── tasks.md                   ← task [P]/[USx] theo phase + bảng phủ FR→Task
```

## Danh mục

| # | Feature | Trạng thái | Spec-kit | Ghi chú |
|---|---|---|---|---|
| 002 | `matrix-topic-tree` — Chủ đề theo cây mục lục trong Ma trận | ✅ | một phần | Có spec/plan/tasks; tạo trước khi áp dụng template |
| 003 | `matrix-question-picker` — Bốc câu đúng chủ đề | ✅ | một phần | Như trên |
| 004 | `matrix-multi-topic` — Chọn nhiều chủ đề / dòng | ✅ | ✅ đầy đủ | Đã chuyển sang template spec-kit |
| 005 | `student-nav-split` — Tách Trang chủ / Khóa học của tôi | ✅ | ✅ đầy đủ | Đã chuyển sang template spec-kit |
| 006 | `resubmit-control` — Giới hạn sửa + khoá sau chấm + lịch sử | ✅ | ✅ đầy đủ | Đã chuyển sang template spec-kit |
| 007 | `ui-ux-upgrade` — Nâng cấp UI/UX (Giai đoạn 0+1+2) | ✅ | ✅ đầy đủ | Motion tokens, trạng thái, browser surfaces, skeleton, mobile |
| 008 | `ui-p1-polish` — Polish màn hình · Harden · Hiệu năng | ✅ | ✅ đầy đủ | Memo, đồng hồ thi, phím tắt chấm bài, áp dụng nhanh, lazy-load |
| 009 | `answers-pdf-autofix` — Tải đáp án PDF + tự sửa LaTeX khi xuất PDF | ✅ | ✅ đầy đủ | Endpoint `answers-pdf`, bộ tự sửa 3 tầng |
| 010 | `upload-image-corruption` — Ảnh bài làm bị hỏng khi tải lên | ✅ | ✅ đầy đủ | Sai thang chất lượng JPEG 0–1 vs 0–100 |
| 011 | `import-answer-default` — MCQ thiếu `\True` bị gán đáp án A | ✅ | ✅ đầy đủ | `answer=null` + cảnh báo "chưa xác định đáp án" |
| 013 | `duplicate-false-positive` — đề tự thay câu nghi trùng không giống nhau | ✅ | ✅ đầy đủ | chỉ trùng chính xác mới tự bỏ qua |

## Ngoài phạm vi spec-kit (đã hoàn thành trước khi áp dụng quy trình)

Các việc sửa lỗi nhỏ được thực hiện trực tiếp và ghi trong lịch sử hội thoại:
sửa `\lq`/`\rq`, lọc câu theo cây chủ đề, hiển thị đề tự luận, biên dịch `ex_test` khi tự gõ đề,
nút "Bài tập" lớn ở trang khóa học.

## Quy ước khi làm feature mới

1. Viết `spec.md` từ `.specify/templates/spec-template.md` (User Story có **Priority**,
   **Independent Test**, Acceptance Scenarios dạng **Given/When/Then**).
2. Viết `plan.md` từ `plan-template.md`, **điền bảng Constitution Check** (6 nguyên tắc).
3. Viết `tasks.md` từ `tasks-template.md`, mỗi task có **đường dẫn file** và nhãn `[P]`/`[USx]`.
4. Chỉ code sau khi có `tasks.md`; mỗi bước build + deploy + xác minh.
5. Khi đóng feature: cập nhật bảng phủ **FR → Task** và ghi số liệu kiểm chứng thật.
