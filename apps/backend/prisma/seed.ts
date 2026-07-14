import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const SALT_ROUNDS = 10;

  const org = await prisma.organization.upsert({
    where: { slug: 'cafe-music-demo' },
    update: {},
    create: {
      name: 'Cafe Music Demo',
      slug: 'cafe-music-demo',
    },
  });

  console.log('Organization:', org.name);

  const orgAdmin = await prisma.user.upsert({
    where: { email: 'admin@cafe.com' },
    update: {},
    create: {
      email: 'admin@cafe.com',
      passwordHash: await bcrypt.hash('Admin@123456', SALT_ROUNDS),
      name: 'Org Admin',
      role: 'ORG_ADMIN',
      organizationId: org.id,
    },
  });

  console.log('Org Admin:', orgAdmin.email);

  const syncGroup = await prisma.syncGroup.upsert({
    where: { id: 'sync-group-main' },
    update: {},
    create: {
      id: 'sync-group-main',
      name: 'Main Sync Group',
      organizationId: org.id,
      mode: 'LOOSE',
    },
  });

  const storeData = [
    { name: 'Store 1 - Downtown', email: 'store1@cafe.com' },
    { name: 'Store 2 - Uptown', email: 'store2@cafe.com' },
    { name: 'Store 3 - Suburb', email: 'store3@cafe.com' },
  ];

  for (const s of storeData) {
    const store = await prisma.store.upsert({
      where: { id: `store-${storeData.indexOf(s) + 1}` },
      update: {},
      create: {
        id: `store-${storeData.indexOf(s) + 1}`,
        name: s.name,
        organizationId: org.id,
        syncGroupId: syncGroup.id,
      },
    });

    await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        passwordHash: await bcrypt.hash('Store@123456', SALT_ROUNDS),
        name: `Admin ${s.name}`,
        role: 'STORE_ADMIN',
        organizationId: org.id,
        storeId: store.id,
      },
    });

    console.log('Store seeded:', store.name);
  }

  console.log('Seed complete!');
  console.log('');
  console.log('Login credentials:');
  console.log('  ORG_ADMIN:   admin@cafe.com   / Admin@123456');
  console.log('  STORE_ADMIN: store1@cafe.com  / Store@123456');
  console.log('  STORE_ADMIN: store2@cafe.com  / Store@123456');
  console.log('  STORE_ADMIN: store3@cafe.com  / Store@123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
