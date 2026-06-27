/**
 * Type-safe API client dùng fetch với base URL từ env
 */
import { ApiResponse, ApiError } from '@cafe-music/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

class ApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.accessToken = token;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      ...init?.headers,
    };

    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });

    if (!res.ok) {
      const err = (await res.json()) as ApiError;
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    return res.json() as Promise<T>;
  }

  get<T>(path: string) {
    return this.request<ApiResponse<T>>(path, { method: 'GET' });
  }

  post<T>(path: string, body: unknown) {
    return this.request<ApiResponse<T>>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown) {
    return this.request<ApiResponse<T>>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  delete<T>(path: string) {
    return this.request<ApiResponse<T>>(path, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient(API_BASE);
