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
  status: PlaybackStatus;
  currentTrackId: string | null;
  trackIndex: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export type PlaybackStatus = 'PLAYING' | 'PAUSED' | 'STOPPED';

/**
 * Trạng thái phát của một quán. Quán là đơn vị phát duy nhất — tầng
 * `SyncGroup` đã bị bỏ vì trùng chức năng, nên cũng không còn khái niệm
 * "tách khỏi nhóm" hay "quay lại nhóm".
 */
export interface StorePlaybackState {
  storeId: string;
  playlistId: string;
  trackIds: string[];
  trackIndex: number;
  positionMs: number;
  startedAtServerTs: number;
  isPlaying: boolean;
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
  | 'store-now-playing'
  | 'store-paused'
  | 'store-stopped'
  | 'clock-sync'
  | 'error';

/**
 * Đủ để client dựng thanh phát mà không phải gọi thêm API. Trước đây payload
 * chỉ có `trackId` nên màn kiosk in thẳng cuid ra TV.
 */
export interface WsTrackMeta {
  id: string;
  title: string;
  artist: string | null;
  durationMs: number;
}

export interface WsQueueInfo {
  index: number;
  total: number;
  remaining: number;
}

export interface WsStoreNowPlayingPayload {
  storeId: string;
  trackId: string;
  track: WsTrackMeta;
  trackUrl: string | null;
  positionMs: number;
  serverTs: number;
  queue: WsQueueInfo;
}

/**
 * Ảnh chụp "đang phát cái gì" lúc client mở trang. Broadcast WS là
 * fire-and-forget, không replay khi join room — thiếu cái này thì trang mở sau
 * lúc admin bấm phát sẽ trắng cho tới lần chuyển bài kế tiếp.
 */
export interface NowPlayingSnapshot {
  storeId: string;
  track: WsTrackMeta;
  trackUrl: string | null;
  /** Đã cộng thời gian đã trôi kể từ `startedAtServerTs`. */
  positionMs: number;
  serverTs: number;
  isPlaying: boolean;
  queue: WsQueueInfo | null;
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
