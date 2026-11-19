# 015 · Rà soát: ngân hàng câu hỏi/đề, nhập đề, câu trùng, biên dịch ex_test/TikZ (19/11/2026)

## Đã sửa
- [x] **[Nghiêm trọng] LaTeX service chạy `-shell-escape`** + API `compile-tikz/math/latex` mở cho mọi tài khoản
      (kể cả học sinh) → chạy được lệnh hệ thống (`\write18`) và đọc file (`\input{/etc/passwd}`).
      Sửa: `apps/latex-service/server.js` bỏ shell-escape, `openin_any/openout_any=p`, `execFile` (không qua shell),
      xoá thư mục tạm, giới hạn 25MB, tối đa 2 lần biên dịch song song, timeout 90s.
      Kiểm chứng thật: `\immediate\write18{touch /tmp/PWNED}` → không tạo file; `\input{/etc/passwd}` → bị chặn; TikZ vẫn ra PDF.
- [x] API chặn lệnh TeX nguy hiểm trước khi gửi biên dịch (`assertSafeTex` trong `compileRaw`)
- [x] Giới hạn biên dịch theo tài khoản (HS 60 / GV 400 lần / 10 phút), đoạn ≤ 20.000 ký tự;
      ảnh TikZ do học sinh gửi không ghi vĩnh viễn ra đĩa
- [x] `docker-compose.yml`: mọi cổng (Postgres, Redis, MinIO, LaTeX) chỉ mở cho 127.0.0.1
- [x] Rà câu trùng: chuẩn hoá giữ tên lệnh (\sin ≠ \cos, \le ≠ \ge…), bỏ khoảng trắng quanh toán tử
- [x] Rà câu trùng: Levenshtein có ngưỡng (O(n·k), bộ nhớ O(n)); quét kho gom nhóm trùng tuyệt đối bằng Map,
      gần giống chỉ so cửa sổ độ dài ±12%, nhường CPU định kỳ (trước đây O(n²·L²) → treo API)
- [x] Xoá câu: chỉ chuyển đề thi sang câu TRÙNG TUYỆT ĐỐI (trước nhận câu "giống 88%" → đề đổi số liệu)
- [x] Xoá nhiều câu: tính trước câu thay thế ngoài transaction, timeout 120s (trước quá 5s là lỗi)
- [x] Nhập ex_test: bỏ comment `%`; nhận `\SA{}` (lệnh tắt của `\shortans`); lựa chọn kế tiếp phải nằm ngay sau
      (trước: câu < 4 lựa chọn lấy nhầm `{tikzpicture}` làm phương án)
- [x] Ngân hàng đề: sửa/xoá câu trong đề phải thuộc đúng đề đó (trước sửa/xoá được câu của đề GV khác); kiểm tra điểm câu
- [x] Chủ đề: thư mục cha phải thuộc kho mình, không tạo vòng lặp; câu hỏi chỉ gắn chủ đề của kho mình

## Chưa kiểm chứng / cần quyết định
- [ ] Biên dịch trọn đề `ex_test` (môi trường soạn code thiếu gói `vntex`) — thử trên VPS
- [ ] `\dapso{…}` trong ex_test có nên nhập thành câu Trả lời ngắn?
- [ ] Xoá đề thi đang xoá kèm (cascade) toàn bộ bài làm của học sinh — có cần chặn/khoá thay vì xoá?
- [ ] `docx-import.helper.ts` (1.031 dòng) mới đọc lướt, chưa rà sâu

## Bổ sung 19/11 (chiều)
- [x] `\dapso{…}` nhập thành Trả lời ngắn (khi câu không có \choice/\choiceTF)
- [x] Lưu trữ đề (`Exam.archivedAt`) thay vì xoá; vẫn có "Xóa hẳn"; xem + khôi phục đề đã lưu trữ
- [x] Rà câu trùng theo phạm vi: 1 khối, 1 thư mục (gồm thư mục con), hoặc chỉ so câu cùng chủ đề
- [x] Tìm theo mã: gõ phần đầu ("A1") ra mọi câu có mã bắt đầu bằng A1
- [x] Tìm theo nội dung hiểu LaTeX: bỏ dấu, khoảng trắng, `$`, `{}`, `\left/\right`, `\dfrac≡\frac`; khớp từng cụm; tìm cả trong lựa chọn/lời giải; chờ 300ms sau phím cuối
- [x] Sửa câu hỏi & đáp án ngay trong đề (`PATCH /exams/:id/items/:itemId/question`): cập nhật câu gốc trong ngân hàng,
      tạo lại .tex mọi đề dùng câu đó, cảnh báo số đề/bài nộp bị ảnh hưởng, tuỳ chọn chấm lại khi đổi đáp án
