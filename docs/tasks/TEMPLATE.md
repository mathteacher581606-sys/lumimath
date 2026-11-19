# TEMPLATE — File giao việc cho Claude Code

> Copy file này thành `docs/tasks/<số>-<tên-ngắn>.md` rồi điền.
> Thầy chỉ cần mở repo này trong Claude Code và nói: **"làm task trong docs/tasks/<tên>.md"**.

## Mục tiêu (1–3 câu)

<mô tả kết quả mong muốn, không mô tả cách làm>

## Bối cảnh

- Spec liên quan: `specs/00x-.../spec.md`
- Hành vi hiện tại: <đang thế nào>
- Vấn đề: <vì sao cần sửa>

## Phạm vi file được sửa (BẮT BUỘC giữ đúng)

```
apps/.../file-a.ts
apps/.../file-b.tsx
```

Ngoài danh sách này: **không sửa**. Nếu buộc phải sửa, ghi rõ lý do trước khi làm.

## Tiêu chí nghiệm thu

1. <điều kiện 1>
2. <điều kiện 2>
3. Build pass: `pnpm --filter @lumimath/web build` và/hoặc `cd apps/api && pnpm run build`

## Ràng buộc

- UI tiếng Việt, dùng token trong `DESIGN.md`.
- Không thêm dependency mới.
- Không phá nội dung LaTeX/KaTeX.
- Tuân `.specify/memory/constitution.md`.

## Định dạng trả lời

Nếu cần trả về mã nguồn, dùng đúng khối:

```
<<<FILE: đường/dẫn/tính/từ/gốc/repo>>>
...toàn bộ nội dung file sau khi sửa...
<<<END FILE>>>
```

Giải thích ngắn gọn nằm ngoài khối.
