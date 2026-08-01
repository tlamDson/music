import { installBigIntJsonSupport } from '../../src/common/bigint-json';

describe('installBigIntJsonSupport', () => {
  it('should make JSON.stringify serialize BigInt as string', () => {
    installBigIntJsonSupport();

    const result = JSON.stringify({ startedAtTs: BigInt('1784000193543') });

    expect(result).toBe('{"startedAtTs":"1784000193543"}');
  });

  it('should be idempotent when called multiple times', () => {
    installBigIntJsonSupport();
    installBigIntJsonSupport();

    expect(JSON.stringify(BigInt(7))).toBe('"7"');
  });
});
