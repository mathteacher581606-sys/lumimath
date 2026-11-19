# Feature Specification — Chọn chủ đề theo cây mục lục trong trang Ma trận đề

**Feature branch**: `002-matrix-topic-tree`
**Created**: 2026-11-08
**Status**: Draft → Approved for implementation
**Input**: Yêu cầu của giáo viên trên trang "Tạo đề thi (ma trận)"

## Problem statement (Vấn đề)

Trên trang **Tạo đề thi (ma trận)**, cột **"Chủ đề"** của mỗi dòng hiển thị danh sách chủ đề
**phẳng, xếp theo alphabet** ("Bài 1…", "CHƯƠNG I…", "Dạng 1…" đan xen nhau). Giáo viên khó
nhận biết đâu là Chương, đâu là Bài, đâu là Dạng, và thứ tự không giống **cây mục lục** trong
Ngân hàng đề. Ngoài ra cột **"Dạng bài"** vẫn gợi ý các dạng của *mọi lớp*, gây nhiễu khi đã
chọn lớp.

## User scenarios (Kịch bản người dùng)

### US-1 — Chọn chủ đề theo đúng cây mục lục (P1)
Là giáo viên, khi tạo ma trận đề, tôi mở dropdown **"Chủ đề"** và thấy danh sách
**đúng thứ tự cây mục lục** của ngân hàng đề (Chương → Bài → Dạng), có **thụt lề theo cấp**,
để tôi chọn nhanh đúng chương/bài/dạng mình cần.

**Acceptance criteria**
1. Thứ tự các mục trong dropdown là **thứ tự duyệt cây (DFS)** theo `order` rồi `name` của
   từng cấp — giống hệt cây mục lục ở trang Ngân hàng đề.
2. Mỗi mục hiển thị **thụt lề theo độ sâu** (cấp 0 = Chương, cấp 1 = Bài, cấp 2 = Dạng…).
3. Khi chưa chọn lớp: hiển thị đủ 3 lớp, nhóm theo lớp nhưng vẫn tôn trọng thứ tự cây.
4. Khi đã chọn lớp ở dòng đó: **chỉ hiển thị chủ đề thuộc lớp đó** (đã có, giữ nguyên hành vi).

### US-2 — Chỉ gợi ý dạng toán thuộc lớp đã chọn (P1)
Là giáo viên, sau khi chọn **Lớp** ở một dòng ma trận, ô **"Dạng bài"** chỉ gợi ý
**các dạng toán thực sự có trong lớp đó**, giúp tôi không chọn nhầm dạng của lớp khác.

**Acceptance criteria**
1. Khi dòng chưa chọn lớp: gợi ý dạng của **tất cả** các lớp (giữ hành vi hiện tại).
2. Khi dòng đã chọn lớp: gợi ý **chỉ các dạng** xuất hiện trong câu hỏi của lớp đó.
3. Ô vẫn cho phép **gõ tự do** (không bắt buộc phải chọn trong danh sách).
4. Đổi lớp ⇒ danh sách gợi ý dạng được nạp lại theo lớp mới; giá trị dạng đã chọn được giữ
   nguyên (không tự xoá nội dung giáo viên đã gõ).

### US-3 — Không hồi quy (P2)
Các chức năng khác của trang ma trận (chọn câu hỏi, lưu ma trận, thống kê, quick-add) vẫn
hoạt động như cũ.

## Functional requirements

- **FR-1**: Dropdown "Chủ đề" của mỗi dòng ma trận phải render danh sách **phẳng hoá từ cây**
  (DFS) thay vì danh sách alphabet.
- **FR-2**: Nhãn mỗi mục có tiền tố thụt lề theo cấp (ví dụ `└ ` lặp theo `depth`).
- **FR-3**: Bộ lọc theo lớp giữ nguyên: `grade` rỗng ⇒ tất cả; có giá trị ⇒ chỉ lớp đó.
- **FR-4**: Nguồn dữ liệu dạng toán theo lớp là endpoint có sẵn
  `GET /bank/forms-by-filter?grade=<N>` (trả `{name, count}[]`).
- **FR-5**: Mỗi dòng ma trận dùng **datalist riêng** để gợi ý dạng theo lớp của chính dòng đó.
- **FR-6**: Không thay đổi API backend (dùng endpoint hiện có).

## Out of scope

- Không đổi schema DB.
- Không đổi giao diện màu sắc/bố cục tổng thể (chỉ thêm thụt lề + lọc dữ liệu).
- Không thêm chức năng sửa cây mục lục tại trang ma trận.

## Success criteria

- **SC-1**: Với lớp 10, dropdown "Chủ đề" bắt đầu bằng các `CHƯƠNG …` (cấp 0), mỗi chương
  theo sau là các Bài rồi các Dạng của nó — đúng thứ tự cây.
- **SC-2**: Chọn lớp 11 ⇒ dropdown chỉ còn chủ đề lớp 11 và **không** chứa mục lớp 10/12.
- **SC-3**: Chọn lớp 10 ⇒ gợi ý "Dạng bài" không còn các dạng chỉ có ở lớp 11/12.
- **SC-4**: `next build` thành công, trang ma trận tải 200, không lỗi console.
