# Tasks — 002-matrix-topic-tree

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)
**Trạng thái**: ✅ Hoàn thành (2026-11-08)

## Phase 1 — Chuẩn bị
- [x] T001 Thêm kiểu `TopicFlat` + hàm `buildTreeFor(flat)` / `buildOrderedTopics(flat, grade)` vào `matrix/page.tsx`.
- [x] T002 Thêm state `formOptionsByGrade` + hàm `ensureFormOptions(grade)` (cache, gọi `/bank/forms-by-filter?grade=`).

## Phase 2 — Chủ đề theo cây
- [x] T010: Dropdown "Chủ đề" của từng dòng ma trận dùng `buildOrderedTopics(topics, s.grade)` + nhãn thụt lề theo `depth` (`└ `).
- [x] T011: Dropdown "Chủ đề" ở khu quick-add cũng dùng `buildOrderedTopics(topics, quickGrade)`.
- [x] T012: Khi chưa chọn lớp ⇒ nhóm theo 3 tiêu đề `── LỚP 10/11/12 ──` (option disabled), mỗi lớp là một cây con.

## Phase 3 — Dạng bài theo lớp
- [x] T020: Khi đổi "Lớp" ở một dòng ⇒ `ensureFormOptions(newGrade)` (nạp + cache dạng của lớp).
- [x] T021: Ô "Dạng bài" dùng `list={'matrix-form-list-'+i}` + `<datalist>` riêng; nguồn = `formOptionsByGrade[s.grade] || forms`.
- [x] T022: `onFocus` ô dạng bài cũng nạp dạng theo lớp.
- [x] T023: Giữ datalist chung `matrix-form-list` cho quick-add.

## Phase 4 — Kiểm thử & triển khai
- [x] T030: Kiểm thử `buildOrderedTopics` bằng Node với **588 topic thật** — DFS đúng, độ sâu tối đa 2.
- [x] T031: `pnpm --filter @lumimath/web build` pass.
- [x] T032: Deploy VPS, `pm2 restart lumimath-web`, `web 200 · public 200`.
- [x] T033: Đối chiếu thứ tự lớp 10 với cây mục lục thật: CHƯƠNG I → Bài 1 → Dạng 1..6 → Bài 2 → Dạng 1.. ✔

## Acceptance (đối chiếu spec)
- [x] SC-1 Thứ tự = cây mục lục (DFS) ✔
- [x] SC-2 Chọn lớp ⇒ chỉ chủ đề lớp đó (kiểm thử: 0 mục sai lớp ở lớp 11) ✔
- [x] SC-3 Chọn lớp ⇒ gợi ý dạng chỉ thuộc lớp đó ✔
- [x] SC-4 build pass, trang 200, không lỗi biên dịch ✔

## Ghi chú dữ liệu
- Một số topic gốc tên "Dạng …" (mồ côi, `parentId = null`) do lần nhập trước tạo ở cấp gốc; chúng
  xuất hiện đầu danh sách khi lọc lớp. Đây là dữ liệu sẵn có (cây ngân hàng đề cũng hiển thị như vậy),
  không phải lỗi của tính năng mới. Có thể dọn riêng nếu giáo viên muốn.
