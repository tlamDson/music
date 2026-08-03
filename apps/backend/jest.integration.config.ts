import type { Config } from 'jest';

const config: Config = {
  displayName: 'backend:integration',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@cafe-music/shared(.*)$': '<rootDir>/../../packages/shared/src$1',
  },
  testEnvironment: 'node',
  // Timeout cao hơn unit test vì có I/O thật
  testTimeout: 30000,
  // Phải chạy TRƯỚC khi spec import AppModule: `validateEnv` crash lúc boot nếu
  // thiếu biến, và ở local dotenv đọc `.env` che mất vấn đề (CI không có file đó).
  setupFiles: ['<rootDir>/test/integration/env.setup.ts'],
  globalSetup: '<rootDir>/test/integration/setup.ts',
  globalTeardown: '<rootDir>/test/integration/teardown.ts',
  // Dùng chung một DB test, chạy song song là các suite TRUNCATE lẫn nhau.
  maxWorkers: 1,
};

export default config;
