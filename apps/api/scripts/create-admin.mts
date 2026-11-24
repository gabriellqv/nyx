import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const email = process.env.NYX_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.NYX_ADMIN_PASSWORD;
const name = process.env.NYX_ADMIN_NAME?.trim() || 'NYX Administrator';

if (!email || !password) {
  console.error('NYX_ADMIN_EMAIL and NYX_ADMIN_PASSWORD are required');
  process.exit(1);
}

if (password.length < 12) {
  console.error('NYX_ADMIN_PASSWORD must contain at least 12 characters');
  process.exit(1);
}

const prisma = new PrismaClient();

async function createAdmin() {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error(`A user with email ${email} already exists`);
  }

  await prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      name,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'admin',
      customerId: null,
    },
  });

  console.log(`Administrator ${email} created successfully`);
}

createAdmin()
  .catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
