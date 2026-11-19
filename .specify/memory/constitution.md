# LumiMath Constitution

<!-- Spec-kit constitution. Mọi spec/plan/task của LumiMath phải tuân theo tài liệu này. -->

## Core Principles

### I. Tiếng Việt là ngôn ngữ sản phẩm (NON-NEGOTIABLE)

Mọi văn bản người dùng thấy — nhãn, nút, thông báo lỗi, empty state, email — MUST viết bằng
tiếng Việt tự nhiên, đúng thuật ngữ toán học phổ thông. Không trộn tiếng Anh vào UI.
Mã nguồn, tên biến, commit message có thể dùng tiếng Anh.

### II. Bản sắc thị giác là bất biến

Bảng màu "Mực & Giấy" (đỏ đô · kem · hổ phách), bộ font (Lora / Be Vietnam Pro / Inter /
JetBrains Mono) và hệ token trong `DESIGN.md` là **hợp đồng**. Mọi thay đổi UI MUST dùng token,
MUST NOT hard-code mã màu trong JSX, MUST NOT đổi tông màu tổng thể khi chưa có phê duyệt.

### III. Chuyển động có lý do (NON-NEGOTIABLE)

Chỉ animate `transform` và `opacity`. UI animation < 300ms với easing `--ease-out`.
Không animate hành động lặp hàng trăm lần/ngày. Không animate từ `scale(0)`.
`@media (prefers-reduced-motion: reduce)` MUST tắt chuyển động toàn cục.
Chi tiết: `.specify/templates` + `DESIGN.md` mục 5.

### IV. Nội dung toán học không được vỡ

LaTeX là dữ liệu nghiệp vụ, không phải trang trí. Mọi thay đổi UI MUST kiểm tra lại:
KaTeX render đúng, `\immini`/tikz/tabular vẫn hiển thị, `ex_test` được tiền xử lý,
công thức dài không tràn ngang. Không được "tối ưu" làm mất hoặc sai công thức.

### V. Deploy được trên VPS nhỏ (2 vCPU / 2GB)

Mọi thay đổi MUST build được (`nest build`, `next build`) trong giới hạn RAM hiện tại.
Không thêm dependency nặng (UI framework, three.js, GSAP…) nếu chưa chứng minh cần thiết.
Client bundle MUST không tăng > 15% mỗi feature.

### VI. Di động trước

Học sinh dùng điện thoại là chính. Mọi màn hình MUST dùng được ở 360px, không cuộn ngang,
vùng chạm ≥ 44px, input không gây iOS zoom, tôn trọng safe-area.

## Constraints bổ sung

### Stack & môi trường

- Monorepo: `apps/web` (Next.js 14 App Router), `apps/api` (NestJS 10), `packages/db` (Prisma + PostgreSQL).
- VPS 103.245.237.220, Cloudflare Tunnel, pm2. Không build API và web đồng thời.
- Node scripts phải đặt trong `apps/api/` để resolve `@prisma/client`.

### Accessibility

- Tương phản chữ thường ≥ 4.5:1; chữ lớn ≥ 3:1.
- 100% phần tử tương tác có `:focus-visible` và `:active`.
- Không dùng emoji làm hệ icon ở menu/nút chính (dùng `components/Icons.tsx`).

## Development Workflow

1. **Constitution check** trước khi lập plan — mọi mục ở trên phải PASS hoặc có lý do ghi ở
   `Complexity Tracking`.
2. **Spec → Plan → Tasks → Implement** theo spec-kit; không viết code trước khi có `tasks.md`.
3. Mỗi task MUST có đường dẫn file cụ thể; task song song được đánh `[P]`.
4. Trước khi báo hoàn thành: build pass + deploy + smoke 200 + kiểm tra màn hình liên quan.
5. Không sửa dữ liệu production khi chưa có kiểm chứng và phương án khôi phục.

## Governance

- Constitution này **thắng** mọi thói quen/thực hành khác khi có xung đột.
- Sửa đổi Constitution phải nêu lý do, ghi ngày và tăng version.
- Mọi plan/task review phải đối chiếu 6 nguyên tắc trên.

**Version**: 1.0.0 | **Ratified**: 2026-11-11 | **Last Amended**: 2026-11-11
