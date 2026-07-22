import { z } from 'zod';

/**
 * Chuỗi 'false' (hoặc boolean false) → false, còn lại → true.
 * Env luôn là string nên z.coerce.boolean() không dùng được ('false' là truthy).
 */
const booleanFromEnv = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === '') return defaultValue;
      if (typeof value === 'boolean') return value;
      return value.toLowerCase() !== 'false';
    });

const requiredString = (name: string) =>
  z
    .string({ required_error: `${name} is required` })
    .min(1, `${name} is required`);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: requiredString('DATABASE_URL'),

  REDIS_URL: requiredString('REDIS_URL').refine(
    (value) => /^rediss?:\/\//.test(value),
    'REDIS_URL must start with redis:// or rediss://',
  ),

  JWT_ACCESS_SECRET: requiredString('JWT_ACCESS_SECRET').min(
    32,
    'JWT_ACCESS_SECRET must be at least 32 characters',
  ),
  JWT_REFRESH_SECRET: requiredString('JWT_REFRESH_SECRET').min(
    32,
    'JWT_REFRESH_SECRET must be at least 32 characters',
  ),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  WEB_URL: requiredString('WEB_URL'),

  S3_ENDPOINT: requiredString('S3_ENDPOINT'),
  S3_REGION: requiredString('S3_REGION'),
  S3_BUCKET: requiredString('S3_BUCKET'),
  S3_ACCESS_KEY: requiredString('S3_ACCESS_KEY'),
  S3_SECRET_KEY: requiredString('S3_SECRET_KEY'),
  S3_FORCE_PATH_STYLE: booleanFromEnv(true),

  CDN_BASE_URL: z.string().optional(),
});

/**
 * passthrough: giữ lại các biến chưa khai báo ở đây (APP_URL, DATABASE_TEST_URL,
 * key provider ngoài…) thay vì để zod strip mất khỏi config đã validate.
 */
const envSchemaWithPassthrough = envSchema.passthrough();

export type Env = z.infer<typeof envSchema>;

/**
 * Dùng làm `validate` cho ConfigModule.forRoot — app crash ngay lúc boot
 * kèm danh sách đầy đủ biến thiếu/sai thay vì chạy với giá trị mặc định ngầm.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchemaWithPassthrough.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return result.data;
}
