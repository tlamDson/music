import {
  formatTotalDurationExact,
  formatAddedAt,
  formatPlaylistMeta,
  type Translator,
} from '../../src/lib/format';

/**
 * Translator giả lập cho unit test — chỉ kiểm tra logic ghép câu/nội suy của
 * format.ts, không phụ thuộc nội dung thật trong messages/vi.json (nội dung
 * thật được phủ qua test của component gọi useTranslations() thật, ví dụ
 * PlaylistDetail.test.tsx).
 */
function fakeT(key: string, values?: Record<string, unknown>): string {
  const templates: Record<string, string> = {
    'duration.zeroMinutes': '0m',
    'duration.minutes': '{minutes}m',
    'duration.aboutHours': '~{hours}h',
    'duration.hours': '{hours}h',
    'duration.hoursMinutes': '{hours}h{minutes}m',
    'playlistMeta.trackCount': '{count} tracks',
    'playlistMeta.scopeOrg': 'org',
    'playlistMeta.scopeStore': 'store',
  };
  const template = templates[key] ?? key;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, k: string) =>
    k in values ? String(values[k]) : match,
  );
}

describe('formatTotalDurationExact', () => {
  it('trả về chuỗi "0 phút" khi không có dữ liệu', () => {
    expect(formatTotalDurationExact(0, fakeT)).toBe('0m');
    expect(formatTotalDurationExact(null, fakeT)).toBe('0m');
    expect(formatTotalDurationExact(undefined, fakeT)).toBe('0m');
  });

  it('trả về đúng số phút khi dưới 1 giờ', () => {
    expect(formatTotalDurationExact(45 * 60_000, fakeT)).toBe('45m');
  });

  it('trả về "Xh" khi tròn giờ, không thêm phút', () => {
    expect(formatTotalDurationExact(3 * 60 * 60_000, fakeT)).toBe('3h');
  });

  it('trả về "Xh Ym" đúng kiểu Spotify khi lẻ phút', () => {
    expect(formatTotalDurationExact((3 * 60 + 15) * 60_000, fakeT)).toBe('3h15m');
  });
});

describe('formatAddedAt', () => {
  it('trả về "--" khi thiếu dữ liệu hoặc ngày không hợp lệ', () => {
    expect(formatAddedAt(null, 'vi')).toBe('--');
    expect(formatAddedAt(undefined, 'vi')).toBe('--');
    expect(formatAddedAt('not-a-date', 'vi')).toBe('--');
  });

  it('định dạng ngày/tháng/năm kiểu Việt Nam khi locale là "vi"', () => {
    expect(formatAddedAt('2026-07-20T10:00:00.000Z', 'vi')).toBe('20/07/2026');
  });

  it('định dạng ngày kiểu Mỹ khi locale là "en"', () => {
    expect(formatAddedAt('2026-07-20T10:00:00.000Z', 'en')).toBe('07/20/2026');
  });

  it('mặc định locale "vi" khi không truyền', () => {
    expect(formatAddedAt('2026-07-20T10:00:00.000Z')).toBe('20/07/2026');
  });
});

describe('formatPlaylistMeta', () => {
  it('ghép số bài · thời lượng khi không có scope', () => {
    expect(formatPlaylistMeta(fakeT, { count: 12, durationMs: 45 * 60_000 })).toBe(
      '12 tracks · 45m',
    );
  });

  it('ghép thêm nhãn phạm vi khi có scope ORG', () => {
    expect(formatPlaylistMeta(fakeT, { count: 5, durationMs: 3 * 60 * 60_000, scope: 'ORG' })).toBe(
      '5 tracks · 3h · org',
    );
  });

  it('ghép thêm nhãn phạm vi khi có scope STORE', () => {
    expect(
      formatPlaylistMeta(fakeT, { count: 5, durationMs: 3 * 60 * 60_000, scope: 'STORE' }),
    ).toBe('5 tracks · 3h · store');
  });
});
