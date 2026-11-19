export interface ThemeDef {
  id: string;
  letter: string;
  name: string;
  desc: string;
  /** Màu xem trước cho thẻ chọn theme (khớp token trong globals.css) */
  paper: string;
  surface: string;
  ink: string;
  accent: string;
  rule: string;
}

// Thứ tự hiển thị trong Cài đặt → Giao diện
export const THEMES: ThemeDef[] = [
  {
    id: 'paper',
    letter: 'A',
    name: 'Mực & Giấy',
    desc: 'Giấy kem, mực nâu, đỏ đô',
    paper: '#f8f4ec',
    surface: '#fffdf8',
    ink: '#2b2420',
    accent: '#8e2a1c',
    rule: '#e2d9c9',
  },
  {
    id: 'chalk',
    letter: 'B',
    name: 'Bảng đen',
    desc: 'Nền tối, chữ phấn, đỡ mỏi mắt',
    paper: '#161e1b',
    surface: '#1e2925',
    ink: '#ecede6',
    accent: '#e8c766',
    rule: '#2f3d37',
  },
  {
    id: 'garden',
    letter: 'F',
    name: 'Khu vườn',
    desc: 'Xanh lá dịu, nhẹ nhàng',
    paper: '#f2f5ef',
    surface: '#ffffff',
    ink: '#22302a',
    accent: '#2f6a4c',
    rule: '#dce6d8',
  },
  {
    id: 'blueprint',
    letter: 'D',
    name: 'Bản vẽ',
    desc: 'Trắng xanh, gọn gàng, chính xác',
    paper: '#f7f9fc',
    surface: '#ffffff',
    ink: '#1a2338',
    accent: '#2d5be3',
    rule: '#dce2ec',
  },
  {
    id: 'notebook',
    letter: 'C',
    name: 'Vở ô li',
    desc: 'Vở kẻ ô, xanh mực, vui tươi',
    paper: '#fbfcff',
    surface: '#ffffff',
    ink: '#1b2440',
    accent: '#2147c4',
    rule: '#1b2440',
  },
];

export const DEFAULT_THEME = 'paper';

// Id cũ trước bản nâng cấp giao diện → id mới
const LEGACY: Record<string, string> = {
  cobalt: 'blueprint',
  evergreen: 'garden',
  nocturne: 'chalk',
  maroon: 'paper',
};

export function normalizeTheme(id: string | null | undefined): string {
  if (!id) return DEFAULT_THEME;
  const mapped = LEGACY[id] || id;
  return THEMES.some((t) => t.id === mapped) ? mapped : DEFAULT_THEME;
}

export function getTheme(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    return normalizeTheme(localStorage.getItem('lumimath-theme'));
  } catch {
    return DEFAULT_THEME;
  }
}

export function setTheme(id: string) {
  const t = normalizeTheme(id);
  try {
    localStorage.setItem('lumimath-theme', t);
  } catch {}
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  const def = THEMES.find((x) => x.id === t);
  if (meta && def) meta.setAttribute('content', def.paper);
}
