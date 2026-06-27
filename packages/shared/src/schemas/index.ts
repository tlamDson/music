import { z } from 'zod';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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
  syncGroupId: z.string().uuid().optional(),
});

export const UpdateStoreSchema = CreateStoreSchema.partial();

export type CreateStoreDto = z.infer<typeof CreateStoreSchema>;
export type UpdateStoreDto = z.infer<typeof UpdateStoreSchema>;

// ─── Playlist ─────────────────────────────────────────────────────────────────

export const CreatePlaylistSchema = z.object({
  name: z.string().min(1).max(100),
  folderId: z.string().uuid().optional(),
  scope: z.enum(['ORG', 'STORE']),
  storeId: z.string().uuid().optional(),
});

export const UpdatePlaylistSchema = CreatePlaylistSchema.partial();

export type CreatePlaylistDto = z.infer<typeof CreatePlaylistSchema>;
export type UpdatePlaylistDto = z.infer<typeof UpdatePlaylistSchema>;

// ─── Track ────────────────────────────────────────────────────────────────────

export const CreateTrackMetaSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().max(200).optional(),
  folderId: z.string().uuid().optional(),
});

export type CreateTrackMetaDto = z.infer<typeof CreateTrackMetaSchema>;

// ─── Sync ─────────────────────────────────────────────────────────────────────

export const PlayGroupSchema = z.object({
  playlistId: z.string().uuid(),
  trackIndex: z.number().int().min(0).default(0),
  mode: z.enum(['TIGHT', 'LOOSE']).default('LOOSE'),
});

export const SetSyncModeSchema = z.object({
  mode: z.enum(['TIGHT', 'LOOSE']),
});

export const OverrideSchema = z.object({
  trackId: z.string().uuid().optional(),
  playlistId: z.string().uuid().optional(),
});

export type PlayGroupDto = z.infer<typeof PlayGroupSchema>;
export type SetSyncModeDto = z.infer<typeof SetSyncModeSchema>;
export type OverrideDto = z.infer<typeof OverrideSchema>;

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationDto = z.infer<typeof PaginationSchema>;
