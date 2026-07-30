import { clientIpTracker } from '../../src/common/throttler/client-ip.tracker';

type TrackerRequest = Parameters<typeof clientIpTracker>[0];

const buildRequest = (
  headers: Record<string, string | string[] | undefined>,
  ip = '10.0.0.1',
): TrackerRequest => ({ headers, ip }) as unknown as TrackerRequest;

describe('clientIpTracker', () => {
  /**
   * Lý do tồn tại của hàm này: `trust proxy: 1` khiến Express suy `req.ip` từ
   * X-Forwarded-For bằng cách trừ đúng một hop. Edge của Railway có lúc thêm
   * hop, có lúc không, nên `req.ip` đổi giữa các request của **cùng** một
   * client — key throttle đổi theo và counter reset (quan sát thật trên staging:
   * X-RateLimit-Remaining chạy 4,3,2,1 rồi nhảy lại 4).
   */
  it('prefers the address Envoy resolved for the external client', () => {
    const tracker = clientIpTracker(
      buildRequest({
        'x-envoy-external-address': '203.0.113.7',
        'x-forwarded-for': '198.51.100.1, 203.0.113.7, 10.1.2.3',
      }),
    );

    expect(tracker).toBe('203.0.113.7');
  });

  it('falls back to req.ip when the edge header is absent (local/dev)', () => {
    const tracker = clientIpTracker(buildRequest({}, '10.0.0.9'));

    expect(tracker).toBe('10.0.0.9');
  });

  it('ignores an empty edge header instead of tracking everyone as one client', () => {
    const tracker = clientIpTracker(
      buildRequest({ 'x-envoy-external-address': '   ' }, '10.0.0.9'),
    );

    expect(tracker).toBe('10.0.0.9');
  });

  it('takes the first entry when a header arrives repeated', () => {
    const tracker = clientIpTracker(
      buildRequest({ 'x-envoy-external-address': ['203.0.113.7', '10.1.2.3'] }),
    );

    expect(tracker).toBe('203.0.113.7');
  });

  it('takes the first entry when the header carries a comma list', () => {
    const tracker = clientIpTracker(
      buildRequest({ 'x-envoy-external-address': '203.0.113.7, 10.1.2.3' }),
    );

    expect(tracker).toBe('203.0.113.7');
  });

  /**
   * X-Forwarded-For do client gửi lên là giả mạo được, nên KHÔNG đọc thẳng
   * entry trái nhất của nó: kẻ tấn công chỉ cần xoay giá trị header là thoát
   * rate limit. Chỉ tin header do edge đặt, còn lại để Express quyết.
   */
  it('never trusts a client-supplied X-Forwarded-For on its own', () => {
    const tracker = clientIpTracker(
      buildRequest({ 'x-forwarded-for': '1.2.3.4' }, '10.0.0.9'),
    );

    expect(tracker).toBe('10.0.0.9');
  });

  it('returns a stable placeholder when there is no address at all', () => {
    const tracker = clientIpTracker({
      headers: {},
    } as unknown as TrackerRequest);

    expect(tracker).toBe('unknown');
  });
});
