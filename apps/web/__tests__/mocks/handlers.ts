import { http, HttpResponse } from 'msw';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const handlers = [
  // Thêm mock handlers tại đây khi viết integration tests
  // Ví dụ:
  // http.get(`${API_BASE}/api/v1/playlists`, () => {
  //   return HttpResponse.json({ data: [], meta: { total: 0 } });
  // }),

  http.get(`${API_BASE}/api/health`, () => {
    return HttpResponse.json({ status: 'ok' });
  }),
];
