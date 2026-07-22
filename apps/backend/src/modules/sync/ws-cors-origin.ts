/**
 * Decorator @WebSocketGateway được đánh giá lúc load module nên không dùng được
 * ConfigService — đọc thẳng env qua hàm này để vẫn test được.
 *
 * Production: chỉ cho đúng origin của web. Dev: mở để tiện chạy local.
 */
export function resolveWsCorsOrigin(
  env: Record<string, string | undefined>,
): string[] | true {
  if (env.NODE_ENV === 'production') {
    return [env.WEB_URL || 'http://localhost:3000'];
  }
  return true;
}
