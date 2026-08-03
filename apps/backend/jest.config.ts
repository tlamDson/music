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
  // Ngưỡng là SÀN CHỐNG TỤT, không phải mục tiêu — đặt bằng số đo thật ngày
  // 2026-08-03 làm tròn xuống, để CI đỏ khi coverage giảm chứ không đỏ ngay từ
  // đầu. Trước PR này ngưỡng ghi 80/80/70/80 nhưng CI chạy `test:unit` không có
  // `--coverage` nên chưa bao giờ được kiểm; bật lên mới lộ ra `functions` thật
  // sự là 71.22%.
  //
  // `functions` thấp hơn hẳn ba chỉ số kia vì các controller gần như không được
  // gọi: unit test gọi thẳng service, nên method controller không chạy
  // (sync.controller 8.33%, tracks/stores.controller 16.66%). Đây đúng phần mà
  // tầng integration test sẽ phủ — nâng ngưỡng này sau khi tầng đó xong.
  coverageThreshold: {
    global: {
      lines: 86,
      functions: 71,
      branches: 81,
      statements: 85,
    },
  },
};

export default config;
