import { Request } from 'express';

/**
 * Header do edge của Railway (Envoy) đặt, mang địa chỉ external thật của client.
 * Khác X-Forwarded-For ở chỗ client không ghi đè được: Envoy tự tính rồi set.
 */
const EDGE_CLIENT_IP_HEADER = 'x-envoy-external-address';

const firstValue = (value: string | string[] | undefined): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  // Header dạng danh sách ("a, b") thì entry đầu là client ngoài cùng.
  const first = raw?.split(',')[0]?.trim();
  return first ? first : null;
};

/**
 * Định danh client cho rate limit.
 *
 * Vì sao không dùng `req.ip` mặc định của `ThrottlerGuard`: `main.ts` set
 * `trust proxy: 1`, nên Express suy `req.ip` từ X-Forwarded-For bằng cách trừ
 * **đúng một** hop. Chuỗi proxy của Railway không cố định độ dài, nên cùng một
 * client lại ra hai giá trị `req.ip` khác nhau → hai key throttle → counter
 * reset giữa chừng và brute-force login lọt qua. Đo thật trên staging trước khi
 * sửa: X-RateLimit-Remaining chạy 4,3,2,1 rồi nhảy lại 4 và không bao giờ 429.
 *
 * Cố tình KHÔNG đọc entry trái nhất của X-Forwarded-For làm fallback: header đó
 * client gửi lên được, xoay giá trị là thoát rate limit — tệ hơn cả bug đang sửa.
 */
export function clientIpTracker(req: Request): string {
  return (
    firstValue(req.headers?.[EDGE_CLIENT_IP_HEADER]) ?? req.ip ?? 'unknown'
  );
}
