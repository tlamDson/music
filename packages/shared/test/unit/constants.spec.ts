import {
  API_PREFIX,
  API_VERSION,
  CACHE_TTL,
  JWT_TTL,
  PLAYBACK_STATUSES,
  ROLES,
  S3_PATHS,
  STREAM_URL_TTL_SECONDS,
  WS_EVENTS,
  WS_ROOMS,
} from '../../src/constants';

/**
 * `WS_ROOMS` và `S3_PATHS` là ba hàm thuần duy nhất của package — chúng sinh ra
 * định danh dùng ở **cả hai phía** (backend join room / ký URL, web join room),
 * nên đổi format là hỏng đồng bộ mà không có lỗi type nào bắn ra.
 */

describe('WS_ROOMS', () => {
  it('builds the store room name used by the sync gateway', () => {
    expect(WS_ROOMS.store('store-1')).toBe('store:store-1');
  });

  it('builds the org room name', () => {
    expect(WS_ROOMS.org('org-1')).toBe('org:org-1');
  });

  it('keeps store and org namespaces separate for the same id', () => {
    expect(WS_ROOMS.store('x')).not.toBe(WS_ROOMS.org('x'));
  });
});

describe('S3_PATHS', () => {
  it('scopes the track key under its organization', () => {
    expect(S3_PATHS.track('org-1', 'track-9')).toBe('orgs/org-1/tracks/track-9');
  });

  it('never produces a leading slash (S3 keys are not paths)', () => {
    expect(S3_PATHS.track('org-1', 'track-9').startsWith('/')).toBe(false);
  });
});

describe('API constants', () => {
  // API_PREFIX derive từ API_VERSION — dễ lệch âm thầm nếu ai đó sửa một trong
  // hai. Backend gọi `app.setGlobalPrefix(API_PREFIX)` nên sai là lệch mọi route.
  it('derives API_PREFIX from API_VERSION', () => {
    expect(API_VERSION).toBe('v1');
    expect(API_PREFIX).toBe('/api/v1');
    expect(API_PREFIX).toBe(`/api/${API_VERSION}`);
  });
});

describe('enum-like constant maps', () => {
  it('maps every role key to its own name', () => {
    expect(ROLES).toEqual({
      SUPER_ADMIN: 'SUPER_ADMIN',
      ORG_ADMIN: 'ORG_ADMIN',
      STORE_ADMIN: 'STORE_ADMIN',
    });
  });

  it('maps every playback status key to its own name', () => {
    expect(PLAYBACK_STATUSES).toEqual({
      PLAYING: 'PLAYING',
      PAUSED: 'PAUSED',
      STOPPED: 'STOPPED',
    });
  });

  it('uses kebab-case wire names for WS events', () => {
    expect(WS_EVENTS.STORE_NOW_PLAYING).toBe('store-now-playing');
    expect(WS_EVENTS.STORE_PAUSED).toBe('store-paused');
    expect(WS_EVENTS.STORE_STOPPED).toBe('store-stopped');
    expect(WS_EVENTS.CLOCK_SYNC).toBe('clock-sync');
  });

  /**
   * Nợ đã biết, ghim lại để không quên: type `WsEventName` (src/types) có
   * `'store-mode-changed'` nhưng `WS_EVENTS` thì không. Backend hiện phát event
   * đó bằng chuỗi viết thẳng. Test này khẳng định hiện trạng — khi ai đó bổ
   * sung hằng số thì test đỏ và đây là chỗ để cập nhật cả hai phía cùng lúc.
   */
  it('does not yet expose store-mode-changed (known gap vs WsEventName)', () => {
    expect(Object.values(WS_EVENTS)).not.toContain('store-mode-changed');
  });
});

describe('TTL constants', () => {
  it('keeps the stream URL TTL at one hour', () => {
    expect(STREAM_URL_TTL_SECONDS).toBe(3600);
  });

  it('caches store state far shorter than playlists and tracks', () => {
    expect(CACHE_TTL.STORE_STATE).toBeLessThan(CACHE_TTL.PLAYLISTS);
    expect(CACHE_TTL.PLAYLISTS).toBeLessThan(CACHE_TTL.TRACKS);
  });

  it('keeps the access token TTL far shorter than the refresh one', () => {
    expect(JWT_TTL.ACCESS).toBe('15m');
    expect(JWT_TTL.REFRESH).toBe('7d');
  });
});
