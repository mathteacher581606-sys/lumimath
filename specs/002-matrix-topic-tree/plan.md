# Implementation Plan — 002-matrix-topic-tree

**Spec**: [spec.md](./spec.md)
**Target file**: `apps/web/app/teacher/exams/matrix/page.tsx`
**Backend**: không đổi (dùng `GET /bank/topics`, `GET /bank/forms-by-filter`)
**Date**: 2026-11-08

## 1. Bối cảnh kỹ thuật hiện tại

- Trang ma trận gọi `apiFetch('/bank/topics')` ⇒ **mảng phẳng** `Topic[]`
  (`id, name, grade, parentId, order, …`), sắp xếp `[grade asc, order asc, name asc]`.
- Dropdown "Chủ đề" hiện tại (dòng ~892) lọc theo `grade` rồi render **theo thứ tự mảng phẳng**
  ⇒ các `CHƯƠNG`, `Bài`, `Dạng` (đều `order = 1`) bị xếp lẫn theo alphabet.
- Ô "Dạng bài" là `<input list="matrix-form-list">`; datalist lấy từ `apiFetch('/bank/forms')`
  ⇒ **toàn bộ** dạng của mọi lớp.
- Đã có sẵn endpoint `GET /bank/forms-by-filter?grade=<N>` trả `[{name, count}]`
  (đếm số câu có `form` đó trong lớp).
- Backend đã có `GET /bank/topics/tree?grade=<N>` (cây lồng nhau) — **không cần** dùng vì
  client đã có `parentId` và có thể dựng cây tại chỗ (tránh thêm request).

## 2. Thiết kế

### 2.1 Hàm phẳng hoá cây (client, thuần)

```ts
type TopicFlat = { id: string; name: string; grade: number|null; parentId: string|null; order: number };

function buildOrderedTopics(
  flat: TopicFlat[],
  grade?: string,
): { id: string; label: string; depth: number }[]
```

Thuật toán:
1. Nếu `grade` có giá trị ⇒ `list = flat.filter(t => String(t.grade ?? '') === grade)`,
   ngược lại `list = flat`.
2. Gom `Map<parentId|'', Topic[]>`; sắp mỗi nhóm theo `order` rồi `name` (localeCompare 'vi').
3. DFS từ `parentId = ''`, `depth = 0`; con tăng `depth + 1`.
4. Trả `{ id, label: name, depth }` theo đúng thứ tự duyệt.

Ghi chú: dữ liệu thực tế cho thấy **mọi topic đều có `grade`** (10/11/12), nên lọc theo lớp
không làm mồ côi nút cha.

### 2.2 Hiển thị thụt lề

Nhãn option = `'　'.repeat(depth) + (depth > 0 ? '└ ' : '') + name`
(id spaces U+3000 để thụt đều trong `<select>`; một số trình duyệt chuẩn hoá khoảng trắng
thường nên dùng ký tự full-width).

### 2.3 Dạng bài theo lớp (per-row datalist)

- State mới: `const [formOptionsByGrade, setFormOptionsByGrade] = useState<Record<string, {name:string;count:number}[]>>({})`.
- Hàm `ensureFormOptions(grade)`:
  - nếu `grade` rỗng ⇒ dùng `forms` (toàn bộ) như cũ;
  - nếu đã có cache ⇒ thôi;
  - ngược lại `apiFetch('/bank/forms-by-filter?grade=' + grade)` ⇒ lưu cache.
- `updateSlot` khi đổi `grade` ⇒ gọi `ensureFormOptions(newGrade)`.
- Mỗi dòng render `<input list={'matrix-form-list-' + i}>` + `<datalist id={'matrix-form-list-' + i}>`
  với danh sách `formOptionsByGrade[s.grade] || forms`.
- Giữ datalist toàn cục `matrix-form-list` cho ô "quick add" phía trên (không đổi).

### 2.4 Điểm sửa cụ thể

| Vị trí | Thay đổi |
|---|---|
| imports/helpers | thêm `buildOrderedTopics`, state `formOptionsByGrade`, `ensureFormOptions` |
| ~line 180 `useEffect` | sau khi set `topics`, không đổi; (tuỳ chọn) preload form options cho các lớp đang dùng |
| ~line 876 `onChange` grade | gọi `ensureFormOptions(e.target.value)` |
| ~line 892-898 dropdown Chủ đề | dùng `buildOrderedTopics(topics, s.grade)` + nhãn thụt lề |
| ~line 914-922 input Dạng bài | `list` riêng theo dòng + datalist riêng |
| ~line 993-997 | giữ datalist toàn cục cho quick-add |
| ~line 1408-1412 dropdown Chủ đề (quick) | dùng `buildOrderedTopics(topics, quickGrade)` |

## 3. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Topic cha có `grade` khác con ⇒ lọc theo lớp làm mất cây | Kiểm tra dữ liệu: 100% topic có grade; nếu gặp dữ liệu lạ, DFS vẫn chạy trên tập đã lọc |
| `<select>` nuốt khoảng trắng thường | dùng U+3000 + `└ ` |
| Nhiều request `forms-by-filter` | cache theo grade trong state |
| Datalist nhiều id gây nặng DOM | chỉ render datalist khi dòng có `grade`; nếu không, dùng datalist chung |

## 4. Kiểm thử

- **Unit (thủ công bằng node)**: `buildOrderedTopics` với dữ liệu giả (2 chương, 2 bài, 3 dạng)
  ⇒ đúng thứ tự DFS + depth.
- **Tích hợp**: `pnpm --filter @lumimath/web build` phải pass.
- **Smoke**: `GET /teacher/exams/matrix` trả 200 sau deploy; mở dropdown kiểm tra thứ tự.
- **Dữ liệu thật**: so sánh 10 mục đầu của dropdown lớp 10 với cây ở `/teacher/bank`.
