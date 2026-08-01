export const MIN_BOOTSTRAP_PASSWORD_LENGTH = 12;

/**
 * Mật khẩu demo chỉ dùng cho local/staging. Production bắt buộc truyền env,
 * không bao giờ được rơi về giá trị nằm sẵn trong repo.
 */
const SEED_PASSWORD_FALLBACKS: Record<string, string> = {
  SEED_ADMIN_PASSWORD: 'Admin@123456',
  SEED_STORE_PASSWORD: 'Store@123456',
};

type Env = Record<string, string | undefined>;

export function resolveSeedPassword(varName: string, env: Env): string {
  const value = env[varName];
  if (value) return value;

  const fallback = SEED_PASSWORD_FALLBACKS[varName];
  if (!fallback) {
    throw new Error(`Unknown seed password variable: ${varName}`);
  }

  if (env.NODE_ENV === 'production') {
    throw new Error(
      `${varName} must be set in production — refusing to seed a default password. ` +
        `Dùng "prisma:bootstrap" cho production thay vì seed dữ liệu demo.`,
    );
  }

  return fallback;
}

export interface BootstrapCredentials {
  email: string;
  password: string;
  organizationName: string;
  organizationSlug: string;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      // đ/Đ là chữ cái riêng, NFD không tách được nên phải thay tay —
      // nếu bỏ qua thì "Đường" ra "uong" thay vì "duong".
      .replace(/đ/g, 'd')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

/**
 * Production không có endpoint đăng ký công khai nên tài khoản ORG_ADMIN đầu tiên
 * phải tạo bằng script này, credential lấy từ env chứ không hardcode.
 */
export function requireBootstrapCredentials(env: Env): BootstrapCredentials {
  const email = env.BOOTSTRAP_ADMIN_EMAIL;
  if (!email) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL is required');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`BOOTSTRAP_ADMIN_EMAIL is not a valid email: ${email}`);
  }

  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD is required');
  }
  if (password.length < MIN_BOOTSTRAP_PASSWORD_LENGTH) {
    throw new Error(
      `BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_BOOTSTRAP_PASSWORD_LENGTH} characters`,
    );
  }

  const organizationName = env.BOOTSTRAP_ORG_NAME || 'Cafe Music';
  const organizationSlug = env.BOOTSTRAP_ORG_SLUG || slugify(organizationName);

  return { email, password, organizationName, organizationSlug };
}
