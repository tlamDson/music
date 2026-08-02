import { resolveApiBaseUrl } from './env';

const BASE_URL = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    // 401 ngoài /auth/login nghĩa là phiên đã hết hạn hoặc tài khoản vừa bị
    // vô hiệu hoá giữa chừng — đăng xuất sạch thay vì để lỗi rải rác trên UI.
    // Không áp dụng cho /auth/login (sai mật khẩu, LoginForm tự xử lý) và
    // /me/password (sai mật khẩu HIỆN TẠI lúc đổi mật khẩu — 401 hợp lệ,
    // không phải phiên hết hạn; PasswordSection tự hiện lỗi tại chỗ. Thiếu
    // ngoại lệ này thì gõ sai mật khẩu cũ một lần là bị đá thẳng ra /login).
    if (
      res.status === 401 &&
      path !== '/auth/login' &&
      path !== '/me/password' &&
      typeof window !== 'undefined'
    ) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (data as { message?: string }).message ?? res.statusText, data);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postMultipart: <T>(path: string, formData: FormData) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new ApiError(
          res.status,
          (data as { message?: string }).message ?? res.statusText,
          data,
        );
      }
      return res.json() as Promise<T>;
    });
  },
};
