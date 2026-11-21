# 018 — Bảng chấm bài thống nhất (ảnh + PDF)

Thiết kế mẫu đã duyệt (máy tính + iPad ngang). Đợt 1:

- [x] `apps/web/lib/board-render.ts` — vẽ/dò va chạm, khổ logic LW=1150 (tương thích nét cũ)
- [x] `apps/web/lib/pdf-doc.ts` — mở PDF, vẽ từng trang khi vào màn hình
- [x] `apps/web/components/GradingBoard.tsx` — bút mượt (lực bút), highlight 3 màu, tẩy theo nét, chữ, mũi tên, dấu ✓ ✗ ?, dấu điểm ±, nhận xét mẫu (kéo thả/chạm), phóng to (nút, Ctrl+cuộn, hai ngón), cuộn liền nhiều trang, tự lưu 1,2 giây, "Chỉ vẽ bằng bút"
- [x] Gắn vào `grade/page.tsx` (ảnh, PDF, ảnh tự luận đề thi); dấu điểm tự cộng/trừ vào ô điểm (`annotations.stampApplied`)
- [x] Xoá AnnotateBoard, PdfAnnotator, ImageAnnotator, TldrawBoard (không còn nơi dùng)
- [ ] Kiểm chứng: build trên VPS, thử trên máy tính + iPad thật (CHƯA kiểm chứng — mới kiểm tra cú pháp)

## Đợt 2

- [x] `apps/web/lib/board-export.ts` — xuất bài đã chấm ra PDF ngay trên trình duyệt (tự ghép PDF, không thêm thư viện, không tốn máy chủ). Đã thử: file PDF hợp lệ (pdf-lib đọc được, pdftoppm dựng được); bộ vẽ đã thử trên canvas thật
- [x] `apps/web/components/MarkedView.tsx` — HS xem nét chấm (chỉ đọc) + nút "Tải bài đã chấm (PDF)"; GV có nút tương tự trên trang chấm
- [x] API `assignments.service.ts`: chỉ gửi nét chấm (`mySubmission.marks`) cho HS khi điểm đã công bố; không còn gửi nguyên `annotations`
- [x] Chấm theo câu: chọn một câu tự luận → chỉ hiện câu đó, "Lưu và chấm học sinh sau" đi lần lượt cả lớp
- [ ] Chưa làm: cột chấm điểm từng câu theo đúng bản vẽ mẫu (hiện dùng cột bên phải sẵn có); xuất PDF cho ảnh tự luận trong đề thi online
- [ ] Kiểm chứng: build API + web trên VPS (tuần tự), thử thật trên máy tính + iPad
