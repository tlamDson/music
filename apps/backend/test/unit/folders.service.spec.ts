import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { FoldersService } from '../../src/modules/playlists/folders.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('FoldersService', () => {
  let service: FoldersService;
  let prisma: DeepMockProxy<PrismaClient>;

  const orgAdminUser = {
    sub: 'user-1',
    email: 'admin@cafe.com',
    role: 'ORG_ADMIN' as const,
    organizationId: 'org-1',
    storeId: null,
  };

  const mockFolder = {
    id: 'folder-1',
    name: 'Morning',
    scope: 'ORG' as const,
    organizationId: 'org-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const prismaMock = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoldersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(FoldersService);
    prisma = module.get(PrismaService);
  });

  describe('create', () => {
    it('should create an ORG-scope folder in the user organization', async () => {
      prisma.folder.create.mockResolvedValue(mockFolder as any);

      const result = await service.create('Morning', orgAdminUser);

      expect(result).toEqual(mockFolder);
      expect(prisma.folder.create).toHaveBeenCalledWith({
        data: { name: 'Morning', scope: 'ORG', organizationId: 'org-1' },
      });
    });
  });

  describe('findAll', () => {
    it('should return folders scoped to the organization ordered by name', async () => {
      prisma.folder.findMany.mockResolvedValue([mockFolder] as any);

      const result = await service.findAll(orgAdminUser);

      expect(result).toEqual([mockFolder]);
      expect(prisma.folder.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException and not delete when folder is outside the organization', async () => {
      prisma.folder.findFirst.mockResolvedValue(null);

      await expect(service.remove('folder-x', orgAdminUser)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.folder.delete).not.toHaveBeenCalled();
    });

    it('should delete the folder and return a message when it belongs to the organization', async () => {
      prisma.folder.findFirst.mockResolvedValue(mockFolder as any);
      prisma.folder.delete.mockResolvedValue(mockFolder as any);

      const result = await service.remove('folder-1', orgAdminUser);

      expect(result).toEqual({ message: 'Folder deleted' });
      expect(prisma.folder.delete).toHaveBeenCalledWith({
        where: { id: 'folder-1' },
      });
    });
  });
});
