# LumiMath — Hệ thiết kế (Design System)

> Tài liệu này chốt "thế giới thị giác" của LumiMath để mọi thay đổi UI sau này bám theo.
> Nguồn nguyên tắc: `impeccable` (craft floor), `skills-main` của Emil Kowalski (motion), `taste-skill` (trang giới thiệu).

## 1. Bản sắc

**"Mực & Giấy"** — editorial Việt Nam: nền giấy kem ấm, chữ mực nâu đen, một màu nhấn đỏ đô,
điểm xuyết hổ phách cho hành động chính. Không gradient chữ, không glass trang trí, không card lồng card.

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--color-paper` | `oklch(97.5% 0.012 85)` | nền trang |
| `--color-paper-2` | `oklch(94% 0.014 85)` | nền khối phụ |
| `--color-rule` | `oklch(86% 0.012 85)` | đường kẻ 1px |
| `--color-ink` | `oklch(22% 0.012 60)` | chữ chính |
| `--color-muted` | `oklch(42% 0.01 75)` | chữ phụ (≥ 4.5:1 trên paper) |
| `--color-accent` | `oklch(52% 0.17 35)` | đỏ đô — hành động, tiêu đề |
| `--color-warning` | `oklch(62% 0.14 75)` | hổ phách — CTA chính |
| `--color-success` | `oklch(50% 0.13 150)` | đạt |
| `--color-danger` | `oklch(50% 0.17 25)` | lỗi |

Từ 19/11/2026 có **5 bảng màu** người dùng tự chọn trong Cài đặt: `paper` (A), `chalk` (B, tối), `garden` (F), `blueprint` (D), `notebook` (C). Bảng token đầy đủ: `specs/014-ui-themes-settings/spec.md` và đầu `apps/web/app/globals.css`. **Không** hard-code mã màu trong JSX — luôn dùng `var(--color-…)`.

## 2. Kiểu chữ

| Vai trò | Font | Cỡ | Ghi chú |
|---|---|---|---|
| Display | `Lora` (serif) | 20–34px | `letter-spacing: -0.02em`, `text-wrap: balance` |
| Body | `Be Vietnam Pro` | 13.5–15px | đoạn dài ≤ 70ch |
| UI | `Inter` | 12–14px | nhãn, meta |
| Mono | `JetBrains Mono` | 11–13px | mã câu, mã bài, số liệu |

**Số liệu:** toàn app dùng `font-variant-numeric: tabular-nums` (điểm, XP, đếm ngược, STT) —
số không được nhảy khi giá trị đổi.

## 3. Khoảng cách & bán kính

Thang 4px: `4 · 8 · 12 · 16 · 24 · 32 · 48`.
Quy tắc: khoảng **trên** heading > khoảng **dưới** heading.
Bán kính: `6` (ô nhỏ) · `10` (input/nút) · `14` (card) · `18` (banner) · `999` (badge/pill).

## 4. Độ sâu

Chỉ dùng shadow có **offset + blur mềm**:

```css
--shadow-1: 0 1px 2px rgba(43,26,20,.06), 0 1px 1px rgba(43,26,20,.04);
--shadow-2: 0 2px 6px rgba(43,26,20,.08), 0 1px 2px rgba(43,26,20,.05);
--shadow-3: 0 10px 30px rgba(43,26,20,.14), 0 2px 8px rgba(43,26,20,.06);
--shadow-4: 0 24px 60px rgba(43,26,20,.22), 0 4px 12px rgba(43,26,20,.08);
```

❌ Không dùng halo màu offset 0, không `box-shadow: 4px 4px 0`.

## 5. Chuyển động

```css
--ease-out: cubic-bezier(.23,1,.32,1);   /* mặc định cho UI */
--ease-in-out: cubic-bezier(.77,0,.175,1); /* di chuyển/biến đổi trên màn hình */
--ease-drawer: cubic-bezier(.32,.72,0,1);  /* drawer/sheet */
--dur-press: 120ms; --dur-pop: 180ms; --dur-modal: 240ms;
```

**Quy tắc bắt buộc**
1. Chỉ animate `transform` và `opacity`.
2. **Không bao giờ** dùng `ease-in` cho UI.
3. UI animation < 300ms.
4. Không animate hành động lặp hàng trăm lần/ngày (menu, phím tắt, chuyển tab).
5. Không animate từ `scale(0)` — bắt đầu `0.97–0.985` + opacity.
6. Mọi thứ bấm được: `:active { transform: scale(.97) }`.
7. Popover mở từ vị trí phần tử kích hoạt; modal giữ tâm.
8. Tôn trọng `@media (prefers-reduced-motion: reduce)`.

## 6. Trạng thái bắt buộc cho mọi thành phần

`hover` · `active` · `focus-visible` · `disabled` · `loading` · `error` · `empty`.

- Focus ring: `outline: 2px solid var(--color-focus); outline-offset: 2px`.
- Hover nâng khối chỉ trong `@media (hover: hover) and (pointer: fine)`.
- Loading: dùng `.skeleton` (shimmer 1.2s) thay chữ "Đang tải…".

## 7. Browser surfaces (phải theme)

`::selection` · `caret-color` · `scrollbar` · `text-underline-offset` · `tabular-nums`.

## 8. Mobile-native

- `min-height: 100dvh` (không dùng `100vh`).
- `-webkit-tap-highlight-color: transparent` + `touch-action: manipulation`.
- Input/select/textarea `font-size: 16px` trên ≤640px (chống iOS tự zoom).
- Vùng chạm ≥ 44px.
- `env(safe-area-inset-bottom)` cho thanh dính đáy (`.lm-sticky-actions`).

## 9. Không được làm (slop list)

- ❌ Kicker/eyebrow nhỏ phía trên heading.
- ❌ Lưới card "icon + tiêu đề + mô tả" cùng cỡ làm cấu trúc trang.
- ❌ Card lồng card.
- ❌ Gradient chữ, glass/blur trang trí.
- ❌ `border-left` màu > 1px trên card/callout.
- ❌ Emoji thay cho hệ icon ở menu/nút chính (dùng `components/Icons.tsx`).
- ❌ Hard-code mã màu trong JSX — luôn dùng token.

## 10. Icon

Bộ icon vẽ sẵn: `apps/web/components/Icons.tsx` (stroke đồng nhất).
Menu, nút điều hướng chính, trạng thái → **icon vector**. Emoji chỉ dùng cho nội dung
mang tính biểu cảm (streak 🔥, huy hiệu) và trong nội dung đề bài giáo viên gõ.
