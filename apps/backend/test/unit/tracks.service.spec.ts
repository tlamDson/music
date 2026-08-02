import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { TracksService } from '../../src/modules/tracks/tracks.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { S3Service } from '../../src/modules/tracks/s3.service';

describe('TracksService', () => {
  let service: TracksService;
  let prisma: DeepMockProxy<PrismaClient>;
  let s3: jest.Mocked<S3Service>;

  const mockJwtPayload = {
    sub: 'user-1',
    email: 'admin@cafe.com',
    role: 'ORG_ADMIN' as const,
    organizationId: 'org-1',
    storeId: null,
  };

  const mockTrack = {
    id: 'track-1',
    title: 'Test Song',
    artist: 'Test Artist',
    durationMs: 180000,
    source: 'SELF_HOSTED' as const,
    s3Key: 'org-1/tracks/track-1.mp3',
    externalProvider: null,
    externalId: null,
    organizationId: 'org-1',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const prismaMock = mockDeep<PrismaClient>();
    const s3Mock = {
      uploadFile: jest.fn().mockResolvedValue({
        key: 'org-1/tracks/uuid.mp3',
        url: 'https://s3/file.mp3',
      }),
      getPresignedUrl: jest.fn().mockResolvedValue('https://s3/presigned-url'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<S3Service>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TracksService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: S3Service, useValue: s3Mock },
      ],
    }).compile();

    service = module.get(TracksService);
    prisma = module.get(PrismaService);
    s3 = module.get(S3Service);
  });

  describe('upload validation', () => {
    it('should throw BadRequestException for non-audio file', async () => {
      const invalidFile = {
        mimetype: 'image/jpeg',
        size: 1000,
        buffer: Buffer.from(''),
        originalname: 'photo.jpg',
      } as Express.Multer.File;

      await expect(
        service.create(
          { title: 'Test', artist: 'Artist' },
          invalidFile,
          mockJwtPayload,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for file exceeding max size', async () => {
      const bigFile = {
        mimetype: 'audio/mpeg',
        size: 60 * 1024 * 1024,
        buffer: Buffer.from(''),
        originalname: 'big.mp3',
      } as Express.Multer.File;

      await expect(
        service.create(
          { title: 'Test', artist: 'Artist' },
          bigFile,
          mockJwtPayload,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upload valid mp3 and save track metadata', async () => {
      const validFile = {
        mimetype: 'audio/mpeg',
        size: 5 * 1024 * 1024,
        buffer: Buffer.from(''),
        originalname: 'song.mp3',
      } as Express.Multer.File;
      prisma.track.create.mockResolvedValue(mockTrack as any);

      const result = await service.create(
        { title: 'Test Song', artist: 'Test Artist' },
        validFile,
        mockJwtPayload,
      );

      expect(s3.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1' }),
      );
      expect(prisma.track.create).toHaveBeenCalled();
      expect(result).toMatchObject({ title: 'Test Song' });
    });

    // durationMs từng bị ghi cứng 0 nên không hiện được thời lượng bài hát và
    // backend không biết bao giờ hết bài để tự chuyển.
    it('should persist the duration reported by the uploader', async () => {
      const validFile = {
        mimetype: 'audio/mpeg',
        size: 1024,
        buffer: Buffer.from(''),
        originalname: 'song.mp3',
      } as Express.Multer.File;
      prisma.track.create.mockResolvedValue(mockTrack as any);

      await service.create(
        { title: 'Test Song', durationMs: 245_000 },
        validFile,
        mockJwtPayload,
      );

      expect(prisma.track.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ durationMs: 245_000 }),
        }),
      );
    });

    it('should fall back to zero duration when the uploader sends none', async () => {
      const validFile = {
        mimetype: 'audio/mpeg',
        size: 1024,
        buffer: Buffer.from(''),
        originalname: 'song.mp3',
      } as Express.Multer.File;
      prisma.track.create.mockResolvedValue(mockTrack as any);

      await service.create({ title: 'Test Song' }, validFile, mockJwtPayload);

      expect(prisma.track.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ durationMs: 0 }),
        }),
      );
    });

    // M4A: mimetype khác nhau tùy trình duyệt/OS
    it.each(['audio/mp4', 'audio/x-m4a', 'audio/m4a'])(
      'should upload valid m4a file with mimetype %s',
      async (mimetype) => {
        const m4aFile = {
          mimetype,
          size: 5 * 1024 * 1024,
          buffer: Buffer.from(''),
          originalname: 'song.m4a',
        } as Express.Multer.File;
        prisma.track.create.mockResolvedValue(mockTrack as any);

        const result = await service.create(
          { title: 'M4A Song', artist: 'Test Artist' },
          m4aFile,
          mockJwtPayload,
        );

        expect(s3.uploadFile).toHaveBeenCalledWith(
          expect.objectContaining({ contentType: mimetype }),
        );
        expect(result).toMatchObject({ title: 'Test Song' });
      },
    );
  });

  // Track dùng chung cả chuỗi thì quán này nghe được nhạc riêng của quán kia —
  // track do store upload phải gắn storeId và chỉ quán đó thấy.
  describe('store scope', () => {
    const storeAdmin = {
      sub: 'user-2',
      email: 'store1@cafe.com',
      role: 'STORE_ADMIN' as const,
      organizationId: 'org-1',
      storeId: 'store-1',
    };

    const validFile = {
      mimetype: 'audio/mpeg',
      size: 1024,
      buffer: Buffer.from(''),
      originalname: 'song.mp3',
    } as Express.Multer.File;

    it('tags tracks uploaded by a store admin with their store', async () => {
      prisma.track.create.mockResolvedValue(mockTrack as any);

      await service.create({ title: 'Quán 1 Song' }, validFile, storeAdmin);

      expect(prisma.track.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ storeId: 'store-1' }),
        }),
      );
    });

    it('leaves org admin uploads shared across the chain', async () => {
      prisma.track.create.mockResolvedValue(mockTrack as any);

      await service.create({ title: 'Shared Song' }, validFile, mockJwtPayload);

      expect(prisma.track.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ storeId: null }),
        }),
      );
    });

    it('shows a store admin org tracks plus their own store tracks', async () => {
      prisma.track.findMany.mockResolvedValue([]);
      prisma.track.count.mockResolvedValue(0);

      await service.findAll(storeAdmin);

      expect(prisma.track.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'org-1',
            OR: [{ storeId: null }, { storeId: 'store-1' }],
          },
        }),
      );
    });

    it('shows an org admin every track in the organization', async () => {
      prisma.track.findMany.mockResolvedValue([]);
      prisma.track.count.mockResolvedValue(0);

      await service.findAll(mockJwtPayload);

      expect(prisma.track.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' } }),
      );
    });

    it('refuses to let a store admin delete a shared org track', async () => {
      prisma.track.findFirst.mockResolvedValue({
        ...mockTrack,
        storeId: null,
      } as any);

      await expect(
        service.remove('track-1', storeAdmin),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.track.delete).not.toHaveBeenCalled();
      expect(s3.deleteFile).not.toHaveBeenCalled();
    });

    it('lets a store admin delete their own store track', async () => {
      prisma.track.findFirst.mockResolvedValue({
        ...mockTrack,
        storeId: 'store-1',
      } as any);
      prisma.track.delete.mockResolvedValue(mockTrack as any);

      await expect(service.remove('track-1', storeAdmin)).resolves.toEqual({
        message: 'Track deleted',
      });
      expect(prisma.track.delete).toHaveBeenCalledWith({
        where: { id: 'track-1' },
      });
    });

    it('scopes stream urls so a store cannot stream another store track', async () => {
      prisma.track.findFirst.mockResolvedValue(mockTrack as any);

      await service.getStreamUrl('track-1', storeAdmin);

      expect(prisma.track.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'track-1',
          organizationId: 'org-1',
          OR: [{ storeId: null }, { storeId: 'store-1' }],
        },
      });
    });
  });

  // PATCH /tracks/:id — trước đây không có cách nào sửa tên bài/ca sĩ sau khi
  // upload (title mặc định lấy từ tên file, artist luôn null).
  describe('update', () => {
    const storeAdmin = {
      sub: 'user-2',
      email: 'store1@cafe.com',
      role: 'STORE_ADMIN' as const,
      organizationId: 'org-1',
      storeId: 'store-1',
    };

    it('lets an org admin rename any track in the organization', async () => {
      prisma.track.findFirst.mockResolvedValue(mockTrack as any);
      prisma.track.update.mockResolvedValue({
        ...mockTrack,
        title: 'New Title',
        artist: 'New Artist',
      } as any);

      const result = await service.update(
        'track-1',
        { title: 'New Title', artist: 'New Artist' },
        mockJwtPayload,
      );

      expect(prisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track-1' },
        data: { title: 'New Title', artist: 'New Artist' },
      });
      expect(result).toMatchObject({
        title: 'New Title',
        artist: 'New Artist',
      });
    });

    it('lets a store admin rename their own store track', async () => {
      prisma.track.findFirst.mockResolvedValue({
        ...mockTrack,
        storeId: 'store-1',
      } as any);
      prisma.track.update.mockResolvedValue({
        ...mockTrack,
        storeId: 'store-1',
        title: 'Renamed',
      } as any);

      await service.update('track-1', { title: 'Renamed' }, storeAdmin);

      expect(prisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track-1' },
        data: { title: 'Renamed' },
      });
    });

    it('refuses to let a store admin rename a shared org track', async () => {
      prisma.track.findFirst.mockResolvedValue({
        ...mockTrack,
        storeId: null,
      } as any);

      await expect(
        service.update('track-1', { title: 'Hijacked' }, storeAdmin),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.track.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the track does not exist in scope', async () => {
      prisma.track.findFirst.mockResolvedValue(null);

      await expect(
        service.update('missing-track', { title: 'X' }, mockJwtPayload),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.track.update).not.toHaveBeenCalled();
    });

    it('trims the title before saving', async () => {
      prisma.track.findFirst.mockResolvedValue(mockTrack as any);
      prisma.track.update.mockResolvedValue(mockTrack as any);

      await service.update('track-1', { title: '  Trimmed  ' }, mockJwtPayload);

      expect(prisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track-1' },
        data: { title: 'Trimmed' },
      });
    });

    it('converts an empty artist string to null', async () => {
      prisma.track.findFirst.mockResolvedValue(mockTrack as any);
      prisma.track.update.mockResolvedValue(mockTrack as any);

      await service.update('track-1', { artist: '' }, mockJwtPayload);

      expect(prisma.track.update).toHaveBeenCalledWith({
        where: { id: 'track-1' },
        data: { artist: null },
      });
    });
  });

  describe('getStreamUrl', () => {
    it('should return presigned URL for own org track', async () => {
      prisma.track.findFirst.mockResolvedValue(mockTrack as any);

      const result = await service.getStreamUrl('track-1', mockJwtPayload);

      expect(result).toHaveProperty('url');
      expect(s3.getPresignedUrl).toHaveBeenCalledWith(mockTrack.s3Key);
    });

    it('should throw NotFoundException if track not in org', async () => {
      prisma.track.findFirst.mockResolvedValue(null);

      await expect(
        service.getStreamUrl('track-1', mockJwtPayload),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
