import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { requireBootstrapCredentials } from '../src/database/seed-credentials';

const prisma = new PrismaClient();

/**
 * Tạo tổ chức + tài khoản ORG_ADMIN đầu tiên cho production.
 *
 * Backend không có endpoint đăng ký công khai (chỉ `login`/`refresh`), tạo user
 * qua `POST /users` lại đòi sẵn một ORG_ADMIN — nên tài khoản đầu tiên phải sinh
 * từ script này. Khác `seed.ts` ở chỗ không tạo bất kỳ dữ liệu demo nào
 * (store, sync group); store/user thật do admin tự tạo trên dashboard.
 *
 * Chạy một lần sau lần deploy đầu:
 *   BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... pnpm prisma:bootstrap
 *
 * Idempotent: chạy lại không tạo trùng và không đổi mật khẩu đang dùng.
 */
async function main() {
  const credentials = requireBootstrapCredentials(process.env);

  const organization = await prisma.organization.upsert({
    where: { slug: credentials.organizationSlug },
    update: {},
    create: {
      name: credentials.organizationName,
      slug: credentials.organizationSlug,
    },
  });

  const existing = await prisma.user.findUnique({
    where: { email: credentials.email },
  });

  if (existing) {
    console.log(
      `Admin ${credentials.email} đã tồn tại — không thay đổi gì (mật khẩu giữ nguyên).`,
    );
    return;
  }

  const admin = await prisma.user.create({
    data: {
      email: credentials.email,
      passwordHash: await bcrypt.hash(credentials.password, 10),
      name: 'Org Admin',
      role: 'ORG_ADMIN',
      organizationId: organization.id,
    },
  });

  console.log('Bootstrap hoàn tất.');
  console.log(`  Organization: ${organization.name} (${organization.slug})`);
  console.log(`  ORG_ADMIN:    ${admin.email}`);
  console.log('');
  console.log(
    'Đăng nhập rồi tạo store/user thật trên dashboard, sau đó xoá 2 biến ' +
      'BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD khỏi environment.',
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
