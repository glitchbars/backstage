import { PrismaClient } from '@prisma/client';
import { PrismaPlanetScale } from '@prisma/adapter-planetscale';
import { Client } from '@planetscale/database';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const client = new Client({ url: process.env.DATABASE_URL });
  const adapter = new PrismaPlanetScale(client);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
