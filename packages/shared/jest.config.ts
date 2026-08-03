import type { Config } from 'jest';

const config: Config = {
  displayName: 'shared:unit',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
  transform: {
    // Phải là `tsconfig.build.json`, KHÔNG phải `tsconfig.json`: base config của
    // package này là `module: ESNext` + `moduleResolution: Bundler` (dành cho
    // bundler của web), ts-jest cần CommonJS. Backend không dính cạm bẫy này vì
    // tsconfig của nó vốn đã là commonjs.
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.build.json' }],
  },
  testEnvironment: 'node',
  // `src/types/` cố tình nằm ngoài: file đó 100% là type, compile ra module
  // rỗng nên gộp vào chỉ kéo tụt `functions` mà không nói lên điều gì.
  collectCoverageFrom: ['src/schemas/**/*.ts', 'src/constants/**/*.ts'],
  coverageDirectory: 'coverage',
  // 100% ở đây RẺ và không chứng minh nhiều: `schemas/index.ts` gần như toàn
  // khai báo, chỉ cần `import` là mọi dòng đã "chạy" — thêm một schema mới mà
  // quên viết test thì coverage VẪN 100%. Giữ ngưỡng 100 để phát hiện file mới
  // hoàn toàn không được import, chứ giá trị thật của suite này nằm ở 100
  // assertion hành vi (chủ yếu là case sai), không nằm ở con số coverage.
  coverageThreshold: {
    global: {
      lines: 100,
      functions: 100,
      branches: 100,
      statements: 100,
    },
  },
};

export default config;
