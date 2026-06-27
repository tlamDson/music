/**
 * Template unit test cho AuthService - viết theo TDD
 * Đây là ví dụ: viết test trước khi có implementation
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaClient } from '@prisma/client';

// Import sẽ có sau khi tạo implementation (RED phase: import fail = đúng)
// import { AuthService } from '../../src/modules/auth/auth.service';
// import { PrismaService } from '../../src/prisma/prisma.service';

describe('AuthService', () => {
  // Placeholder test để verify test runner hoạt động
  // Sẽ được thay bằng test thực khi làm feature auth (RED phase)

  it('placeholder - test runner is configured correctly', () => {
    expect(true).toBe(true);
  });

  describe('login', () => {
    it.todo('should return tokens when credentials are valid');
    it.todo('should throw UnauthorizedException when email not found');
    it.todo('should throw UnauthorizedException when password is wrong');
  });

  describe('refreshToken', () => {
    it.todo('should return new access token when refresh token is valid');
    it.todo('should throw UnauthorizedException when refresh token is expired');
  });

  describe('validateToken', () => {
    it.todo('should return JwtPayload when token is valid');
    it.todo('should throw when token is tampered');
  });
});
