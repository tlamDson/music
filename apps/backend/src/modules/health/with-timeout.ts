/**
 * Driver có thể **treo** thay vì reject khi dependency chết: ioredis xếp hàng
 * command lúc mất kết nối, Prisma cũng có thể chờ rất lâu. Probe mà treo thì
 * Railway chỉ thấy timeout chứ không bao giờ nhận được câu trả lời 503 rõ ràng.
 */
export const HEALTH_CHECK_TIMEOUT_MS = 3000;

export function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
