import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { PlaylistsService } from '../../src/modules/playlists/playlists.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PlaylistsService', () => {
  let service: PlaylistsService;
  let prisma: DeepMockProxy<PrismaClient>;

  const orgAdminUser = {
    sub: 'user-1',
    email: 'admin@cafe.com',
    role: 'ORG_ADMIN' as const,
    organizationId: 'org-1',
    storeId: null,
  };

  const storeAdminUser = {
    sub: 'user-2',
    email: 'store1@cafe.com',
    role: 'STORE_ADMIN' as const,
    organizationId: 'org-1',
    storeId: 'store-1',
  };

  const mockPlaylist = {
    id: 'playlist-1',
    name: 'Ballad Playlist',
    scope: 'ORG' as const,
    folderId: null,
    organizationId: 'org-1',
    storeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const prismaMock = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaylistsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(PlaylistsService);
    prisma = module.get(PrismaService);
  });

  describe('RBAC - create playlist', () => {
    it('should allow ORG_ADMIN to create ORG-scope playlist', async () => {
      prisma.playlist.create.mockResolvedValue(mockPlaylist as any);

      const result = await service.create(
        { name: 'Ballad Playlist', scope: 'ORG' },
        orgAdminUser,
      );

      expect(result).toMatchObject({ name: 'Ballad Playlist', scope: 'ORG' });
    });

    it('should throw ForbiddenException when STORE_ADMIN tries to create ORG-scope playlist', async () => {
      await expect(
        service.create(
          { name: 'Ballad Playlist', scope: 'ORG' },
          storeAdminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow STORE_ADMIN to create STORE-scope playlist for their store', async () => {
      const storePlaylist = {
        ...mockPlaylist,
        scope: 'STORE' as const,
        storeId: 'store-1',
      };
      prisma.playlist.create.mockResolvedValue(storePlaylist as any);

      const result = await service.create(
        { name: 'Store Playlist', scope: 'STORE', storeId: 'store-1' },
        storeAdminUser,
      );

      expect(result).toMatchObject({ scope: 'STORE' });
    });

    it('should throw ForbiddenException when STORE_ADMIN tries to create STORE playlist for different store', async () => {
      await expect(
        service.create(
          { name: 'Other Store Playlist', scope: 'STORE', storeId: 'store-99' },
          storeAdminUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // Trang duyệt playlist cần lọc theo chip (chuỗi/quán), ô tìm kiếm và tổng
  // thời lượng để hiện "98 bài hát, khoảng 7 giờ" như trên card.
  describe('findAll filters', () => {
    // Zod đã điền sẵn `sort` trước khi tới service (default 'recent')
    const pagination = { page: 1, limit: 20, sort: 'recent' as const };

    beforeEach(() => {
      prisma.playlist.findMany.mockResolvedValue([]);
      prisma.playlist.count.mockResolvedValue(0);
    });

    it('filters by scope when a chip is selected', async () => {
      await service.findAll(orgAdminUser, { ...pagination, scope: 'STORE' });

      expect(prisma.playlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scope: 'STORE' }),
        }),
      );
    });

    it('searches playlists by name, ignoring case', async () => {
      await service.findAll(orgAdminUser, { ...pagination, q: 'lofi' });

      expect(prisma.playlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'lofi', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('sorts by name when asked, newest first otherwise', async () => {
      await service.findAll(orgAdminUser, { ...pagination, sort: 'name' });
      expect(prisma.playlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );

      await service.findAll(orgAdminUser, pagination);
      expect(prisma.playlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('keeps a store admin from seeing playlists of other stores', async () => {
      await service.findAll(storeAdminUser, pagination);

      expect(prisma.playlist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ scope: 'ORG' }, { storeId: 'store-1' }],
          }),
        }),
      );
    });

    it('reports the total duration of each playlist', async () => {
      prisma.playlist.findMany.mockResolvedValue([
        {
          ...mockPlaylist,
          _count: { playlistTracks: 2 },
          playlistTracks: [
            { track: { durationMs: 180_000 } },
            { track: { durationMs: 245_000 } },
          ],
        },
      ] as any);
      prisma.playlist.count.mockResolvedValue(1);

      const result = await service.findAll(orgAdminUser, pagination);

      expect(result.data[0]).toMatchObject({
        id: 'playlist-1',
        totalDurationMs: 425_000,
      });
      // Danh sách track chỉ dùng để cộng thời lượng, không cần trả về client
      expect(result.data[0]).not.toHaveProperty('playlistTracks');
    });
  });

  describe('addTrack', () => {
    it('should add a track to a playlist and auto-assign position', async () => {
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as any);
      prisma.track.findFirst.mockResolvedValue({ id: 'track-1' } as any);
      // Playlist đang có 2 bài ở vị trí 0 và 1 → bài mới vào vị trí 2
      prisma.playlistTrack.findFirst.mockResolvedValue({ position: 1 } as any);
      prisma.playlistTrack.create.mockResolvedValue({
        id: 'pt-1',
        playlistId: 'playlist-1',
        trackId: 'track-1',
        position: 2,
      } as any);

      const result = await service.addTrack(
        'playlist-1',
        'track-1',
        orgAdminUser,
      );

      expect(prisma.playlistTrack.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ position: 2 }),
        }),
      );
      expect(result).toMatchObject({ position: 2 });
    });

    // Không check track thì store admin vòng qua scope kho nhạc bằng đúng một
    // request: thêm nhạc riêng của quán khác vào playlist rồi phát.
    it('should refuse tracks outside the caller store scope', async () => {
      const storeAdminUser = {
        sub: 'user-2',
        email: 'store1@cafe.com',
        role: 'STORE_ADMIN' as const,
        organizationId: 'org-1',
        storeId: 'store-1',
      };
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as any);
      prisma.track.findFirst.mockResolvedValue(null);

      await expect(
        service.addTrack('playlist-1', 'track-9', storeAdminUser),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.track.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'track-9',
          organizationId: 'org-1',
          OR: [{ storeId: null }, { storeId: 'store-1' }],
        },
      });
      expect(prisma.playlistTrack.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when playlist does not belong to org', async () => {
      prisma.playlist.findFirst.mockResolvedValue(null);

      await expect(
        service.addTrack('nonexistent', 'track-1', orgAdminUser),
      ).rejects.toThrow(NotFoundException);
    });

    // Xoá một bài giữa playlist để lại lỗ hổng vị trí: đếm số bài rồi lấy làm
    // position sẽ trùng với bài cuối → 500 unique constraint (playlistId, position)
    it('should append after the highest position, not the track count', async () => {
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as any);
      prisma.track.findFirst.mockResolvedValue({ id: 'track-3' } as any);
      prisma.playlistTrack.findFirst.mockResolvedValue({ position: 4 } as any);
      prisma.playlistTrack.create.mockResolvedValue({ id: 'pt-9' } as any);

      await service.addTrack('playlist-1', 'track-3', orgAdminUser);

      expect(prisma.playlistTrack.create).toHaveBeenCalledWith({
        data: { playlistId: 'playlist-1', trackId: 'track-3', position: 5 },
      });
    });

    it('should start at position 0 on an empty playlist', async () => {
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as any);
      prisma.track.findFirst.mockResolvedValue({ id: 'track-1' } as any);
      prisma.playlistTrack.findFirst.mockResolvedValue(null);
      prisma.playlistTrack.create.mockResolvedValue({ id: 'pt-1' } as any);

      await service.addTrack('playlist-1', 'track-1', orgAdminUser);

      expect(prisma.playlistTrack.create).toHaveBeenCalledWith({
        data: { playlistId: 'playlist-1', trackId: 'track-1', position: 0 },
      });
    });
  });

  describe('reorderTracks', () => {
    // Ghi thẳng vị trí mới thì bài đầu tiên nhận position 0 trong khi bài cũ
    // vẫn giữ 0 → unique constraint nổ ngay giữa transaction.
    it('should park positions out of the way before writing the new order', async () => {
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as any);
      prisma.$transaction.mockResolvedValue([] as any);

      await service.reorderTracks(
        'playlist-1',
        ['track-2', 'track-1'],
        orgAdminUser,
      );

      const calls = prisma.playlistTrack.updateMany.mock.calls.map(
        ([args]) => args,
      );

      expect(calls).toHaveLength(4);
      expect(calls.slice(0, 2)).toEqual([
        {
          where: { playlistId: 'playlist-1', trackId: 'track-2' },
          data: { position: -1 },
        },
        {
          where: { playlistId: 'playlist-1', trackId: 'track-1' },
          data: { position: -2 },
        },
      ]);
      expect(calls.slice(2)).toEqual([
        {
          where: { playlistId: 'playlist-1', trackId: 'track-2' },
          data: { position: 0 },
        },
        {
          where: { playlistId: 'playlist-1', trackId: 'track-1' },
          data: { position: 1 },
        },
      ]);
    });

    it('should refuse to reorder a playlist from another organization', async () => {
      prisma.playlist.findFirst.mockResolvedValue(null);

      await expect(
        service.reorderTracks('playlist-9', ['track-1'], orgAdminUser),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
