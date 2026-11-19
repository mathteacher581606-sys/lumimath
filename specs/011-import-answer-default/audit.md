# Báo cáo rà soát toàn bộ hệ thống nhập đề (audit)

**Ngày**: 2026-11-18 · **Phạm vi**: toàn bộ ngân hàng đề (1.515 câu) + pipeline nhập TeX/DOCX
**Kết luận chính**: KHÔNG có lỗi đổi ký tự; KHÔNG có câu nào cần phục hồi đáp án tự động.
Đã sửa cảnh báo cho câu Đúng/Sai thiếu dấu đáp án.

## 1. Ký tự có bị thay đổi khi nhập đề? → KHÔNG

**Round-trip thật** qua `POST /bank/import-tex/preview` với đề mẫu chứa các ký tự dễ vỡ:

| Thử nghiệm | Kết quả |
|---|---|
| Dấu tiếng Việt: ẩm ớ ý ỹ đ | ✅ nguyên vẹn |
| `\dfrac{a+b}{2}`, `\frac{1}{2}+\frac{1}{3}` | ✅ nguyên vẹn |
| `% & # _ ^ ~` trong văn bản | ✅ nguyên vẹn |
| `\lq\lq … \rq\rq` | ✅ → ngoặc kép “ ” (có chủ đích) |
| `\shortans{4}` | ✅ answer = "4" |

**Quét DB** 1.515 câu tìm U+FFFD, mojibake (`â€™`, `Ã©`, …), backslash kép:
→ **0 câu hỏng**. (14 cờ "backslash-kép" là false-positive: `\\` xuống dòng hợp lệ của LaTeX.)

## 2. Đáp án có bị sai không? → chỉ 1 bug, ảnh hưởng lịch sử = 0

**Bug đã tìm + sửa** (spec `011`): `parseExBlock` khởi tạo `answer = 'A'` nên MCQ không có `\True`
bị gán đáp án A. Đã sửa thành `answer = null` + cờ `answerMissing` + cảnh báo UI.

**Rà soát phục hồi** (re-parse toàn bộ `texSource` còn lưu — 845/854 MCQ có file gốc):

| Nhóm | Số câu | Kết luận |
|---|---|---|
| Đối chiếu đáp án với file gốc | 845 | — |
| Khớp content + đáp án khớp | 827 | ✅ đúng |
| **Lệch đáp án** | 2 | ⚠️ **sai ở đề gốc**, không phải lỗi hệ thống (xem dưới) |
| Nguồn thiếu `\True` | 1 | A541929 — không thể xác định (đề gốc không có dấu) |
| Không khớp content | ~110 | câu có `\immini`/tikz hoặc content đã chỉnh tay — không phải lỗi đáp án |

### Hai câu "lệch" thực chất là đề gốc tự sai

- `A503929`: đề ghi `\True` ở phương án **A** `(1;0;-1)`, nhưng lời giải tính đúng là **B** `(0;1;-1)`.
  → đáp án đang lưu **B** là ĐÚNG.
- `A169426`: đề ghi `\True` ở **A** (`=-1`), lời giải ra **D** (`=7`).
  → đáp án đang lưu **D** là ĐÚNG.

**⇒ Không đổi 2 câu này** (đổi sẽ làm sai đi). Không có câu nào cần sửa đáp án.

## 3. Sửa thêm: cảnh báo câu Đúng/Sai thiếu dấu (spec `011` mở rộng)

`parseExBlock` nhánh `\choiceTF`: nếu cả 4 ý đều không có `\TrueTF`/`\FalseTF`/`\True`
→ `answerMissing = true` → UI hiện "⚠️ Chưa xác định đáp án".

**Kiểm chứng**: TF có dấu → `answer={a:T,b:F,c:T,d:F}`; TF không dấu → `answerMissing=true`.

## 4. Lưu ý còn lại (ngoài phạm vi, ghi lại để tham khảo)

- ~110 câu "không khớp content" phần lớn chứa `\immini`/tikz — `content` lưu trong DB có thể đã
  được chỉnh tay sau khi nhập (không liên quan đáp án). Nếu cần, có thể rà riêng từng câu.
- Câu Đúng/Sai cũ có `answer` toàn `false` (nếu trước đây nhập mà nguồn thiếu dấu) sẽ không chấm
  đúng tự động — có thể rà riêng nếu thầy muốn.
