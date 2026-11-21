# 018 — Bảng chấm bài thống nhất (ảnh + PDF)

Thiết kế mẫu đã duyệt (máy tính + iPad ngang). Đợt 1:

- [x] `apps/web/lib/board-render.ts` — vẽ/dò va chạm, khổ logic LW=1150 (tương thích nét cũ)
- [x] `apps/web/lib/pdf-doc.ts` — mở PDF, vẽ từng trang khi vào màn hình
- [x] `apps/web/components/GradingBoard.tsx` — bút mượt (lực bút), highlight 3 màu, tẩy theo nét, chữ, mũi tên, dấu ✓ ✗ ?, dấu điểm ±, nhận xét mẫu (kéo thả/chạm), phóng to (nút, Ctrl+cuộn, hai ngón), cuộn liền nhiều trang, tự lưu 1,2 giây, "Chỉ vẽ bằng bút"
- [x] Gắn vào `grade/page.tsx` (ảnh, PDF, ảnh tự luận đề thi); dấu điểm tự cộng/trừ vào ô điểm (`annotations.stampApplied`)
- [x] Xoá AnnotateBoard, PdfAnnotator, ImageAnnotator, TldrawBoard (không còn nơi dùng)
- [ ] Kiểm chứng: build trên VPS, thử trên máy tính + iPad thật (CHƯA kiểm chứng — mới kiểm tra cú pháp)

Đợt 2 (chưa làm): tải bài đã chấm (PDF, pdf-lib), HS xem nét chấm, chấm theo câu cả lớp, cột chấm điểm từng câu theo mẫu.
Ghi chú: không thêm perfect-freehand (không cập nhật được pnpm-lock khi không có mạng) — nét mượt tự cài bằng đường cong bậc hai.
