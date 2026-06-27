// ─── API ──────────────────────────────────────────────────────────────────────

export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

// ─── Roles ────────────────────────────────────────────────────────────────────

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ORG_ADMIN: 'ORG_ADMIN',
  STORE_ADMIN: 'STORE_ADMIN',
} as const;

// ─── Sync ─────────────────────────────────────────────────────────────────────

export const SYNC_MODES = {
  TIGHT: 'TIGHT',
  LOOSE: 'LOOSE',
} as const;

export const WS_EVENTS = {
  NOW_PLAYING: 'now-playing',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  OVERRIDE: 'override',
  REJOIN: 'rejoin',
  CLOCK_SYNC: 'clock-sync',
  ERROR: 'error',
} as const;

export const WS_ROOMS = {
  syncGroup: (groupId: string) => `sync-group:${groupId}`,
  store: (storeId: string) => `store:${storeId}`,
  org: (orgId: string) => `org:${orgId}`,
} as const;

// ─── Storage ──────────────────────────────────────────────────────────────────

export const S3_PATHS = {
  track: (orgId: string, trackId: string) => `orgs/${orgId}/tracks/${trackId}`,
} as const;

export const STREAM_URL_TTL_SECONDS = 3600;

// ─── Cache TTL ────────────────────────────────────────────────────────────────

export const CACHE_TTL = {
  PLAYLISTS: 60,
  TRACKS: 120,
  STORE_STATE: 5,
} as const;

// ─── JWT ──────────────────────────────────────────────────────────────────────

export const JWT_TTL = {
  ACCESS: '15m',
  REFRESH: '7d',
} as const;
