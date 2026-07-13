import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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
