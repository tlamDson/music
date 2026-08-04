import { z } from 'zod';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(9), // DEMO: regression cố tình để test fail, xem PR
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type LoginDto = z.infer<typeof LoginSchema>;
export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;

// ─── Organization ─────────────────────────────────────────────────────────────

export const CreateOrganizationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers and hyphens'),
});

export type CreateOrganizationDto = z.infer<typeof CreateOrganizationSchema>;

// ─── Store ────────────────────────────────────────────────────────────────────

export const CreateStoreSchema = z.object({
  name: z.string().min(2).max(100),
});

export const UpdateStoreSchema = CreateStoreSchema.partial();

export type CreateStoreDto = z.infer<typeof CreateStoreSchema>;
export type UpdateStoreDto = z.infer<typeof UpdateStoreSchema>;

// ─── Playlist ─────────────────────────────────────────────────────────────────

export const CreatePlaylistSchema = z.object({
  name: z.string().min(1).max(100),
  folderId: z.string().min(1).optional(),
  scope: z.enum(['ORG', 'STORE']),
  storeId: z.string().min(1).optional(),
});

export const UpdatePlaylistSchema = CreatePlaylistSchema.partial();

export type CreatePlaylistDto = z.infer<typeof CreatePlaylistSchema>;
export type UpdatePlaylistDto = z.infer<typeof UpdatePlaylistSchema>;

// ─── Track ────────────────────────────────────────────────────────────────────

export const CreateTrackMetaSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().max(200).optional(),
  folderId: z.string().min(1).optional(),
  // Trình duyệt đo bằng HTMLAudioElement trước khi upload (multipart nên là
  // chuỗi → coerce). Thiếu thì service để 0 và UI hiện "--:--" thay vì chặn
  // upload — optional chứ không default để client cũ vẫn upload được.
  durationMs: z.coerce.number().int().min(0).max(86_400_000).optional(),
});

export type CreateTrackMetaDto = z.infer<typeof CreateTrackMetaSchema>;

// `artist` nullable (không chỉ optional) để UI xoá được ca sĩ về "chưa rõ" —
// gửi `artist: null` xoá, không gửi field thì giữ nguyên giá trị cũ.
export const UpdateTrackMetaSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  artist: z.string().max(200).nullable().optional(),
});

export type UpdateTrackMetaDto = z.infer<typeof UpdateTrackMetaSchema>;

// ─── Me (hồ sơ tự phục vụ) ──────────────────────────────────────────────────

// Chỉ `name` — không cho tự đổi role/storeId/isActive qua route này, đó là
// leo thang đặc quyền / tự bật lại tài khoản vừa bị vô hiệu hoá.
export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100),
});

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

// max(72) vì bcrypt cắt im lặng sau 72 byte — chặn ở validation thay vì để
// phần vượt quá bị bỏ qua vô tình.
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8).max(72),
});

export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;

// ─── Sync ─────────────────────────────────────────────────────────────────────

export const StorePlaySchema = z.object({
  playlistId: z.string().min(1),
  trackIndex: z.number().int().min(0).default(0),
});

export type StorePlayDto = z.infer<typeof StorePlaySchema>;

// `.default()` biến field thành bắt buộc trong type sau `z.infer` — dùng
// `.optional()` + fallback trong service để client cũ chỉ gửi một trong hai
// field (repeat hoặc shuffle) vẫn hợp lệ.
export const PlaybackModeSchema = z.object({
  repeat: z.enum(['OFF', 'ALL', 'ONE']).optional(),
  shuffle: z.boolean().optional(),
});

export type PlaybackModeDto = z.infer<typeof PlaybackModeSchema>;

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationDto = z.infer<typeof PaginationSchema>;

// ─── Playlist query ───────────────────────────────────────────────────────────

/** Chip lọc + ô tìm kiếm của trang duyệt playlist. */
export const PlaylistQuerySchema = PaginationSchema.extend({
  scope: z.enum(['ORG', 'STORE']).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['recent', 'name']).default('recent'),
});

export type PlaylistQueryDto = z.infer<typeof PlaylistQuerySchema>;
