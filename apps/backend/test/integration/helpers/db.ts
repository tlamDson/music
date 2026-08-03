import * as bcrypt from 'bcrypt';
import { JwtPayload, UserRole } from '@cafe-music/shared';
import { PrismaService } from '../../../src/prisma/prisma.service';

/**
 * Thứ tự không quan trọng vì CASCADE, nhưng liệt kê đủ mọi bảng — thiếu một bảng
 * là dữ liệu rò từ test này sang test khác và lỗi sẽ phụ thuộc thứ tự chạy.
 *
 * Dùng TRUNCATE thay cho "transaction rollback" mà `teardown.ts` từng hứa (và
 * chưa bao giờ tồn tại): request đi qua HTTP nên chạy ở connection khác, không
 * nằm trong transaction của test được.
 */
const TABLES = [
  'PlaylistSchedule',
  'AuditLog',
  'PlaylistTrack',
  'Track',
  'Playlist',
  'Folder',
  'User',
  'Store',
  'Organization',
];

export async function truncateAll(prisma: PrismaService): Promise<void> {
  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`,
  );
}

/** Mật khẩu dùng chung cho user seed trong test — bcrypt rounds thấp cho nhanh. */
export const TEST_PASSWORD = 'Test@123456';

export async function hashTestPassword(
  password = TEST_PASSWORD,
): Promise<string> {
  return bcrypt.hash(password, 4);
}

interface TenantOptions {
  slug: string;
  storeIds: string[];
}

export interface Tenant {
  orgId: string;
  storeIds: string[];
}

/**
 * Seed hiện có (`prisma/seed.ts`) chỉ tạo MỘT tổ chức — không có fixture nào để
 * kiểm cô lập chéo tổ chức, đúng thứ tầng này sinh ra để kiểm. Helper luôn dựng
 * được nhiều org/quán độc lập.
 */
export async function createTenant(
  prisma: PrismaService,
  { slug, storeIds }: TenantOptions,
): Promise<Tenant> {
  const org = await prisma.organization.create({
    data: { name: `Org ${slug}`, slug },
  });

  for (const id of storeIds) {
    await prisma.store.create({
      data: { id, name: `Store ${id}`, organizationId: org.id },
    });
  }

  return { orgId: org.id, storeIds };
}

export async function createUser(
  prisma: PrismaService,
  params: {
    email: string;
    role: UserRole;
    organizationId: string;
    storeId?: string | null;
    isActive?: boolean;
    passwordHash?: string;
  },
) {
  return prisma.user.create({
    data: {
      email: params.email,
      name: params.email,
      passwordHash: params.passwordHash ?? (await hashTestPassword()),
      role: params.role,
      organizationId: params.organizationId,
      storeId: params.storeId ?? null,
      isActive: params.isActive ?? true,
    },
  });
}

export async function createTrack(
  prisma: PrismaService,
  params: {
    organizationId: string;
    storeId?: string | null;
    title?: string;
    durationMs?: number;
    s3Key?: string | null;
  },
) {
  return prisma.track.create({
    data: {
      title: params.title ?? 'Track',
      durationMs: params.durationMs ?? 180_000,
      source: 'SELF_HOSTED',
      s3Key: params.s3Key === undefined ? 'org/tracks/stub.mp3' : params.s3Key,
      organizationId: params.organizationId,
      storeId: params.storeId ?? null,
    },
  });
}

export async function createPlaylist(
  prisma: PrismaService,
  params: {
    organizationId: string;
    scope: 'ORG' | 'STORE';
    storeId?: string | null;
    name?: string;
  },
) {
  return prisma.playlist.create({
    data: {
      name: params.name ?? 'Playlist',
      scope: params.scope,
      organizationId: params.organizationId,
      storeId: params.storeId ?? null,
    },
  });
}

export async function addTrackToPlaylist(
  prisma: PrismaService,
  playlistId: string,
  trackId: string,
  position: number,
) {
  return prisma.playlistTrack.create({
    data: { playlistId, trackId, position },
  });
}

/**
 * `@CurrentUser()` khai kiểu `JwtPayload` nhưng runtime là bản ghi Prisma `User`
 * — bốn field dưới đây trùng tên/giá trị ở cả hai phía nên stub guard dùng được
 * cho mọi service hiện có. (Chi tiết cạm bẫy ở .claude/rules/tech-defaults.md.)
 */
export function jwtPayloadFor(params: {
  email: string;
  role: UserRole;
  organizationId: string;
  storeId?: string | null;
}): JwtPayload {
  return {
    sub: params.email,
    email: params.email,
    role: params.role,
    organizationId: params.organizationId,
    storeId: params.storeId ?? null,
  } as JwtPayload;
}
