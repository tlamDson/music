import { formatTotalDurationExact, formatAddedAt } from '../../src/lib/format';

describe('formatTotalDurationExact', () => {
  it('trả về "0 phút" khi không có dữ liệu', () => {
    expect(formatTotalDurationExact(0)).toBe('0 phút');
    expect(formatTotalDurationExact(null)).toBe('0 phút');
    expect(formatTotalDurationExact(undefined)).toBe('0 phút');
  });

  it('trả về đúng số phút khi dưới 1 giờ', () => {
    expect(formatTotalDurationExact(45 * 60_000)).toBe('45 phút');
  });

  it('trả về "X giờ" khi tròn giờ, không thêm "0 phút"', () => {
    expect(formatTotalDurationExact(3 * 60 * 60_000)).toBe('3 giờ');
  });

  it('trả về "X giờ Y phút" đúng kiểu Spotify khi lẻ phút', () => {
    expect(formatTotalDurationExact((3 * 60 + 15) * 60_000)).toBe('3 giờ 15 phút');
  });
});

describe('formatAddedAt', () => {
  it('trả về "--" khi thiếu dữ liệu hoặc ngày không hợp lệ', () => {
    expect(formatAddedAt(null)).toBe('--');
    expect(formatAddedAt(undefined)).toBe('--');
    expect(formatAddedAt('not-a-date')).toBe('--');
  });

  it('định dạng ngày/tháng/năm từ chuỗi ISO', () => {
    expect(formatAddedAt('2026-07-20T10:00:00.000Z')).toBe('20/07/2026');
  });
});
