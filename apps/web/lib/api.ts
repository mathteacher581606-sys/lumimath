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

  // Token hết hạn → tự động đăng xuất và về trang đăng nhập.
  // LƯU Ý: KHÔNG áp dụng cho endpoint đăng nhập / đăng ký / quên mật khẩu —
  // ở đó 401 nghĩa là "sai email hoặc mật khẩu", phải hiện đúng lỗi cho người dùng.
  const isAuthEndpoint =
    /\/auth\/(login|register|otp|forgot|reset)/.test(path);
  if (res.status === 401 && typeof window !== 'undefined' && !isAuthEndpoint) {
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

// Cập nhật thông tin người dùng đang lưu ở trình duyệt (sau khi sửa hồ sơ)
export function updateStoredUser(patch: Record<string, any>) {
  if (typeof window === 'undefined') return;
  const cur = getUser() || {};
  localStorage.setItem('user', JSON.stringify({ ...cur, ...patch }));
}

// Tải 1 ảnh lên máy chủ → trả URL tương đối dạng /api/uploads/<tên-file>
export async function uploadImageFile(file: File): Promise<string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(`${API_URL}/uploads/image`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'image/png',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Không tải được ảnh' }));
    throw new Error(err.message || 'Không tải được ảnh');
  }
  const data = await res.json();
  return data.url as string;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
