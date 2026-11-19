# Feature Specification — Bốc câu từ ma trận đúng chủ đề

**Feature branch**: `003-matrix-question-picker`
**Created**: 2026-11-09
**Status**: ✅ Implemented
**Input**: "Tính năng tạo đề từ ma trận đang gặp lỗi, câu hỏi đang lấy lung tung, không đúng chủ đề được chọn"

## Problem statement

Khi tạo đề từ **ma trận**, giáo viên chọn **Chủ đề = một CHƯƠNG hoặc một Bài** (nút cha trong cây
mục lục). Hệ thống trả về **0 câu** vì lọc `topicId` khớp **chính xác** nút cha (câu hỏi thực tế
gắn vào các **Dạng lá** bên trong). Sau đó hàm `fillFromBank` có **fallback nguy hiểm**: khi không
có câu, nó **bỏ toàn bộ bộ lọc** (lớp/chủ đề/dạng) và bốc bất kỳ câu cùng kiểu ⇒ **câu lung tung,
sai chủ đề**.

## User stories

### US-1 — Chọn Chương/Bài phải ra câu của cả nhánh (P1)
Chọn `CHƯƠNG I. MỆNH ĐỀ VÀ TẬP HỢP` ⇒ nhận được câu hỏi nằm ở **mọi Dạng con** của chương.
**AC**
1. `GET /bank/questions-paged?topicId=<chapter>` trả về câu của chương **và toàn bộ con/cháu**.
2. Tương tự cho `topicId=<bài>` và `GET /bank/forms-by-filter?topicId=…`.
3. Chọn Dạng lá (không có con) ⇒ kết quả như cũ.

### US-2 — Không bao giờ bốc câu ngoài chủ đề đã chọn (P1)
Ở chế độ **TỰ CHỌN** (tôn trọng bộ lọc từng dòng), nếu không đủ câu thì **để trống** và **cảnh báo**,
không lấp bằng câu khác chủ đề.
**AC**
1. Thứ tự nới lọc khi thiếu câu: giữ `type+grade+topicId+form`, **bỏ `difficulty`** trước.
2. Vẫn thiếu ⇒ dòng để trống, hiện `alert` liệt kê số dòng thiếu + gợi ý.
3. Chế độ **NGẪU NHIÊN** (sinh ma trận) giữ nguyên khả năng nới tới "chỉ đúng kiểu câu".

## Functional requirements
- **FR-1**: Backend `listQuestionsPaged` mở rộng `topicId` thành `{ in: [topicId, …descendants] }`.
- **FR-2**: Backend `listFormsByFilter` áp dụng cùng quy tắc.
- **FR-3**: Helper backend `topicWithDescendants(bankId, topicId)` (BFS theo `parentId`).
- **FR-4**: Frontend `fillFromBank`: bỏ nhánh fallback "chỉ theo kiểu câu" ở chế độ tự chọn; thay bằng
  mảng `shortages` + `alert`.
- **FR-5**: Chế độ ngẫu nhiên không đổi hành vi.

## Success criteria
- **SC-1**: Chương I lớp 10 ⇒ 102 câu MCQ (trước: 0).
- **SC-2**: Bài 1 lớp 10 ⇒ 40 câu MCQ (trước: 0).
- **SC-3**: 0% câu trả về nằm ngoài nhánh chủ đề đã chọn.
- **SC-4**: Dòng không đủ câu ⇒ không bị lấp bằng câu khác chủ đề; có cảnh báo.
- **SC-5**: `next build`/`nest build` pass, web 200.

## Out of scope
- Không đổi schema; không đổi UI màu sắc; không sửa cây mục lục.
