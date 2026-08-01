import { loginIdentityTracker } from '../../src/common/throttler/client-ip.tracker';

type TrackerRequest = Parameters<typeof loginIdentityTracker>[0];

const buildRequest = (
  body: unknown,
  headers: Record<string, string | string[] | undefined> = {},
  ip = '10.0.0.1',
): TrackerRequest => ({ body, headers, ip }) as unknown as TrackerRequest;

describe('loginIdentityTracker', () => {
  /**
   * Đo trên staging cho thấy KHÔNG khoá được brute-force theo IP: cùng một
   * client mà `req.ip` xoay giữa hai giá trị (edge của Railway round-robin),
   * nên mỗi key chỉ đếm được nửa số request và không bao giờ chạm limit —
   * X-RateLimit-Remaining chạy 4,4,3,3,2,2 thay vì 4,3,2,1,0.
   *
   * Khoá theo email thì bao nhiêu hop proxy cũng không ảnh hưởng: cùng một tài
   * khoản bị dò là cùng một counter.
   */
  it('keys by the account being attacked, not the network path', () => {
    const first = loginIdentityTracker(
      buildRequest({ email: 'admin@cafe.vn' }, {}, '10.0.0.1'),
    );
    const second = loginIdentityTracker(
      buildRequest({ email: 'admin@cafe.vn' }, {}, '10.0.0.2'),
    );

    expect(first).toBe(second);
  });

  it('separates different accounts so one victim cannot lock out another', () => {
    const a = loginIdentityTracker(buildRequest({ email: 'a@cafe.vn' }));
    const b = loginIdentityTracker(buildRequest({ email: 'b@cafe.vn' }));

    expect(a).not.toBe(b);
  });

  it('normalizes case and padding so they cannot be used to reset the counter', () => {
    const plain = loginIdentityTracker(
      buildRequest({ email: 'admin@cafe.vn' }),
    );
    const shouted = loginIdentityTracker(
      buildRequest({ email: '  ADMIN@Cafe.VN  ' }),
    );

    expect(shouted).toBe(plain);
  });

  /**
   * Guard chạy TRƯỚC ZodValidationPipe nên body có thể chưa hợp lệ — không được
   * ném lỗi ở đây, mà rơi về định danh theo IP.
   */
  it('falls back to the ip when the body carries no usable email', () => {
    const missing = loginIdentityTracker(buildRequest({}, {}, '10.0.0.7'));
    const wrongType = loginIdentityTracker(
      buildRequest({ email: { nested: true } }, {}, '10.0.0.7'),
    );
    const noBody = loginIdentityTracker(
      buildRequest(undefined, {}, '10.0.0.7'),
    );

    expect(missing).toContain('10.0.0.7');
    expect(wrongType).toContain('10.0.0.7');
    expect(noBody).toContain('10.0.0.7');
  });

  it('keeps email and ip identities in separate namespaces', () => {
    const byEmail = loginIdentityTracker(buildRequest({ email: 'a@cafe.vn' }));
    const byIp = loginIdentityTracker(buildRequest({}, {}, 'a@cafe.vn'));

    expect(byEmail).not.toBe(byIp);
  });
});
