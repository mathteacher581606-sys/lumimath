# 017 — Biên dịch & hiển thị LaTeX: bộ gói dùng chung + định dạng nạp sẵn

Nguồn: rà soát 20–21/11/2026 (bộ thử 81 công thức + 49 đoạn văn mẫu đề VN, chạy TeX Live thật).

## Nguyên nhân "code chưa chạy" dù TeX Live đã chạy
1. 6 khung preamble khác nhau trong API, mỗi khung nạp ít gói (thiếu esvect, siunitx, systeme, xfrac…) → 12/20 công thức dự phòng lỗi.
2. Lệnh văn bản ngoài `$…$` (\emph, \textcolor, {\bf}, \hfill, \vspace, \fbox, \choiceTF…) web không xử lý → 22/43 đoạn hiện mã thô.
3. \newcommand/\def của câu chỉ gắn cho TikZ, không gắn cho công thức.
4. Lỗi TeX Live bị giấu (hiện lại mã, không nói lý do).
5. Kho đề in lời giải dạng text thô (cắt 120 ký tự).

## Tasks
- [x] T1 Kho đề: lời giải qua LatexRenderer, nút Xem lời giải / Hiện tất cả — `apps/web/app/teacher/exams/[id]/page.tsx`
- [x] T2 (A) `apps/latex-service/texmf/tex/latex/lumimath/lumimath.sty` — ~35 gói, ex_test nạp đầu, gói thiếu tự bỏ qua, macro VN dự phòng
- [x] T3 (B) `apps/latex-service/fmt/lmfmt.tex` + Dockerfile dựng `lmfmt.fmt` (mylatexformat); `server.js` tự dùng định dạng khi tài liệu mở đầu `\documentclass[..]{standalone}` + `\usepackage{lumimath}`, lỗi thì biên dịch thường; `/health` trả `format`
- [x] T4 `apps/api/src/common/tex-preamble.ts`; `exams.service.ts`: công thức/đoạn/TikZ/PDF đề/PDF đáp án dùng chung lumimath; container cũ (thiếu lumimath.sty) → tự quay về khung cũ; \newcommand của GV được ưu tiên (neutralizeRedefs); dòng gợi ý lỗi ("Lệnh chưa được định nghĩa: \vv")
- [x] T5 (C) `LatexRenderer.tsx`: macro KaTeX (\vv \abs \dint \sfrac \overparen \SI…), ~60 lệnh văn bản, ký hiệu toán thiếu `$`, \choiceTF, ẩn \shortans, \def/\newcommand gắn vào công thức, đoạn còn lệnh lạ → TeX Live cả đoạn
- [x] T6 (D) Lỗi biên dịch: giáo viên (/teacher/*) thấy "Không biên dịch được: …", học sinh chỉ thấy mã

## Số liệu kiểm chứng (máy thử, TeX Live 2023, không có vntex/esvect/systeme/ulem/soul)
- Đoạn văn mẫu: còn mã thô 22/43 → 0/49 (6 mẫu thêm)
- Công thức: KaTeX vẽ được 63/81 → 71/81; phần còn lại qua TeX Live 8/10 (systeme chỉ lỗi vì máy thử thiếu gói; `\tag` trong công thức nội dòng là sai cú pháp LaTeX)
- Thời gian biên dịch 1 đoạn với bộ gói đầy đủ: ~1,5 s thường → ~0,2 s với lmfmt
- Chưa kiểm trên VPS: chữ tiếng Việt (vntex), esvect, ulem, soul, build Next/Nest

## Triển khai
`docker compose build latex && docker compose up -d latex` → `curl -s localhost:8080/health` phải có `"format":"lmfmt"`; rồi build API, rồi build web (không song song).
