import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
// Load environment variables from .env file
dotenv.config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
async function main() {
  // Create a developer user if not exists
  const developer = await prisma.users.findFirst({ where: { username: 'developer' } });
  if (!developer) {
    const passwordHash = await bcrypt.hash('Ahmed123*', 10);
    await prisma.users.create({ data: { fullname: 'Developer User', username: 'developer', password: passwordHash, role: 'DEVELOPER' } });
  }
  console.log('Seed data created.');
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  }).finally(async () => { await prisma.$disconnect(); });