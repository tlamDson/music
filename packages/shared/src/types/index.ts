// ─── Roles ────────────────────────────────────────────────────────────────────

export type UserRole = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'STORE_ADMIN';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
  storeId: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ─── Organization ─────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export interface Store {
  id: string;
  name: string;
  organizationId: string;
  syncGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export type SyncMode = 'TIGHT' | 'LOOSE';

export type SyncGroupStatus = 'PLAYING' | 'PAUSED' | 'STOPPED';

export interface SyncGroupState {
  groupId: string;
  playlistId: string | null;
  trackId: string | null;
  trackIndex: number;
  positionMs: number;
  startedAtServerTs: number | null;
  isPlaying: boolean;
  mode: SyncMode;
  status: SyncGroupStatus;
}

export interface StoreOverride {
  storeId: string;
  isOverridden: boolean;
  overrideTrackId: string | null;
  overridePlaylistId: string | null;
  overriddenAt: string | null;
}

// ─── Playlist / Track ─────────────────────────────────────────────────────────

export type PlaylistScope = 'ORG' | 'STORE';
export type TrackSource = 'SELF_HOSTED' | 'EXTERNAL';
export type ExternalProvider = 'SPOTIFY' | 'YOUTUBE' | 'SOUNDCLOUD';

export interface Folder {
  id: string;
  name: string;
  scope: PlaylistScope;
  organizationId: string;
  storeId: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  scope: PlaylistScope;
  folderId: string | null;
  organizationId: string;
  storeId: string | null;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string | null;
  durationMs: number;
  source: TrackSource;
  s3Key: string | null;
  externalProvider: ExternalProvider | null;
  externalId: string | null;
  organizationId: string;
  createdAt: string;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export type WsEventName =
  | 'now-playing'
  | 'paused'
  | 'stopped'
  | 'override'
  | 'rejoin'
  | 'clock-sync'
  | 'error';

export interface WsNowPlayingPayload {
  groupId: string;
  trackId: string;
  trackUrl: string | null;
  positionMs: number;
  serverTs: number;
  mode: SyncMode;
}

export interface WsClockSyncPayload {
  clientTs: number;
  serverTs: number;
}

// ─── API Response envelope ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    statusCode: number;
  };
}
