import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/require-admin';

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const { searchParams } = request.nextUrl;
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(searchParams.get('pageSize') ?? 20)));
  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    prisma.bar.findMany({
      skip,
      take: pageSize,
      include: { address: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.bar.count(),
  ]);

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (guard.error) return guard.error;

  const body = await request.json();
  const {
    name,
    streetAddress,
    streetAddress2,
    postalCode,
    city,
    region,
    countryCode,
    phoneNumber,
  } = body;

  const bar = await prisma.$transaction(async (tx) => {
    const address = await tx.address.create({
      data: { streetAddress, streetAddress2, postalCode, city, region, countryCode, phoneNumber },
    });
    return tx.bar.create({ data: { name, addressId: address.id }, include: { address: true } });
  });

  return NextResponse.json(bar, { status: 201 });
}
