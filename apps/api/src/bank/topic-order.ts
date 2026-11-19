// Sắp xếp & so khớp tên mục lục ngân hàng câu hỏi.
// "CHƯƠNG IX" phải đứng sau "CHƯƠNG II"; "Bài 10" sau "Bài 9"; mục lẻ (không có nhãn) xuống cuối.

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

export function romanToInt(s: string): number {
  let n = 0;
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const v = ROMAN[up[i]] || 0;
    const next = ROMAN[up[i + 1]] || 0;
    n += v < next ? -v : v;
  }
  return n;
}

// Bỏ dấu tiếng Việt để so khớp (đ → d)
export function foldVi(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

const LABEL_RE = /^\s*(chuong|bai|dang|chu de|phan)\s*([ivxlc]+|\d+)\b\s*[.:)\-–—]?\s*/i;
const KIND_RANK: Record<string, number> = { chuong: 0, phan: 0, 'chu de': 1, bai: 1, dang: 2 };

export function parseLabel(name: string): { kind: string | null; num: number; rest: string } {
  const f = foldVi(name);
  const m = f.match(LABEL_RE);
  if (!m) return { kind: null, num: 0, rest: f };
  const kind = m[1].toLowerCase();
  const raw = m[2];
  const num = /^\d+$/.test(raw) ? Number(raw) : romanToInt(raw);
  return { kind, num, rest: f.slice(m[0].length) };
}

// So sánh 2 mục cùng cấp
export function compareTopics(a: { name: string; order?: number }, b: { name: string; order?: number }) {
  const la = parseLabel(a.name);
  const lb = parseLabel(b.name);
  const ra = la.kind ? KIND_RANK[la.kind] ?? 3 : 9;
  const rb = lb.kind ? KIND_RANK[lb.kind] ?? 3 : 9;
  if (ra !== rb) return ra - rb;
  if (la.num !== lb.num) return la.num - lb.num;
  const oa = a.order ?? 0;
  const ob = b.order ?? 0;
  if (oa !== ob) return oa - ob;
  return String(a.name).localeCompare(String(b.name), 'vi', { numeric: true, sensitivity: 'base' });
}

// Khoá so khớp "lõi" của tên: bỏ nhãn (Dạng 2./Bài 3:...), bỏ dấu, dấu câu, khoảng trắng thừa
export function coreKey(name: string): string {
  return parseLabel(name)
    .rest.toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Khoá đầy đủ: nhãn + số + lõi ("dang 2 phuong sai do lech chuan")
export function fullKey(name: string): string {
  const l = parseLabel(name);
  return `${l.kind ?? ''} ${l.num || ''} ${coreKey(name)}`.replace(/\s+/g, ' ').trim();
}

export function isChapterName(name: string): boolean {
  const k = parseLabel(name).kind;
  return k === 'chuong' || k === 'phan';
}

// Độ giống nhau theo từ (Jaccard) — dùng gợi ý chương cho mục lẻ
export function tokenScore(a: string, b: string): number {
  const stop = new Set(['va', 'cua', 'cac', 'mot', 'so', 'ham', 'bai', 'dang', 'chuong', 'toan', 'ung', 'dung']);
  const ta = new Set(coreKey(a).split(' ').filter((w) => w.length > 1 && !stop.has(w)));
  const tb = new Set(coreKey(b).split(' ').filter((w) => w.length > 1 && !stop.has(w)));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((w) => tb.has(w) && inter++);
  return inter / (ta.size + tb.size - inter);
}
