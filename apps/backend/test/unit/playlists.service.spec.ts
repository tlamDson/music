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

  describe('addTrack', () => {
    it('should add a track to a playlist and auto-assign position', async () => {
      prisma.playlist.findFirst.mockResolvedValue(mockPlaylist as any);
      prisma.track.findFirst.mockResolvedValue({ id: 'track-1' } as any);
      prisma.playlistTrack.count.mockResolvedValue(2);
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
  });
});
