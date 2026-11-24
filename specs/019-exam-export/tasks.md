# 019 — Tạo đề từ ma trận · Xuất PDF / .tex / Word · Trộn đề

Rà soát 24–25/11/2026: chạy chính code API (generateTex, compileExamPdf, tex-autofix, Word builder)
với câu mẫu thật (TikZ, \immini, \heva, bảng biến thiên, Đúng/Sai, trả lời ngắn, tự luận),
biên dịch bằng TeX Live + ex_test/lumimath của dự án, kiểm tra Word bằng pandoc + bộ XSD ISO/IEC 29500.
(Máy thử thiếu vntex → chữ tiếng Việt trong PDF chưa kiểm ở đây; VPS có.)

## Đợt 1 — sửa lỗi (commit e898c89)
- [x] T1 Ma trận lệch câu khi có ô trống → web gửi `questionIds` đúng vị trí ô + `strict`, server
      `itemsFromAlignedIds` kiểm tra loại câu/trùng/số ô — `apps/api/src/exams/exams.service.ts`,
      `apps/web/app/teacher/exams/matrix/page.tsx`. Kiểm: ô 2 trống → q1,q3 ở Phần I, không lệch; 3 ca lỗi đều bị chặn.
- [x] T2 Ô trống bị server tự bốc câu bất kỳ chủ đề → chế độ strict bỏ qua ô trống.
- [x] T3 Chỉ bốc trong 30 câu mới nhất → `GET /bank/questions-random` (toàn bộ câu khớp lọc, trừ exclude).
- [x] T4 Đúng/Sai dùng \TrueTF/\FalseTF (lệnh in nhãn) → \True. Kiểm: PDF hiện a) b) c) d) đúng; .tex nhập
      ngược giữ đáp án {a:Đ,b:S,c:Đ,d:Đ}. Sửa cả khung xem trước ngân hàng + mẫu trang Soạn đề.
- [x] T5 PDF đề không tự sửa → `compileExamPdf`: sửa theo log ×3 → chia đôi tìm câu lỗi → tự sửa từng câu → chữ
      thuần; báo qua header `X-Tex-Report`. Kiểm: đề 3 câu lỗi vẫn ra PDF, 2 câu tự sửa, báo "Phần III – Câu 2", 18 lần biên dịch.
- [x] T6 tex-autofix: chỉ xoá macro TeX nêu tên (trước đây xoá mọi lệnh ngoài danh sách → nát đề);
      escape & đúng dòng lỗi (trước đây cần cả tài liệu không có bảng). Log lỗi giữ dòng `<argument>`.
- [x] T7 "10%" thiếu \ → escape trong sanitizeTexContent (trước đây nuốt mất phần sau của dòng).
- [x] T8 .tex sinh mới mỗi lần tải; khung 2025: đầu đề (thời gian, họ tên, SBD, mã đề), PHẦN I/II/III + điểm,
      đánh số lại theo phần, lề A4.
- [x] T9 Nút "Xuất .tex" ở ngân hàng ra file Word → `POST /bank/questions/export-tex` (file .tex thật).
- [x] T10 `POST /exams/:id/check-latex` + nút "Kiểm tra LaTeX" + bảng báo câu lỗi trên trang đề.

## Đợt 2 — Word mới (commit 9b4c900)
- [x] W1 Bỏ phụ thuộc docx/temml/mathml2omml/adm-zip (không có trong package.json/lockfile → lỗi trên VPS).
- [x] W2 Công thức chèn vào trong w:t (pandoc đọc lại: mất công thức; XSD: lỗi) → OMML đúng vị trí.
- [x] W3 `common/word/omml.ts` LaTeX→OMML tự viết. Kiểm: 34 công thức thường + 17 ca khó/hỏng, pandoc đọc ngược
      đúng; hệ \heva/\hoac/cases/array{l} căn theo &; công thức hỏng không làm hỏng file.
- [x] W4 `blocks.ts`: \immini→bảng 2 cột, tabular→bảng (multicolumn), enumerate/itemize, TikZ→ảnh (tự biên dịch),
      ảnh upload (webp→png), \textbf/\textit, % chú thích, \heva viết ngoài $.
- [x] W5 `exam-docx.ts` bố cục 2025: đầu đề 2 cột, phương án A–D tự xếp 4/2/1 cột, đáp án tô đỏ, lời giải,
      bảng đáp án, HẾT. Kiểm XSD: 7 file (đề, đáp án, áp lực 228 công thức, 3 đường service) đều PASSED.
- [x] W6 Xuất Word từ ma trận giữ thứ tự ô + phần + điểm; ngân hàng gom theo loại câu; giữ thứ tự chọn.
- [x] W7 safeFilename giữ chữ "Đ".

## Trộn đề (commit 6fbcc84)
- [x] V1 `POST /exams/:id/variants` → zip: đề từng mã (Word/PDF/.tex), đáp án Word từng mã, bang-dap-an.xlsx
      (bảng đáp án + đối chiếu đề gốc). Trộn theo hạt giống cố định; giữ nguyên câu "Cả A và B"/"Tất cả…".
      Kiểm: 3 mã × 3 định dạng, 33/33 đáp án khớp sau khi đảo, XSD đạt.
- [x] V2 Nút "Trộn đề" + hộp tuỳ chọn trên trang chi tiết đề.

## Chưa làm / rủi ro còn lại
- [ ] Chưa build/chạy trên VPS, chưa mở file Word bằng Microsoft Word thật (đã qua XSD + pandoc).
- [ ] "Nhập Word" (docx-import.helper) cũng dùng thư viện chưa khai báo (cfb, @xmldom/xmldom, omml2mathml, mathml2latex).
- [ ] ValidationPipe whitelist làm rơi các trường không khai báo trong CreateExamDto (maxAttempts, practiceMode…).
- [ ] Câu Đúng/Sai cả 4 ý Sai: .tex không có \True nào → nhập ngược bị đánh dấu "thiếu đáp án".
