# CLAUDE.md — Hướng dẫn cho Claude Code khi làm việc trên LumiMath

> File này được Claude Code tự đọc mỗi phiên. Đọc hết trước khi sửa bất kỳ file nào.

## 1. Dự án là gì

**LumiMath** — web dạy & quản lý toán phổ thông (tiếng Việt) cho giáo viên và học sinh:
ngân hàng đề (LaTeX), soạn đề/ma trận, giao bài, thi online, chấm bài (AI + tay), bảng điểm, gamification.

- Chạy thật tại: https://app.toanthayminhtri.io.vn (Cloudflare Tunnel → VPS)
- Mã nguồn: `C:\Users\Admin\lumimath` (monorepo pnpm)

## 2. Kiến trúc

```
apps/web     Next.js 14 (App Router) · React 18 · TypeScript · CSS thuần (app/globals.css)
apps/api     NestJS 10 · Prisma 5 · PostgreSQL · LaTeX service riêng (TeX Live, cổng :8080)
packages/db  Prisma schema + client
.specify/    Quy trình spec-kit (constitution, templates, scripts)
specs/       Đặc tả từng tính năng (spec.md · plan.md · tasks.md)
DESIGN.md    Hệ thiết kế (palette "Mực & Giấy", motion tokens, slop list)
```

## 3. Lệnh thường dùng

```bash
# Web
pnpm --filter @lumimath/web build        # build Next.js
pnpm --filter @lumimath/web dev          # dev server

# API
cd apps/api && NODE_OPTIONS="--max-old-space-size=1000" pnpm run build
cd apps/api && pnpm run start:dev

# Prisma — CLI nằm ở packages/db (apps/api KHÔNG có prisma CLI trên VPS)
# Chạy TRƯỚC khi build API mỗi khi schema.prisma đổi (thiếu bước này → build báo lỗi "không tồn tại" cột mới)
cd packages/db && pnpm exec prisma db push      # nếu hỏi xác nhận mất dữ liệu → DỪNG, hỏi chủ dự án
cd packages/db && pnpm exec prisma generate
```

⚠️ **KHÔNG build API và web cùng lúc** — VPS chỉ có 2 vCPU / 2GB RAM (có swap), chạy song song sẽ OOM.

## 4. Triển khai

```
VPS      root@103.245.237.220  (thư mục /opt/lumimath)
SSH key  C:\Users\Admin\.ssh\id_ed25519
pm2      lumimath-api  ·  lumimath-web
```

Quy trình: `scp` file đã sửa lên đúng đường dẫn → build → `pm2 restart` → smoke test.

**Dịch vụ LaTeX (Docker `lumimath-latex`)**: sửa bất kỳ file nào trong `apps/latex-service/` (server.js, Dockerfile,
`texmf/…/lumimath.sty`, `fmt/`) thì phải dựng lại container:
`docker compose build latex && docker compose up -d latex`, kiểm tra `curl -s localhost:8080/health` có `"format":"lmfmt"`.
Bộ gói dùng chung cho mọi lần biên dịch là `lumimath.sty` (xem `specs/017-latex-pipeline`); thêm gói thì thêm vào đó,
KHÔNG thêm `\usepackage` rải rác trong API. File .tex cho người dùng tải về không dùng lumimath.

```bash
curl -s -o /dev/null -w "%{http_code}" https://app.toanthayminhtri.io.vn/teacher   # mong đợi 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api/auth/me           # 401 = API sống (chưa token)
```

## 5. Quy ước bắt buộc

### Ngôn ngữ & giao diện
- **Toàn bộ UI tiếng Việt** — nhãn, thông báo lỗi, empty state. Không trộn tiếng Anh.
- Dùng token trong `DESIGN.md` / `specs/014-ui-themes-settings` (`--color-surface`, `--color-accent`, `--color-ink`…), **không hard-code mã màu mới** — web có 5 bảng màu, kể cả 1 bảng màu tối.
- Chỉ animate `transform`/`opacity`, thời lượng < 300ms, easing `--ease-out`; tôn trọng
  `prefers-reduced-motion`.

### Nội dung toán học (dễ vỡ nhất)
- Mọi nội dung đề/câu hỏi đi qua `apps/web/components/LatexRenderer.tsx`
  (markdown + KaTeX + tách `tikz`/`immini`/môi trường văn bản → TeX Live ra PNG).
- Gói `ex_test` (`\begin{ex}`, `\choice`, `\loigiai`, `\dapso`, `\True/\False`) được tiền xử lý
  ở cả client lẫn server — **không** thêm xử lý trùng lặp.
- Khi xuất PDF, `apps/api/src/common/tex-autofix.ts` tự sửa lỗi LaTeX 3 tầng. Sửa file này thì
  phải chạy lại thử xuất PDF.
- `\immini`, `tikz`, `tabular`, `multicols` phải render được; đừng "tối ưu" làm mất công thức.

### Nén ảnh
- `apps/api/src/uploads/uploads.controller.ts` dùng `@napi-rs/canvas`:
  **quality thang 0–100** (KHÔNG phải 0–1 như canvas trình duyệt).
- `loadImage()` **đã tự áp EXIF** — không xoay thêm.

### Dependency
- **Không thêm thư viện nặng** (UI framework, three.js, GSAP, animation lib) nếu không được yêu cầu.
- Mọi thay đổi phải build được trên VPS 2GB.

## 6. Quy trình làm việc (spec-kit)

1. Đọc `specs/<feature>/spec.md` + `plan.md` + `tasks.md` liên quan.
2. Viết/sửa code theo task, bám `tasks.md` (mỗi task có đường dẫn file cụ thể).
3. Tự kiểm: build pass + smoke 200.
4. Cập nhật `tasks.md` (đánh dấu `[x]`) và ghi số liệu kiểm chứng thật.

Hiến pháp dự án: `.specify/memory/constitution.md` (6 nguyên tắc — đọc trước khi lập kế hoạch).

## 7. Trạng thái hiện tại (tính đến 15/11/2026)

Các feature đã xong (xem chi tiết trong `specs/`):

| # | Feature | Ghi chú |
|---|---|---|
| 002 | Chủ đề theo cây mục lục trong Ma trận | |
| 003 | Bốc câu đúng chủ đề (mở rộng cây con) | |
| 004 | Chọn nhiều chủ đề / dòng ma trận | |
| 005 | Tách tab Trang chủ / Khóa học của tôi | |
| 006 | Giới hạn sửa bài + khoá sau chấm + lịch sử nộp | bảng `AssignmentSubmissionHistory` |
| 007 | Nâng cấp UI/UX Giai đoạn 0+1+2 | motion tokens, skeleton, mobile |
| 008 | Polish · Harden · Hiệu năng | memo, phím tắt chấm bài, lazy-load CodeMirror (−30%) |
| 009 | Tải đáp án PDF + tự sửa LaTeX | `GET /exams/:id/attempts/:aid/answers-pdf` |
| 010 | Sửa ảnh upload bị hỏng | quality 0–100 |
| 014 | 5 bảng màu + trang chủ HS + Cài đặt 3 tab | đợt 1; `GET/PATCH /auth/profile` |

## 8. Nhận việc từ file task

Nếu được bảo "làm task trong `docs/tasks/xxx.md`":
1. Đọc file task đó (mục tiêu, phạm vi file, tiêu chí nghiệm thu).
2. **Chỉ sửa file trong phạm vi được liệt kê**; muốn sửa ngoài phạm vi thì nêu lý do trước.
3. Trả lời theo định dạng trong file task (khối `<<<FILE: …>>>` nếu được yêu cầu).

## 9. KHÔNG làm

- ❌ Không commit `deploy/.claude-key`, `deploy/staging/`, `.env`.
- ❌ Không sửa dữ liệu production (xoá bản ghi, migration phá huỷ) khi chưa được duyệt.
- ❌ Không đổi bố cục/tông màu tổng thể khi chưa được yêu cầu.
- ❌ Không chạy build API + web đồng thời.
- ❌ Không bịa API/endpoint không tồn tại — kiểm tra trong `apps/api/src/**/*.controller.ts`.
