export interface ThemeDef {
  id: string;
  name: string;
  desc: string;
  paper: string;
  ink: string;
  accent: string;
  rule: string;
}

export const THEMES: ThemeDef[] = [
  {
    id: 'paper',
    name: 'Mực & Giấy',
    desc: 'Giấy ấm, mực đỏ son — phong cách biên tập',
    paper: 'oklch(97.5% 0.012 85)',
    ink: 'oklch(22% 0.012 60)',
    accent: 'oklch(52% 0.17 35)',
    rule: 'oklch(86% 0.012 85)',
  },
  {
    id: 'cobalt',
    name: 'Cobalt',
    desc: 'Xanh dương kỹ thuật, trung tính lạnh',
    paper: 'oklch(97% 0.008 255)',
    ink: 'oklch(20% 0.015 260)',
    accent: 'oklch(50% 0.16 262)',
    rule: 'oklch(86% 0.01 255)',
  },
  {
    id: 'evergreen',
    name: 'Evergreen',
    desc: 'Xanh lá sẫm — thư viện, điềm tĩnh',
    paper: 'oklch(97% 0.01 155)',
    ink: 'oklch(22% 0.012 150)',
    accent: 'oklch(48% 0.13 155)',
    rule: 'oklch(86% 0.01 155)',
  },
  {
    id: 'nocturne',
    name: 'Nocturne',
    desc: 'Nền tối, điểm nhấn hổ phách',
    paper: 'oklch(16% 0.01 60)',
    ink: 'oklch(94% 0.006 85)',
    accent: 'oklch(72% 0.14 75)',
    rule: 'oklch(30% 0.01 60)',
  },
];

export function getTheme(): string {
  if (typeof window === 'undefined') return 'paper';
  try {
    return localStorage.getItem('lumimath-theme') || 'paper';
  } catch {
    return 'paper';
  }
}

export function setTheme(id: string) {
  try {
    localStorage.setItem('lumimath-theme', id);
  } catch {}
  document.documentElement.setAttribute('data-theme', id);
}
