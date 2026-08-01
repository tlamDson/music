import type { Config } from 'jest';

const config: Config = {
  displayName: 'backend:unit',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@cafe-music/shared(.*)$': '<rootDir>/../../packages/shared/src$1',
  },
  testEnvironment: 'node',
  // Spec dựng app Nest thật (routing test) ngốn bộ nhớ hơn hẳn spec gọi service
  // trực tiếp. Để mặc định thì worker bị "ran out of memory" khi turbo chạy song
  // song backend + web trên máy nhiều core — giới hạn số worker và cho jest
  // restart worker khi vượt ngưỡng thay vì crash cả suite.
  maxWorkers: '50%',
  workerIdleMemoryLimit: '512MB',
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/*.module.ts'],
  coverageDirectory: 'coverage/unit',
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 70,
      statements: 80,
    },
  },
};

export default config;
