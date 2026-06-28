import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../../src/modules/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: DeepMockProxy<PrismaClient>;
  let jwtService: jest.Mocked<JwtService>;

  const mockUser = {
    id: 'user-1',
    email: 'admin@cafe.com',
    passwordHash: '$2b$10$hashedpassword',
    name: 'Org Admin',
    role: 'ORG_ADMIN' as const,
    organizationId: 'org-1',
    storeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const prismaMock = mockDeep<PrismaClient>();
    const jwtMock = { sign: jest.fn().mockReturnValue('mock-token'), verify: jest.fn() } as unknown as jest.Mocked<JwtService>;
    const configMock = { get: jest.fn().mockReturnValue('secret') } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService);
  });

  describe('login', () => {
    it('should return tokens when credentials are valid', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);

      // mock bcrypt compare to return true
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true as never);

      const result = await service.login({ email: 'admin@cafe.com', password: 'password123' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
    });

    it('should throw UnauthorizedException when email is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'notexist@cafe.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false as never);

      await expect(
        service.login({ email: 'admin@cafe.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateToken', () => {
    it('should return user when token is valid', async () => {
      const payload = { sub: 'user-1', email: 'admin@cafe.com', role: 'ORG_ADMIN', organizationId: 'org-1', storeId: null };
      prisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await service.validateJwtPayload(payload);

      expect(result).toMatchObject({ id: 'user-1', email: 'admin@cafe.com' });
    });

    it('should return null when user not found', async () => {
      const payload = { sub: 'non-existent', email: 'x@x.com', role: 'ORG_ADMIN', organizationId: 'org-1', storeId: null };
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateJwtPayload(payload);
      expect(result).toBeNull();
    });
  });
});
