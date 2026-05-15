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
  // Create a sample company if not exists
  let company = await prisma.companies.findFirst({ where: { name: 'Syndic' } });
  if (!company) {
    company = await prisma.companies.create({
      data: {
        name: 'Syndic',
        logo_url: '',
        url: 'http://axiasyndic.gloulougroupe.com',
        database_schema: 'public',
      },
    });
  }

  // Create a developer user if not exists
  const developer = await prisma.users.findFirst({ where: { username: 'developer' } });
  if (!developer) {
    const passwordHash = await bcrypt.hash('Ahmed123*', 10);
    await prisma.users.create({
      data: {
        fullname: 'Developer User',
        username: 'developer',
        password: passwordHash,
        role: 'DEVELOPER',
        company_id: company.id,
      },
    });
  }

  // Create an admin user for the company if not exists
  const admin = await prisma.users.findFirst({ where: { username: 'adminSyndic' } });
  if (!admin) {
    const adminPassword = await bcrypt.hash('12345678', 10);
    await prisma.users.create({
      data: {
        fullname: 'Admin SYndic',
        username: 'adminSyndic',
        password: adminPassword,
        role: 'ADMIN',
        company_id: company.id,
      },
    });
  }

  console.log('Seed data created.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });