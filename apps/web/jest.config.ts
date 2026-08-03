import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  displayName: 'web:unit',
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/__tests__/unit/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@cafe-music/shared(.*)$': '<rootDir>/../../packages/shared/src$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.stories.{ts,tsx}', '!src/app/layout.tsx'],
  coverageDirectory: 'coverage',
  // Sàn chống tụt, đo thật ngày 2026-08-03 rồi làm tròn xuống — xem giải thích
  // đầy đủ ở apps/backend/jest.config.ts. Ngưỡng cũ ghi 80/80/70/80 nhưng chưa
  // bao giờ chạy; số thật là 80.2/71.45/79.5/81.69.
  coverageThreshold: {
    global: {
      lines: 81,
      functions: 79,
      branches: 71,
      statements: 80,
    },
  },
};

export default createJestConfig(config);
