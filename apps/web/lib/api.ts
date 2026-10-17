// Đường dẫn tương đối → đi qua proxy của Next.js (next.config.js rewrites)
// nên hoạt động với mọi người dùng dù truy cập từ đâu (LAN, internet, tunnel).
// Có thể override bằng NEXT_PUBLIC_API_URL nếu API ở domain riêng.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL && process.env.NEXT_PUBLIC_API_URL !== 'http://localhost:4000'
    ? process.env.NEXT_PUBLIC_API_URL
    : '/api';

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // Token hết hạn → tự động đăng xuất và về trang đăng nhập
  if (res.status === 401 && typeof window !== 'undefined') {
    logout();
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Lỗi không xác định' }));
    throw new Error(err.message || 'Lỗi');
  }

  return res.json();
}

export function saveAuth(token: string, user: any) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('token') : null;
}

export function getUser() {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem('user');
  try {
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
